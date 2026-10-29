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
  if (options !== null) {
    writeFileSync(
      join(directory, ".prettierrc.mjs"),
      `import { defineConfig } from ${JSON.stringify(pluginURL)};\nexport default defineConfig(${JSON.stringify(options)});\n`,
    );
  }
  return {
    file,
    directory,
    run: (...args) =>
      spawnSync(
        process.execPath,
        [
          prettierBin,
          ...(options === null ? ["--plugin", fileURLToPath(pluginURL)] : []),
          ...args,
          "example.md",
        ],
        {
          cwd: directory,
          encoding: "utf8",
        },
      ),
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

test("Prettier CLI uses English without configuration and automatically discovers spellcheck.json", (t) => {
  const { file, directory, run } = fixture(t, "# hello\n", null);
  const initial = run("--check");
  assert.equal(initial.status, 0, initial.stderr);
  writeFileSync(file, "#  helo qzxwidget\n");
  writeFileSync(join(directory, "words.txt"), "qzxwidget\n");
  writeFileSync(
    join(directory, "spellcheck.json"),
    JSON.stringify({
      autocorrect: true,
      dictionaries: ["@cspell/dict-en_us", "./words.txt"],
    }),
  );
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), "# hello qzxwidget\n");
});

test("Prettier CLI selects spellcheckConfig without a helper and ignores the default file", (t) => {
  const { file, directory, run } = fixture(t, "#  helo\n", null);
  writeFileSync(join(directory, "spellcheck.json"), "{invalid");
  writeFileSync(
    join(directory, "custom.json"),
    JSON.stringify({ autocorrect: true }),
  );
  writeFileSync(
    join(directory, ".prettierrc.json"),
    JSON.stringify({
      spellcheckConfig: "./custom.json",
    }),
  );
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), "# hello\n");
});

test("Prettier CLI reports invalid default or missing explicit configs without fallback or file writes", (t) => {
  const source = "#  helo\n";
  const { file, directory, run } = fixture(t, source, null);
  writeFileSync(join(directory, "spellcheck.json"), "{");
  const invalid = run("--write");
  assert.equal(invalid.status, 2, invalid.stderr);
  assert.match(
    invalid.stderr,
    /Cannot read spelling configuration.*spellcheck\.json/u,
  );
  writeFileSync(
    join(directory, "spellcheck.json"),
    JSON.stringify({ autocorrect: true }),
  );
  writeFileSync(
    join(directory, ".prettierrc.json"),
    JSON.stringify({
      spellcheckConfig: "./missing.json",
    }),
  );
  const missing = run("--write");
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(
    missing.stderr,
    /Cannot read spelling configuration.*missing\.json/u,
  );
  assert.equal(readFileSync(file, "utf8"), source);
});

test("inline helper settings take precedence over explicit and default config files", (t) => {
  const { file, directory, run } = fixture(t, "#  helo\n", {
    spellcheckConfig: "./missing.json",
    spellcheck: { autocorrect: true },
  });
  writeFileSync(join(directory, "spellcheck.json"), "{invalid");
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), "# hello\n");
});

test("Prettier overrides can switch between inline and external configuration", (t) => {
  for (const options of [
    {
      spellcheck: { autocorrect: false },
      overrides: [
        { files: "example.md", options: { spellcheckConfig: "./custom.json" } },
      ],
    },
    {
      spellcheckConfig: "./missing.json",
      overrides: [
        { files: "example.md", options: { spellcheck: { autocorrect: true } } },
      ],
    },
  ]) {
    const { file, directory, run } = fixture(t, "#  helo\n", options);
    writeFileSync(
      join(directory, "custom.json"),
      JSON.stringify({ autocorrect: true }),
    );
    const result = run("--write");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, "utf8"), "# hello\n");
  }
});
