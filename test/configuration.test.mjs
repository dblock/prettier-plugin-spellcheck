import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as prettier from "prettier";
import * as plugin from "../src/index.mjs";

function fixture(t, settings) {
  const directory = mkdtempSync(join(tmpdir(), "prettier-spelling-config-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "spelling.json");
  writeFileSync(path, JSON.stringify(settings));
  return {
    directory,
    path,
    format: (source, options = {}) =>
      prettier.format(source, {
        parser: "markdown",
        plugins: [plugin],
        spellcheckConfig: path,
        ...options,
      }),
  };
}

test("resolves vocabulary relative to the spelling config and reloads edits", async (t) => {
  const { directory, format } = fixture(t, {
    dictionaries: { en: ["@cspell/dict-en_us", "./words.txt"] },
  });
  const words = join(directory, "words.txt");
  writeFileSync(words, "# Project vocabulary\nqzxwidget\n");
  assert.equal(await format("qzxwidget\n"), "qzxwidget\n");
  await assert.rejects(format("qzxcomponent\n"), /Misspelled word/u);
  writeFileSync(words, "qzxcomponent\n");
  assert.equal(await format("qzxcomponent\n"), "qzxcomponent\n");
  await assert.rejects(format("qzxwidget\n"), /Misspelled word/u);
});

test("uses installed language dictionaries together and honors explicit replacement", async (t) => {
  const { format, path } = fixture(t, {
    dictionaries: {
      en: ["@cspell/dict-en_us"],
      es: ["@cspell/dict-es-es"],
    },
  });
  assert.equal(await format("Hello mundo\n"), "Hello mundo\n");
  writeFileSync(
    path,
    JSON.stringify({ dictionaries: { project: ["./words.txt"] } }),
  );
  writeFileSync(join(path, "..", "words.txt"), "qzxwidget\n");
  await assert.rejects(format("hello\n"), /Misspelled word: "hello"/u);
});

test("accepts installed technical dictionaries", async (t) => {
  const { format } = fixture(t, {
    dictionaries: {
      en: ["@cspell/dict-en_us", "@cspell/dict-software-terms"],
    },
  });
  assert.equal(await format("webpack\n"), "webpack\n");
});

test("reports invalid JSON, unknown options and missing dictionary files explicitly", async (t) => {
  const { format, path } = fixture(t, {
    dictionaries: { en: ["./missing.txt"] },
  });
  await assert.rejects(format("hello\n"), /ENOENT.*missing\.txt/u);
  writeFileSync(path, "{");
  await assert.rejects(
    format("hello\n"),
    /Cannot read spelling configuration/u,
  );
  writeFileSync(path, JSON.stringify({ dictionaryFiles: ["./words.txt"] }));
  await assert.rejects(
    format("hello\n"),
    /Unknown spelling configuration option/u,
  );
  writeFileSync(path, "[]");
  await assert.rejects(format("hello\n"), /must be a JSON object/u);
});

test("rejects malformed dictionaries instead of silently using English", async (t) => {
  const { format } = fixture(t, { dictionaries: { en: [] } });
  await assert.rejects(format("hello\n"), /nonempty array/u);
});
