import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as prettier from "prettier";
import plugin, { defineConfig } from "../src/index.mjs";

const format = async (source, spellcheck) =>
  prettier.format(source, defineConfig({ parser: "markdown", spellcheck }));

function vocabulary(t, contents = "qzxwidget\n") {
  const directory = mkdtempSync(join(tmpdir(), "prettier-spelling-config-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "words.txt");
  writeFileSync(path, contents);
  return path;
}

test("inline vocabulary reloads edits without a separate configuration file", async (t) => {
  const path = vocabulary(t, "# Project vocabulary\nqzxwidget\n");
  const settings = { dictionaries: ["@cspell/dict-en_us", path] };
  assert.equal(await format("qzxwidget\n", settings), "qzxwidget\n");
  await assert.rejects(format("qzxcomponent\n", settings), /Misspelled word/u);
  writeFileSync(path, "qzxcomponent\n");
  assert.equal(await format("qzxcomponent\n", settings), "qzxcomponent\n");
  await assert.rejects(format("qzxwidget\n", settings), /Misspelled word/u);
});

test("uses installed language dictionaries together and honors explicit replacement", async (t) => {
  assert.equal(
    await format("Hello mundo\n", {
      dictionaries: ["@cspell/dict-en_us", "@cspell/dict-es-es"],
    }),
    "Hello mundo\n",
  );
  await assert.rejects(
    format("hello\n", { dictionaries: [vocabulary(t)] }),
    /Misspelled word: "hello"/u,
  );
});

test("accepts installed technical dictionaries", async () => {
  assert.equal(
    await format("webpack\n", {
      dictionaries: ["@cspell/dict-en_us", "@cspell/dict-software-terms"],
    }),
    "webpack\n",
  );
});

test("helper registers the plugin, preserves formatting options, and is composable", async () => {
  const otherPlugin = { languages: [] };
  const config = defineConfig({
    parser: "markdown",
    tabWidth: 4,
    plugins: [otherPlugin, plugin, "prettier-plugin-spellcheck"],
    spellcheck: { autocorrect: true },
  });
  const composed = defineConfig(config);
  assert.equal(composed.tabWidth, 4);
  assert.deepEqual(composed.plugins, [otherPlugin, plugin]);
  assert.equal(await prettier.format("#  helo\n", composed), "# hello\n");
  assert.equal(await format("#  helo\n", false), "# helo\n");
});

test("reports invalid inline options, serialized settings and missing dictionary files explicitly", async () => {
  for (const [settings, message] of [
    [null, /spellcheck must be an object or boolean/u],
    [[], /spellcheck must be an object or boolean/u],
    ["{", /Invalid spellcheck JSON/u],
    [{ dictionaryFiles: ["./words.txt"] }, /Unknown spellcheck option/u],
    [{ autocorrect: "true" }, /autocorrect must be a boolean/u],
    [{ enabled: 1 }, /enabled must be a boolean/u],
    [{ dictionaries: [] }, /nonempty array/u],
    [{ dictionaries: { en: ["@cspell/dict-en_us"] } }, /nonempty array/u],
    [{ dictionaries: [""] }, /nonempty array/u],
    [{ frontMatter: { include: ["metadata..id"] } }, /dotted field paths/u],
    [{ frontMatter: { unknown: [] } }, /dotted field paths/u],
  ]) {
    await assert.rejects(format("hello\n", settings), message);
  }
  await assert.rejects(
    format("hello\n", { dictionaries: ["./missing.txt"] }),
    /ENOENT.*missing\.txt/u,
  );
  assert.throws(() => defineConfig(null), /configuration must be an object/u);
  assert.throws(
    () => defineConfig({ plugins: "plugin" }),
    /plugins must be an array/u,
  );
  assert.throws(
    () => defineConfig({ overrides: {} }),
    /overrides must be an array/u,
  );
});
