import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readSettingsFile(path) {
  try {
    const source = readFileSync(path, "utf8");
    return { source, value: JSON.parse(source) };
  } catch (error) {
    throw new Error(
      `Cannot read spelling configuration ${path}: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

export function spellingConfigPath(options = {}) {
  const value = options.spellcheckConfig;
  if (value === undefined || value === null) {
    return resolve("spellcheck.json");
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("spellcheckConfig must be a nonempty file path.");
  }
  return value.trimStart().startsWith("{") ? undefined : resolve(value);
}

export function loadSettings(options = {}) {
  if (
    options.spellcheck !== undefined &&
    typeof options.spellcheck !== "boolean"
  ) {
    throw new Error(
      "spellcheck must be a boolean; use defineConfig for nested settings.",
    );
  }
  if (options.spellcheck === false) {
    return spellingSettings(false);
  }
  const path = spellingConfigPath(options);
  let value;
  if (path) {
    if (options.spellcheckConfig != null || existsSync(path)) {
      value = readSettingsFile(path).value;
    }
  } else {
    value = options.spellcheckConfig;
  }
  const settings = spellingSettings(value);
  return options.spellcheck === true
    ? { ...settings, enabled: true }
    : settings;
}

export function spellingSettings(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid spellcheck JSON: ${error.message}`, {
        cause: error,
      });
    }
  }
  if (value === undefined || value === true) {
    value = {};
  } else if (value === false) {
    value = { enabled: false };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("spellcheck must be an object or boolean.");
  }
  for (const key of Object.keys(value)) {
    if (
      ![
        "enabled",
        "autocorrect",
        "dictionaries",
        "frontMatter",
        "code",
      ].includes(key)
    ) {
      throw new Error(`Unknown spellcheck option: ${key}.`);
    }
  }
  for (const key of ["enabled", "autocorrect"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      throw new Error(`spellcheck.${key} must be a boolean.`);
    }
  }
  const dictionaries =
    value.dictionaries === undefined
      ? ["@cspell/dict-en_us"]
      : value.dictionaries;
  if (
    !Array.isArray(dictionaries) ||
    !dictionaries.length ||
    dictionaries.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(
      "spellcheck.dictionaries must be a nonempty array of dictionary packages or .txt paths.",
    );
  }
  const frontMatter =
    value.frontMatter === undefined || value.frontMatter === true
      ? {}
      : value.frontMatter;
  if (frontMatter !== false) {
    if (
      !frontMatter ||
      typeof frontMatter !== "object" ||
      Array.isArray(frontMatter)
    ) {
      throw new Error("spellcheck.frontMatter must be a boolean or an object.");
    }
    for (const [key, paths] of Object.entries(frontMatter)) {
      if (
        !["include", "exclude"].includes(key) ||
        !Array.isArray(paths) ||
        paths.some(
          (path) =>
            typeof path !== "string" ||
            !path ||
            path.split(".").some((part) => !part),
        )
      ) {
        throw new Error(
          "spellcheck.frontMatter include/exclude must be arrays of dotted field paths.",
        );
      }
    }
  }
  const code =
    value.code === undefined || value.code === true ? {} : value.code;
  if (code !== false) {
    if (!code || typeof code !== "object" || Array.isArray(code)) {
      throw new Error("spellcheck.code must be a boolean or an object.");
    }
    for (const [key, enabled] of Object.entries(code)) {
      if (
        !["comments", "jsx", "strings", "identifiers", "fences"].includes(
          key,
        ) ||
        typeof enabled !== "boolean"
      ) {
        throw new Error(
          "spellcheck.code supports boolean comments, jsx, strings, identifiers, and fences settings.",
        );
      }
    }
  }
  return {
    enabled: value.enabled !== false,
    autocorrect: value.autocorrect === true,
    dictionaries,
    frontMatter,
    code: {
      comments: code !== false && code.comments !== false,
      jsx: code !== false && code.jsx !== false,
      strings: code !== false && code.strings === true,
      identifiers: code !== false && code.identifiers === true,
      fences: code !== false && code.fences === true,
    },
  };
}
