import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const prettierBin = fileURLToPath(
  new URL("../node_modules/prettier/bin/prettier.cjs", import.meta.url),
);
const pluginURL = new URL("../src/index.mjs", import.meta.url).href;

function fixture(t, source, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "prettier-spellcheck-test-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const file = join(directory, "example.md");
  writeFileSync(file, source);
  writeFileSync(
    join(directory, ".prettierrc.mjs"),
    `import { defineConfig } from ${JSON.stringify(pluginURL)};\nexport default defineConfig(${JSON.stringify(options)});\n`,
  );
  return {
    file,
    run: (...args) =>
      spawnSync(process.execPath, [prettierBin, ...args, "example.md"], {
        cwd: directory,
        encoding: "utf8",
      }),
  };
}

test("Prettier CLI check reports spelling failures and leaves files untouched", (t) => {
  const source = "# helo\n";
  const { file, run } = fixture(t, source);
  const result = run("--check");
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /example\.md:1:3 Misspelled word: "helo"/u);
  assert.equal(readFileSync(file, "utf8"), source);
});

test("Prettier CLI writes enabled corrections and then passes check", (t) => {
  const { file, run } = fixture(t, "#  helo\n", {
    spellcheck: { autocorrect: true },
  });
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), "# hello\n");
  assert.equal(run("--check").status, 0);
});

test("Prettier CLI does not partially write a file with unresolved spelling", (t) => {
  const source = "#  helo xqzvvv\n";
  const { file, run } = fixture(t, source, {
    spellcheck: { autocorrect: true },
  });
  const result = run("--write");
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Misspelled word: "xqzvvv"/u);
  assert.equal(readFileSync(file, "utf8"), source);
});

test("Prettier CLI applies nested spelling overrides without losing ordinary formatting", (t) => {
  const { file, run } = fixture(t, "#  helo\n", {
    spellcheck: { autocorrect: true },
    overrides: [{ files: "example.md", options: { spellcheck: false } }],
  });
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), "# helo\n");
});
