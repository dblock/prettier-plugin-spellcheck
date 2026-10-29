import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  createCollection,
  createSpellingDictionary,
  createSpellingDictionaryFromTrieFile,
} from "cspell-dictionary";

const require = createRequire(import.meta.url);
const packages = new Map();
const suggestions = new WeakMap();
export const wordOnly = /^\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*$/u;

function vocabulary(path) {
  return readFileSync(path, "utf8")
    .split(/\r\n|\r|\n/u)
    .flatMap((line, index) => {
      const word = line.trim();
      if (!word || word.startsWith("#")) {
        return [];
      }
      if (!wordOnly.test(word)) {
        throw new Error(
          `Invalid vocabulary word at ${path}:${index + 1}: ${word}`,
        );
      }
      return [word];
    });
}

function load(entry) {
  if (entry.endsWith(".txt")) {
    const path = resolve(entry);
    return [
      createSpellingDictionary(vocabulary(path), path, path, {
        caseSensitive: true,
      }),
    ];
  }
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/u.test(entry)) {
    throw new Error(
      `Invalid dictionary package: ${entry}. Use a package name or .txt file.`,
    );
  }
  const projectRequire = createRequire(resolve("package.json"));
  const configPath = (
    entry === "@cspell/dict-en_us" ? require : projectRequire
  ).resolve(entry);
  if (!packages.has(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (
      !Array.isArray(config.dictionaryDefinitions) ||
      !config.dictionaryDefinitions.length
    ) {
      throw new Error(`No dictionary definitions in ${configPath}.`);
    }
    packages.set(
      configPath,
      config.dictionaryDefinitions.map((definition) => {
        if (
          typeof definition?.name !== "string" ||
          typeof definition.path !== "string"
        ) {
          throw new Error(`Invalid dictionary definition in ${configPath}.`);
        }
        const path = resolve(dirname(configPath), definition.path);
        if (!/\.(?:trie|txt)(?:\.gz)?$/u.test(path)) {
          throw new Error(`Unsupported dictionary format: ${path}.`);
        }
        const bytes = readFileSync(path);
        const data = path.endsWith(".gz") ? gunzipSync(bytes) : bytes;
        return /\.trie(?:\.gz)?$/u.test(path)
          ? createSpellingDictionaryFromTrieFile(
              data,
              definition.name,
              path,
              definition,
            )
          : createSpellingDictionary(
              data.toString("utf8").split(/\r?\n/u),
              definition.name,
              path,
              definition,
            );
      }),
    );
  }
  return packages.get(configPath);
}

function suggest(dictionary, word) {
  let cache = suggestions.get(dictionary);
  if (!cache) {
    cache = new Map();
    suggestions.set(dictionary, cache);
  }
  if (!cache.has(word)) {
    if (cache.size >= 256) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(
      word,
      dictionary.suggest(word, {
        numSuggestions: 3,
        numChanges: 2,
        timeout: 100,
      }),
    );
  }
  return cache.get(word);
}

export function getDictionary(settings = {}) {
  const entries =
    settings.dictionaries === undefined
      ? { en: ["@cspell/dict-en_us"] }
      : settings.dictionaries;
  if (
    !entries ||
    typeof entries !== "object" ||
    Array.isArray(entries) ||
    !Object.keys(entries).length
  ) {
    throw new Error(
      "dictionaries must be a nonempty language-to-dictionary map.",
    );
  }
  for (const [language, names] of Object.entries(entries)) {
    if (
      !language.trim() ||
      !Array.isArray(names) ||
      !names.length ||
      names.some((name) => typeof name !== "string" || !name.trim())
    ) {
      throw new Error(
        `dictionaries.${language} must be a nonempty array of dictionary names or .txt paths.`,
      );
    }
  }
  const dictionaries = [...new Set(Object.values(entries).flat())].flatMap(
    load,
  );
  const collection = createCollection(dictionaries, "prettier-spellcheck");
  return {
    has: (word) => collection.has(word, { ignoreCase: false }),
    suggest: (word) => {
      // Rank individual results to retain each dictionary's weighted edit costs.
      const ranked = dictionaries
        .flatMap((dictionary) => suggest(dictionary, word))
        .sort((left, right) => left.cost - right.cost);
      return [...new Set(ranked.map((result) => result.word))]
        .filter(
          (candidate) =>
            !collection.isForbidden(candidate) &&
            !collection.isNoSuggestWord(candidate),
        )
        .slice(0, 3);
    },
  };
}
