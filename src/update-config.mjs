import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "prettier";
import { parsers } from "prettier/plugins/babel";
import { spellingSettings } from "./configuration.mjs";

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

export async function addDictionary(file, dictionary) {
  if (!/\.(?:mjs|js)$/u.test(file)) {
    throw new Error(
      "add supports static JavaScript defineConfig(...) configurations only.",
    );
  }
  const path = resolve(dictionary);
  const relativePath = relative(process.cwd(), path).split(sep).join("/");
  const entry = relativePath.startsWith(".")
    ? relativePath
    : `./${relativePath}`;
  const exists = existsSync(file);
  const original = exists ? readFileSync(file, "utf8") : "";
  let source;
  let formatting = {};
  if (exists) {
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
    const config = (await import(pathToFileURL(resolve(file)).href)).default;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Prettier configuration must export an object.");
    }
    formatting = { ...config };
    delete formatting.overrides;
    const settings = spellingSettings(formatting.spellcheck);
    if (!settings.enabled) {
      throw new Error(
        "spellcheck is disabled; enable it before adding a dictionary.",
      );
    }
    if (
      settings.dictionaries.some(
        (name) => name.endsWith(".txt") && resolve(name) === path,
      )
    ) {
      return { changed: false, entry };
    }
    const entries = [...settings.dictionaries, entry];
    if (!spelling) {
      source = insertProperty(
        original,
        root,
        `spellcheck: ${JSON.stringify({ dictionaries: entries })}`,
      );
    } else if (
      spelling.value.type === "BooleanLiteral" &&
      spelling.value.value
    ) {
      source =
        original.slice(0, spelling.value.start) +
        JSON.stringify({ dictionaries: entries }) +
        original.slice(spelling.value.end);
    } else {
      const dictionaries = property(spelling.value, "dictionaries");
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
    }
  } else {
    source = `import { defineConfig } from "prettier-plugin-spellcheck";\n\nexport default defineConfig({ spellcheck: ${JSON.stringify(
      {
        dictionaries: ["@cspell/dict-en_us", entry],
      },
    )} });\n`;
  }
  const result = await format(source, { ...formatting, parser: "babel" });
  if (exists && readFileSync(file, "utf8") !== original) {
    throw new Error(
      "Prettier configuration changed while adding the dictionary; no changes written.",
    );
  }
  writeFileSync(file, result, { flag: exists ? "w" : "wx" });
  return { changed: true, entry };
}
