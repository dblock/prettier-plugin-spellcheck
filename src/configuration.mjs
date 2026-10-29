import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function frontMatterOptions(settings) {
  const markdown = settings.markdown === undefined ? {} : settings.markdown;
  if (!markdown || typeof markdown !== "object" || Array.isArray(markdown)) {
    throw new Error("markdown must be an object.");
  }
  if (Object.keys(markdown).some((key) => key !== "frontMatter")) {
    throw new Error("Unknown markdown spelling option; expected frontMatter.");
  }
  const value = markdown.frontMatter;
  const config = value === undefined || value === true ? {} : value;
  if (config === false) {
    return false;
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("markdown.frontMatter must be a boolean or an object.");
  }
  for (const [key, paths] of Object.entries(config)) {
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
        "markdown.frontMatter include/exclude must be arrays of dotted field paths.",
      );
    }
  }
  return config;
}

export function loadSettings(file) {
  if (file === undefined) {
    return {};
  }
  if (typeof file !== "string" || !file.trim()) {
    throw new Error("spellcheckConfig must be a nonempty JSON file path.");
  }
  const path = resolve(file);
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read spelling configuration ${path}: ${error.message}`,
      {
        cause: error,
      },
    );
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`Spelling configuration ${path} must be a JSON object.`);
  }
  for (const key of Object.keys(settings)) {
    if (!["dictionaries", "markdown"].includes(key)) {
      throw new Error(`Unknown spelling configuration option: ${key}.`);
    }
    frontMatterOptions(settings);
  }
  const dictionaries = settings.dictionaries;
  if (
    dictionaries !== undefined &&
    (!dictionaries ||
      typeof dictionaries !== "object" ||
      Array.isArray(dictionaries) ||
      !Object.keys(dictionaries).length)
  ) {
    throw new Error(
      "dictionaries must be a nonempty language-to-dictionary map.",
    );
  }
  if (
    dictionaries &&
    typeof dictionaries === "object" &&
    !Array.isArray(dictionaries)
  ) {
    for (const [language, entries] of Object.entries(dictionaries)) {
      if (
        !language.trim() ||
        !Array.isArray(entries) ||
        !entries.length ||
        entries.some((entry) => typeof entry !== "string" || !entry.trim())
      ) {
        throw new Error(
          `dictionaries.${language} must be a nonempty array of dictionary names or .txt paths.`,
        );
      }
    }
    settings.dictionaries = Object.fromEntries(
      Object.entries(dictionaries).map(([language, entries]) => [
        language,
        Array.isArray(entries)
          ? entries.map((entry) =>
              typeof entry === "string" && entry.endsWith(".txt")
                ? resolve(dirname(path), entry)
                : entry,
            )
          : entries,
      ]),
    );
  }
  return settings;
}
