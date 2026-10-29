#!/usr/bin/env node

import { glob, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { getFileInfo, resolveConfig, resolveConfigFile } from "prettier";
import { checkSource } from "./spelling.mjs";
import { getDictionary, isDictionaryFile } from "./dictionaries.mjs";
import { addDictionary } from "./update-config.mjs";
import { loadSettings } from "./configuration.mjs";
import { codeParsers } from "./code.mjs";
import plugin from "./index.mjs";
import { textParser } from "./text.mjs";
import { vocabularySnapshot, writeCandidates } from "./vocabulary.mjs";

const usage = `Usage: prettier-plugin-spellcheck collect <globs...> [--output .spellcheck.txt] [--refresh] [--config prettier.config.mjs]
       prettier-plugin-spellcheck add <dictionary.txt> [--config prettier.config.mjs]`;

async function collect(patterns, values) {
  if (!values.output.trim()) {
    throw new Error("--output must be a nonempty file path.");
  }
  const snapshot = values.refresh
    ? vocabularySnapshot(values.output)
    : undefined;
  const words = new Set();
  let matched = 0;
  for await (const file of glob(patterns, {
    exclude: ["**/node_modules/**", "**/.git/**"],
  })) {
    if (
      resolve(file) === resolve(values.output) ||
      isDictionaryFile([values.output], file)
    ) {
      continue;
    }
    if (!(await stat(file)).isFile()) {
      continue;
    }
    const info = await getFileInfo(file, {
      ignorePath: [".gitignore", ".prettierignore"],
      resolveConfig: false,
      plugins: [plugin],
    });
    if (info.ignored) {
      continue;
    }
    const config =
      (await resolveConfig(file, {
        editorconfig: true,
        ...(values.config ? { config: resolve(values.config) } : {}),
      })) || {};
    const parser = config.parser ?? info.inferredParser;
    if (
      !["markdown", textParser].includes(parser) &&
      !Object.hasOwn(codeParsers, parser)
    ) {
      continue;
    }
    const settings = loadSettings(config);
    if (isDictionaryFile(settings.dictionaries, file)) continue;
    if (
      values.refresh &&
      (!settings.enabled ||
        (Object.hasOwn(codeParsers, parser) &&
          !["comments", "jsx", "strings", "identifiers"].some(
            (scope) => settings.code[scope],
          )))
    ) {
      continue;
    }
    matched++;
    for (const issue of await checkSource(
      readFileSync(file, "utf8"),
      settings,
      {
        ...config,
        parser,
        filepath: resolve(file),
        suggestions: false,
        excludeDictionaries: values.refresh ? [resolve(values.output)] : [],
      },
    )) {
      words.add(issue.word);
    }
  }
  if (!matched) {
    throw new Error(
      values.refresh
        ? "No enabled spelling inputs matched; vocabulary was not refreshed."
        : "No non-ignored Markdown, plain-text, or supported code files matched the supplied patterns.",
    );
  }
  writeCandidates(values.output, words, snapshot);
  console.log(
    values.refresh
      ? `Refreshed ${values.output} from ${words.size} candidate words. Review before using this dictionary.`
      : `Created ${values.output} with ${words.size} candidate words. Review before adding it to dictionaries.`,
  );
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", default: ".spellcheck.txt" },
      config: { type: "string" },
      refresh: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.config !== undefined && !values.config.trim()) {
    throw new Error("--config must be a nonempty file path.");
  }
  if (values.refresh && positionals[0] !== "collect") {
    throw new Error("--refresh is only supported by collect.");
  }
  if (values.help) {
    console.log(usage);
  } else {
    const [command, ...patterns] = positionals;
    if (command === "collect" && patterns.length) {
      await collect(patterns, values);
    } else if (
      command === "add" &&
      patterns.length === 1 &&
      patterns[0].endsWith(".txt")
    ) {
      getDictionary([resolve(patterns[0])]);
      const configFile = values.config ?? (await resolveConfigFile());
      const { changed, entry, file } = await addDictionary(
        configFile,
        patterns[0],
      );
      console.log(
        `${changed ? "Added" : "Already registered"} ${entry} in ${file}.`,
      );
    } else {
      throw new Error(usage);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
