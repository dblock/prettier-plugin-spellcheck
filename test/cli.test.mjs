import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";

const prettierBin = fileURLToPath(
  new URL("../node_modules/prettier/bin/prettier.cjs", import.meta.url),
);
const pluginURL = new URL("../src/index.mjs", import.meta.url).href;

function fixture(t, source, options = {}, filename = "example.md") {
  const directory = mkdtempSync(join(tmpdir(), "prettier-spellcheck-test-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const file = join(directory, filename);
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
          filename,
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
  assert.doesNotMatch(
    stripVTControlCharacters(result.stderr),
    /^\[error\]\s+at /mu,
  );
  assert.equal(readFileSync(file, "utf8"), source);
});

test("Prettier CLI stdin reports every spelling error without a stack or formatted output", (t) => {
  const source = "# helo mispelled\n";
  const { directory, file } = fixture(t, source, null);
  const result = spawnSync(
    process.execPath,
    [
      prettierBin,
      "--plugin",
      fileURLToPath(pluginURL),
      "--stdin-filepath",
      "example.md",
    ],
    { cwd: directory, input: source, encoding: "utf8" },
  );
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  const lines = stripVTControlCharacters(result.stderr).trimEnd().split("\n");
  assert.equal(lines.length, 3, result.stderr);
  assert.equal(lines[0], "[error] example.md: Spelling check failed.");
  assert.match(
    lines[1],
    /example\.md:1:3 Misspelled word: "helo". Suggestions:/u,
  );
  assert.match(
    lines[2],
    /example\.md:1:8 Misspelled word: "mispelled". Suggestions:/u,
  );
  assert.equal(readFileSync(file, "utf8"), source);
});

test("Prettier CLI infers literal plain text and preserves its layout while correcting", (t) => {
  const source = "  helo  \n\n\tworld";
  const { file, run } = fixture(
    t,
    source,
    { spellcheck: { autocorrect: true } },
    "example.txt",
  );
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), source.replace("helo", "hello"));
});

test("Prettier CLI infers HTML and corrects prose without checking embedded scripts", (t) => {
  const { file, run } = fixture(
    t,
    "<p>helo</p><script>// qzxcomment\nconst value=1;</script>",
    { spellcheck: { autocorrect: true } },
    "example.html",
  );
  const result = run("--write");
  assert.equal(result.status, 0, result.stderr);
  const actual = readFileSync(file, "utf8");
  assert.match(actual, /<p>hello<\/p>/u);
  assert.match(actual, /const value = 1;/u);
  assert.match(actual, /\/\/ qzxcomment/u);
});

test("Prettier CLI leaves HTML untouched when a report-only attribute needs review", (t) => {
  const source = '<p>helo</p><img alt="helo" src="image.png">';
  const { file, run } = fixture(
    t,
    source,
    { spellcheck: { autocorrect: true } },
    "example.html",
  );
  const result = run("--write");
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /example\.html:1:22 Misspelled word: "helo"/u);
  assert.equal(readFileSync(file, "utf8"), source);
});

test("Prettier CLI loads HTML settings from automatic and explicit JSON configuration", (t) => {
  const { directory, file, run } = fixture(
    t,
    "<p>helo</p>",
    null,
    "example.html",
  );
  writeFileSync(
    join(directory, "spellcheck.json"),
    JSON.stringify({ html: false }),
  );
  const disabled = run("--write");
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(readFileSync(file, "utf8"), /<p>helo<\/p>/u);
  writeFileSync(
    join(directory, "custom.json"),
    JSON.stringify({ html: true, autocorrect: true }),
  );
  const corrected = run("--write", "--spellcheck-config", "./custom.json");
  assert.equal(corrected.status, 0, corrected.stderr);
  assert.match(readFileSync(file, "utf8"), /<p>hello<\/p>/u);
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

test("Prettier CLI infers TypeScript and TSX and corrects only code prose", (t) => {
  for (const [filename, source, expected] of [
    [
      "example.ts",
      '// helo\nconst value:string="hello";',
      '// hello\nconst value: string = "hello";\n',
    ],
    [
      "example.tsx",
      "const value=<div>helo</div>;",
      "const value = <div>hello</div>;\n",
    ],
  ]) {
    const { file, run } = fixture(
      t,
      source,
      { spellcheck: { autocorrect: true } },
      filename,
    );
    const result = run("--write");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, "utf8"), expected);
    assert.equal(run("--check").status, 0);
  }
});

test("Prettier CLI never partially corrects code when report-only strings need review", (t) => {
  const source = '// helo\nconst value = "mispelled";\n';
  const { file, run } = fixture(
    t,
    source,
    {
      spellcheck: { autocorrect: true, code: { strings: true } },
    },
    "example.js",
  );
  const result = run("--write");
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Misspelled word: "mispelled"/u);
  assert.equal(readFileSync(file, "utf8"), source);
});
