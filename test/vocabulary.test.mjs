import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bin = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "prettier-vocabulary-test-"));
  t.after(() => rmSync(directory, { recursive: true }));
  return {
    directory,
    write: (file, content) => writeFileSync(join(directory, file), content),
    read: (file) => readFileSync(join(directory, file), "utf8"),
    run: (...args) =>
      spawnSync(process.execPath, [bin, ...args], {
        cwd: directory,
        encoding: "utf8",
      }),
  };
}

test("collect honors ignores, per-file settings, dictionaries and suppression comments", (t) => {
  const { write, read, run } = fixture(t);
  write(
    ".prettierrc.json",
    JSON.stringify({
      spellcheckConfig: "./.spellcheck.json",
      overrides: [{ files: "disabled.md", options: { spellcheck: false } }],
    }),
  );
  write(
    ".spellcheck.json",
    JSON.stringify({
      dictionaries: { en: ["@cspell/dict-en_us", "./words.txt"] },
    }),
  );
  write("words.txt", "qzxwidget\n");
  write(".prettierignore", "ignored.md\n");
  write("ignored.md", "qzxignored\n");
  write("disabled.md", "qzxdisabled\n");
  write("example.mdx", "qzxmdx\n");
  write(
    "example.md",
    "qzxwidget helo helo\n\n`wrng`\n\n<!-- prettier-ignore -->\n\nqzxignorednode\n\n<!-- markdownlint-disable spellcheck -->\nqzxhidden\n",
  );
  const result = run("collect", "**/*.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\n",
  );
});

test("collect never overwrites candidates or creates output for unmatched patterns", (t) => {
  const { write, read, run, directory } = fixture(t);
  write("example.md", "helo\n");
  write(".spellcheck.txt", "keep me\n");
  assert.equal(run("collect", "*.md").status, 1);
  assert.equal(read(".spellcheck.txt"), "keep me\n");
  const result = run("collect", "missing/*.md", "--output", "missing.txt");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No non-ignored Markdown files/u);
  assert.equal(existsSync(join(directory, "missing.txt")), false);
});

test("add preserves language maps and stores config-relative paths without duplicates", (t) => {
  const { write, read, run, directory } = fixture(t);
  mkdirSync(join(directory, "config"));
  write("words.txt", "qzxwidget\n");
  write(
    "config/spelling.json",
    JSON.stringify({
      dictionaries: { es: ["@cspell/dict-es-es"] },
    }),
  );
  for (let count = 0; count < 2; count++) {
    const result = run("add", "words.txt", "--config", "config/spelling.json");
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(JSON.parse(read("config/spelling.json")), {
    dictionaries: { es: ["@cspell/dict-es-es"], en: ["../words.txt"] },
  });
});

test("add creates an English config but rejects invalid vocabulary before writing", (t) => {
  const { write, read, run } = fixture(t);
  write("words.txt", "qzxwidget\n");
  assert.equal(run("add", "words.txt").status, 0);
  assert.deepEqual(JSON.parse(read(".spellcheck.json")), {
    dictionaries: { en: ["@cspell/dict-en_us", "./words.txt"] },
  });
  const before = read(".spellcheck.json");
  write("words.txt", "not a word\n");
  const result = run("add", "words.txt");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid vocabulary word/u);
  assert.equal(read(".spellcheck.json"), before);
});
