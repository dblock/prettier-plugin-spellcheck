import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";
import { parsers } from "prettier/plugins/babel";
import {
  loadSettings,
  readSettingsFile,
  spellingConfigPath,
  spellingSettings,
} from "./configuration.mjs";

function property(object, key) {
  if (
    object.type !== "ObjectExpression" ||
    object.properties.some(
      (entry) => entry.type !== "ObjectProperty" || entry.computed,
    )
  ) {
    throw new Error(
      "add requires static object properties; edit dynamic configurations manually.",
    );
  }
  const found = object.properties.filter(
    (entry) => (entry.key.name ?? entry.key.value) === key,
  );
  if (found.length > 1) {
    throw new Error(`Duplicate configuration property: ${key}.`);
  }
  return found[0];
}

function insertProperty(source, object, value) {
  const last = object.properties.at(-1);
  const offset = last ? last.end : object.start + 1;
  return (
    source.slice(0, offset) +
    (last ? "," : "") +
    `\n${value}\n` +
    source.slice(offset)
  );
}

async function writeConfiguration(file, original, source, options, parser) {
  const result = await format(source, {
    ...options,
    parser,
    spellcheck: false,
  });
  if (original !== undefined && readFileSync(file, "utf8") !== original) {
    throw new Error(
      "Spelling configuration changed while adding the dictionary; no changes written.",
    );
  }
  writeFileSync(file, result, { flag: original === undefined ? "wx" : "w" });
}

function includesDictionary(settings, path) {
  return settings.dictionaries.some(
    (name) => name.endsWith(".txt") && resolve(name) === path,
  );
}

function requireEnabled(settings) {
  if (!settings.enabled) {
    throw new Error(
      "spellcheck is disabled; enable it before adding a dictionary.",
    );
  }
}

export async function addDictionary(file, dictionary) {
  const path = resolve(dictionary);
  const relativePath = relative(process.cwd(), path).split(sep).join("/");
  const entry = relativePath.startsWith(".")
    ? relativePath
    : `./${relativePath}`;
  let original;
  let formatting = {};
  if (file) {
    original = readFileSync(file, "utf8");
    const config = /\.(?:mjs|js|cjs)$/u.test(file)
      ? (await import(pathToFileURL(resolve(file)).href)).default
      : await resolveConfig(file, { config: resolve(file) });
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Prettier configuration must export an object.");
    }
    formatting = { ...config };
    delete formatting.overrides;
  }
  const external = spellingConfigPath(formatting);
  if (external) {
    const existing = existsSync(external)
      ? readSettingsFile(external)
      : { source: undefined, value: {} };
    const settings = loadSettings({
      ...formatting,
      spellcheckConfig: JSON.stringify(spellingSettings(existing.value)),
    });
    requireEnabled(settings);
    if (includesDictionary(settings, path)) {
      return { changed: false, entry, file: external };
    }
    const source = JSON.stringify({
      ...existing.value,
      dictionaries: [...settings.dictionaries, entry],
    });
    await writeConfiguration(
      external,
      existing.source,
      source,
      formatting,
      "json",
    );
    return { changed: true, entry, file: external };
  }
  const settings = loadSettings(formatting);
  requireEnabled(settings);
  if (includesDictionary(settings, path)) {
    return { changed: false, entry, file };
  }
  if (!/\.(?:mjs|js)$/u.test(file)) {
    throw new Error(
      "add supports static JavaScript defineConfig(...) or external spellcheckConfig files.",
    );
  }
  const ast = await parsers.babel.parse(original, { parser: "babel" });
  const exported = ast.program.body.find(
    (node) => node.type === "ExportDefaultDeclaration",
  );
  const call = exported?.declaration;
  if (
    call?.type !== "CallExpression" ||
    call.callee.name !== "defineConfig" ||
    call.arguments.length !== 1 ||
    call.arguments[0].type !== "ObjectExpression"
  ) {
    throw new Error(
      "add requires export default defineConfig({...}); edit dynamic configurations manually.",
    );
  }
  const root = call.arguments[0];
  const spelling = property(root, "spellcheck");
  if (!spelling) {
    throw new Error("Inline spellcheck settings must be a static object.");
  }
  const entries = [...settings.dictionaries, entry];
  const dictionaries = property(spelling.value, "dictionaries");
  let source;
  if (!dictionaries) {
    source = insertProperty(
      original,
      spelling.value,
      `dictionaries: ${JSON.stringify(entries)}`,
    );
  } else {
    const array = dictionaries.value;
    if (
      array.type !== "ArrayExpression" ||
      array.elements.some((element) => element?.type !== "StringLiteral")
    ) {
      throw new Error(
        "add requires a static dictionaries array; edit dynamic configurations manually.",
      );
    }
    const offset = array.elements.at(-1).end;
    source =
      original.slice(0, offset) +
      `, ${JSON.stringify(entry)}` +
      original.slice(offset);
  }
  await writeConfiguration(file, original, source, formatting, "babel");
  return { changed: true, entry, file };
}
