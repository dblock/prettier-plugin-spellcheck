import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
    if (key !== "dictionaries") {
      throw new Error(`Unknown spelling configuration option: ${key}.`);
    }
  }
  const dictionaries = settings.dictionaries;
  if (
    dictionaries &&
    typeof dictionaries === "object" &&
    !Array.isArray(dictionaries)
  ) {
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
