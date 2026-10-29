#!/usr/bin/env node

import { glob, stat } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { getFileInfo, resolveConfig, resolveConfigFile } from "prettier";
import { checkSource } from "./spelling.mjs";
import { getDictionary } from "./dictionaries.mjs";
import { addDictionary } from "./update-config.mjs";
import { loadSettings } from "./configuration.mjs";

const usage = `Usage: prettier-plugin-spellcheck collect <globs...> [--output .spellcheck.txt] [--config prettier.config.mjs]
       prettier-plugin-spellcheck add <dictionary.txt> [--config prettier.config.mjs]`;

async function collect(patterns, values) {
  if (!values.output.trim()) {
    throw new Error("--output must be a nonempty file path.");
  }
  const words = new Set();
  let matched = 0;
  for await (const file of glob(patterns, {
    exclude: ["**/node_modules/**", "**/.git/**"],
  })) {
    if (!(await stat(file)).isFile()) {
      continue;
    }
    const info = await getFileInfo(file, {
      ignorePath: [".gitignore", ".prettierignore"],
      resolveConfig: false,
    });
    if (info.ignored) {
      continue;
    }
    const config =
      (await resolveConfig(file, {
        editorconfig: true,
        ...(values.config ? { config: resolve(values.config) } : {}),
      })) || {};
    if ((config.parser ?? info.inferredParser) !== "markdown") {
      continue;
    }
    matched++;
    for (const issue of await checkSource(
      readFileSync(file, "utf8"),
      loadSettings(config),
      {
        suggestions: false,
      },
    )) {
      words.add(issue.word);
    }
  }
  if (!matched) {
    throw new Error(
      "No non-ignored Markdown files matched the supplied patterns.",
    );
  }
  writeFileSync(
    values.output,
    [
      "# Review these candidates: remove typos before using this dictionary.",
      ...[...words].sort(),
      "",
    ].join("\n"),
    { flag: "wx" },
  );
  console.log(
    `Created ${values.output} with ${words.size} candidate words. Review before adding it to dictionaries.`,
  );
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", default: ".spellcheck.txt" },
      config: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.config !== undefined && !values.config.trim()) {
    throw new Error("--config must be a nonempty file path.");
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
