#!/usr/bin/env node

import { glob } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { getFileInfo, resolveConfig } from "prettier";
import { loadSettings } from "./configuration.mjs";
import { checkSource } from "./spelling.mjs";

const usage = `Usage: prettier-plugin-spellcheck collect <globs...> [--output .spellcheck.txt] [--config spelling.json]
       prettier-plugin-spellcheck add <dictionary.txt> [--config .spellcheck.json] [--language en]`;

async function collect(patterns, values) {
  if (!values.output.trim()) {
    throw new Error("--output must be a nonempty file path.");
  }
  const words = new Set();
  let matched = 0;
  for await (const file of glob(patterns, {
    exclude: ["**/node_modules/**", "**/.git/**"],
  })) {
    const info = await getFileInfo(file, {
      ignorePath: [".gitignore", ".prettierignore"],
    });
    if (info.ignored || info.inferredParser !== "markdown") {
      continue;
    }
    matched++;
    const config = (await resolveConfig(file, { editorconfig: true })) || {};
    if (config.spellcheck === false) {
      continue;
    }
    const settings = loadSettings(values.config ?? config.spellcheckConfig);
    for (const error of checkSource(readFileSync(file, "utf8"), settings, {
      suggestions: false,
    })) {
      const match = /^Misspelled word: "([^"]+)"\./u.exec(error.errorDetail);
      if (!match) {
        throw new Error(
          `Cannot collect spelling candidate: ${error.errorDetail}`,
        );
      }
      words.add(match[1]);
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

function add(files, values) {
  if (files.length !== 1 || !files[0].endsWith(".txt")) {
    throw new Error(usage);
  }
  const configPath = values.config ?? ".spellcheck.json";
  if (!configPath.endsWith(".json")) {
    throw new Error("add supports .json spelling configuration files only.");
  }
  const path = resolve(files[0]);
  checkSource(
    "",
    { dictionaries: { project: [path] } },
    { suggestions: false },
  );
  const exists = existsSync(configPath);
  if (exists) {
    loadSettings(configPath);
  }
  const settings = exists ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const dictionaries = settings.dictionaries ?? { en: ["@cspell/dict-en_us"] };
  const entries = dictionaries[values.language] ?? [];
  const base = dirname(resolve(configPath));
  const relativePath = relative(base, path).split(sep).join("/");
  const entry = relativePath.startsWith(".")
    ? relativePath
    : `./${relativePath}`;
  settings.dictionaries = {
    ...dictionaries,
    [values.language]: entries.some(
      (name) => name.endsWith(".txt") && resolve(base, name) === path,
    )
      ? entries
      : [...entries, entry],
  };
  writeFileSync(configPath, `${JSON.stringify(settings, null, 2)}\n`, {
    flag: exists ? "w" : "wx",
  });
  console.log(
    `Added ${entry} to ${configPath}. Set spellcheckConfig to this file in your Prettier configuration.`,
  );
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", default: ".spellcheck.txt" },
      language: { type: "string", default: "en" },
      config: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usage);
  } else {
    if (!values.language.trim()) {
      throw new Error("--language must be nonempty.");
    }
    const [command, ...patterns] = positionals;
    if (command === "collect" && patterns.length) {
      await collect(patterns, values);
    } else if (command === "add") {
      add(patterns, values);
    } else {
      throw new Error(usage);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
