import {
  accessSync,
  closeSync,
  constants,
  fchmodSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { createSpellingDictionary } from "cspell-dictionary";
import { normalizeApostrophes, vocabularyWords } from "./dictionaries.mjs";

const header =
  "# Review these candidates: remove typos before using this dictionary.";

export function vocabularySnapshot(file) {
  if (!file.endsWith(".txt")) {
    throw new Error("--refresh requires an existing .txt vocabulary output.");
  }
  const stat = lstatSync(file);
  if (!stat.isFile()) {
    throw new Error(
      "--refresh requires a regular file, not a symbolic link or directory.",
    );
  }
  const source = readFileSync(file, "utf8");
  return { source, stat, words: vocabularyWords(source, file) };
}

function refreshedSource(words, snapshot) {
  const dictionary = createSpellingDictionary(
    snapshot.words,
    "previous-vocabulary",
    "previous-vocabulary",
    { caseSensitive: true },
  );
  const retained = new Set();
  const added = new Set();
  for (const word of words) {
    const found =
      dictionary.find(word, { ignoreCase: false }) ||
      dictionary.find(normalizeApostrophes(word), { ignoreCase: false });
    if (found) retained.add(found.found);
    else added.add(word);
  }
  const bom = snapshot.source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const lines = snapshot.source
    .slice(bom.length)
    .split(/\r\n|\r|\n/u)
    .filter((line) => {
      const word = line.trim();
      return !word || word.startsWith("#") || retained.delete(word);
    });
  while (lines.at(-1)?.trim() === "") lines.pop();
  const ending = /\r\n|\r|\n/u.exec(snapshot.source)?.[0] || "\n";
  return bom + [...lines, ...[...added].sort(), ""].join(ending);
}

export function writeCandidates(file, words, snapshot) {
  if (!snapshot) {
    writeFileSync(file, [header, ...[...words].sort(), ""].join("\n"), {
      flag: "wx",
    });
    return;
  }
  const source = refreshedSource(words, snapshot);
  const temporary = join(
    dirname(resolve(file)),
    `.${basename(file)}.${randomUUID()}.tmp`,
  );
  let created = false;
  try {
    const descriptor = openSync(temporary, "wx", snapshot.stat.mode & 0o777);
    created = true;
    try {
      fchmodSync(descriptor, snapshot.stat.mode & 0o777);
      writeFileSync(descriptor, source, { flush: true });
    } finally {
      closeSync(descriptor);
    }
    const current = lstatSync(file);
    if (
      !current.isFile() ||
      current.dev !== snapshot.stat.dev ||
      current.ino !== snapshot.stat.ino ||
      current.mode !== snapshot.stat.mode ||
      current.mtimeMs !== snapshot.stat.mtimeMs ||
      readFileSync(file, "utf8") !== snapshot.source
    ) {
      throw new Error(
        "Vocabulary changed during collection; no changes written.",
      );
    }
    accessSync(file, constants.W_OK);
    renameSync(temporary, file);
    created = false;
  } finally {
    if (created) unlinkSync(temporary);
  }
}
