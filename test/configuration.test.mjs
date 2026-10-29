import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as prettier from "prettier";
import plugin, { defineConfig } from "../src/index.mjs";
import { loadSettings } from "../src/configuration.mjs";

const format = async (source, spellcheck) =>
  prettier.format(source, defineConfig({ parser: "markdown", spellcheck }));

function fixtureFile(t, contents = "qzxwidget\n", filename = "words.txt") {
  const directory = mkdtempSync(join(tmpdir(), "prettier-spelling-config-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const path = join(directory, filename);
  writeFileSync(path, contents);
  return path;
}

test("inline vocabulary reloads edits without a separate configuration file", async (t) => {
  const path = fixtureFile(t, "# Project vocabulary\nqzxwidget\n");
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
    format("hello\n", { dictionaries: [fixtureFile(t)] }),
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
    ["{", /spellcheck must be an object or boolean/u],
    [{ dictionaryFiles: ["./words.txt"] }, /Unknown spellcheck option/u],
    [{ autocorrect: "true" }, /autocorrect must be a boolean/u],
    [{ enabled: 1 }, /enabled must be a boolean/u],
    [{ dictionaries: [] }, /nonempty array/u],
    [{ dictionaries: { en: ["@cspell/dict-en_us"] } }, /nonempty array/u],
    [{ dictionaries: [""] }, /nonempty array/u],
    [{ frontMatter: { include: ["metadata..id"] } }, /dotted field paths/u],
    [{ frontMatter: { unknown: [] } }, /dotted field paths/u],
    [{ code: null }, /code must be a boolean or an object/u],
    [{ code: { strings: "true" } }, /code supports boolean/u],
    [{ code: { unknown: true } }, /code supports boolean/u],
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
  assert.throws(
    () => loadSettings({ spellcheck: "false" }),
    /spellcheck must be a boolean/u,
  );
  assert.throws(
    () => loadSettings({ spellcheckConfig: "" }),
    /nonempty file path/u,
  );
  assert.throws(
    () => loadSettings({ spellcheckConfig: true }),
    /nonempty file path/u,
  );
  await assert.rejects(
    prettier.format("Hello\n", {
      parser: "markdown",
      plugins: [plugin],
      spellcheckConfig: "{",
    }),
    /Invalid spellcheck JSON/u,
  );
});

test("reloads an explicit JSON configuration on every format without a helper", async (t) => {
  const path = fixtureFile(
    t,
    JSON.stringify({ autocorrect: true }),
    "spellcheck.json",
  );
  const options = {
    parser: "markdown",
    plugins: [plugin],
    spellcheckConfig: path,
  };
  assert.equal(await prettier.format("# helo\n", options), "# hello\n");
  writeFileSync(path, JSON.stringify({ autocorrect: false }));
  await assert.rejects(
    prettier.format("# helo\n", options),
    /Misspelled word/u,
  );
  writeFileSync(path, JSON.stringify({ enabled: false }));
  assert.equal(await prettier.format("# helo\n", options), "# helo\n");
  await assert.rejects(
    prettier.format("# helo\n", { ...options, spellcheck: true }),
    /Misspelled word/u,
  );
  writeFileSync(path, "{");
  assert.equal(
    await prettier.format("# helo\n", { ...options, spellcheck: false }),
    "# helo\n",
  );
  await assert.rejects(
    prettier.format("# helo\n", options),
    /Cannot read spelling configuration/u,
  );
});
