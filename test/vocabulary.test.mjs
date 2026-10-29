import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  readdirSync,
  chmodSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { loadSettings } from "../src/configuration.mjs";
import { vocabularySnapshot, writeCandidates } from "../src/vocabulary.mjs";

const bin = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const packagePath = fileURLToPath(new URL("../", import.meta.url));
const configSource = (settings) =>
  `import { defineConfig } from "prettier-plugin-spellcheck";\nexport default defineConfig(${JSON.stringify(settings)});\n`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "prettier-vocabulary-test-"));
  t.after(() => rmSync(directory, { recursive: true }));
  mkdirSync(join(directory, "node_modules"));
  symlinkSync(
    packagePath,
    join(directory, "node_modules/prettier-plugin-spellcheck"),
    "dir",
  );
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

test("collect honors ignores, nested per-file settings, dictionaries and suppression comments", (t) => {
  const { write, read, run } = fixture(t);
  write(
    ".prettierrc.mjs",
    configSource({
      spellcheck: { dictionaries: ["@cspell/dict-en_us", "./words.txt"] },
      overrides: [{ files: "disabled.md", options: { spellcheck: false } }],
    }),
  );
  write("words.txt", "qzxwidget\n");
  write(".prettierignore", "ignored.md\n");
  write(".gitignore", "gitignored.md\n");
  write("ignored.md", "qzxignored\n");
  write("gitignored.md", "qzxgitignored\n");
  write("disabled.md", "qzxdisabled\n");
  write("example.mdx", "qzxmdx\n");
  write(
    "example.md",
    "qzxwidget helo helo\n\n`wrng`\n\n<!-- prettier-ignore -->\n\nqzxignorednode\n\n<!-- markdownlint-disable spellcheck -->\nqzxhidden\n",
  );
  const result = run("collect", "**/*.md", "*.mdx");
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
  assert.match(
    result.stderr,
    /No non-ignored Markdown, HTML, plain-text, or supported code files/u,
  );
  assert.equal(existsSync(join(directory, "missing.txt")), false);
});

test("collect infers plain text and excludes configured dictionaries and its own output", (t) => {
  const { write, read, run } = fixture(t);
  write(
    "spellcheck.json",
    JSON.stringify({ dictionaries: ["@cspell/dict-en_us", "./words.txt"] }),
  );
  write("words.txt", "# qzxdictionarycomment\nqzxwidget\n");
  write("example.txt", "`qzxliteral` qzxwidget helo\n");
  const result = run("collect", "*.txt");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\nqzxliteral\n",
  );
});

test("collect checks explicitly enabled tagged code fences without suggestions", (t) => {
  const { write, read, run } = fixture(t);
  write(
    "spellcheck.json",
    JSON.stringify({ code: { fences: true, strings: true } }),
  );
  write("example.md", '```ts\nconst value: string = "qzxfenced";\n```\n');
  const result = run("collect", "*.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nqzxfenced\n",
  );
});

test("collect and refresh infer HTML, decode attributes, and respect HTML overrides and ignored scopes", (t) => {
  const { write, read, run } = fixture(t);
  write(
    ".prettierrc.mjs",
    configSource({
      overrides: [
        { files: "disabled.html", options: { spellcheck: { html: false } } },
      ],
    }),
  );
  write("disabled.html", "<p>qzxdisabled</p>");
  write(
    "example.html",
    '<p>qzxvisible</p><img alt="qzx&#97;ttribute"><script>// qzxscript</script><code>qzxcode</code>',
  );
  const collected = run("collect", "*.html");
  assert.equal(collected.status, 0, collected.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nqzxattribute\nqzxvisible\n",
  );
  write(
    "spellcheck.json",
    JSON.stringify({
      dictionaries: ["@cspell/dict-en_us", "./.spellcheck.txt"],
    }),
  );
  write("example.html", "<p>qzxvisible qzxnew</p>");
  const refreshed = run("collect", "*.html", "--refresh");
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nqzxvisible\nqzxnew\n",
  );
  write("spellcheck.json", JSON.stringify({ html: false }));
  const disabled = run("collect", "*.html", "--refresh");
  assert.equal(disabled.status, 1);
  assert.match(disabled.stderr, /No enabled spelling inputs/u);
});

test("refresh excludes old vocabulary aliases, prunes stale words, and preserves retained spelling and comments", (t) => {
  const { directory, write, read, run } = fixture(t);
  write(
    ".spellcheck.txt",
    "# Reviewed words.\r\nQzxWidget\r\nqzxplain\r\nQzx'word\r\nqzxobsolete\r\n",
  );
  chmodSync(join(directory, ".spellcheck.txt"), 0o664);
  symlinkSync(
    join(directory, ".spellcheck.txt"),
    join(directory, "words-alias.txt"),
  );
  write("other.txt", "qzxother\n");
  write(
    "spellcheck.json",
    JSON.stringify({
      dictionaries: ["@cspell/dict-en_us", "./words-alias.txt", "./other.txt"],
      code: { fences: true, strings: true },
    }),
  );
  write(
    "example.md",
    "\uFEFFQzxWidget Qzxplain Qzx\u2019word qzxother qzxnew\n\n```ts\nconst value: string = 'qzxfenced';\n```\n",
  );
  const source = read("example.md");
  const result = run("collect", "*.{md,txt}", "--refresh");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Refreshed/u);
  assert.equal(
    read(".spellcheck.txt"),
    "# Reviewed words.\r\nQzxWidget\r\nqzxplain\r\nQzx'word\r\nqzxfenced\r\nqzxnew\r\n",
  );
  assert.equal(read("example.md"), source);
  assert.equal(read("other.txt"), "qzxother\n");
  assert.equal(
    statSync(join(directory, ".spellcheck.txt")).mode & 0o777,
    0o664,
  );
});

test("refresh can prune all words and supports a vocabulary-only dictionary without English fallback", (t) => {
  const { write, read, run } = fixture(t);
  write(".spellcheck.txt", "# Reviewed words.\nqzxobsolete\n");
  write("example.md", "Hello world\n");
  assert.equal(run("collect", "*.md", "--refresh").status, 0);
  assert.equal(read(".spellcheck.txt"), "# Reviewed words.\n");
  write(
    "spellcheck.json",
    JSON.stringify({ dictionaries: ["./.spellcheck.txt"] }),
  );
  const result = run("collect", "*.md", "--refresh");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(".spellcheck.txt"), "# Reviewed words.\nHello\nworld\n");
});

test("refresh rejects unsafe outputs and failed or wholly disabled scans without changing vocabulary", (t) => {
  const { directory, write, read, run } = fixture(t);
  write(".spellcheck.txt", "# Keep this list.\nqzxwidget\n");
  const original = read(".spellcheck.txt");
  write("example.md", "---\ntitle: [\n---\n");
  assert.equal(run("collect", "*.md", "--refresh").status, 1);
  assert.equal(read(".spellcheck.txt"), original);
  write("example.md", "helo\n");
  write("spellcheck.json", JSON.stringify({ enabled: false }));
  const disabled = run("collect", "*.md", "--refresh");
  assert.equal(disabled.status, 1);
  assert.match(disabled.stderr, /No enabled spelling inputs/u);
  assert.equal(read(".spellcheck.txt"), original);
  write("spellcheck.json", JSON.stringify({ code: false }));
  write("example.js", "// qzxwidget\n");
  assert.equal(run("collect", "*.js", "--refresh").status, 1);
  assert.equal(read(".spellcheck.txt"), original);
  assert.equal(
    run("collect", "*.md", "--refresh", "--output", "missing.txt").status,
    1,
  );
  assert.equal(existsSync(join(directory, "missing.txt")), false);
  symlinkSync(join(directory, ".spellcheck.txt"), join(directory, "link.txt"));
  const linked = run("collect", "*.md", "--refresh", "--output", "link.txt");
  assert.equal(linked.status, 1);
  assert.match(linked.stderr, /regular file/u);
  assert.equal(read(".spellcheck.txt"), original);
});

test("refresh detects concurrent edits and removes its temporary output", (t) => {
  const { directory, write, read } = fixture(t);
  write(".spellcheck.txt", "qzxwidget\n");
  const file = join(directory, ".spellcheck.txt");
  const snapshot = vocabularySnapshot(file);
  write(".spellcheck.txt", "# Concurrent edit.\nqzxwidget\n");
  const original = read(".spellcheck.txt");
  assert.throws(
    () => writeCandidates(file, new Set(["qzxnew"]), snapshot),
    /Vocabulary changed during collection/u,
  );
  assert.equal(read(".spellcheck.txt"), original);
  assert.equal(
    readdirSync(directory).some((name) => name.endsWith(".tmp")),
    false,
  );
});

test("collect rejects invalid nested spelling options before creating output", (t) => {
  const { write, run, directory } = fixture(t);
  write("example.md", "helo\n");
  write(".prettierrc.mjs", configSource({ spellcheck: { enabled: "false" } }));
  const result = run("collect", "*.md");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spellcheck.enabled must be a boolean/u);
  assert.equal(existsSync(join(directory, ".spellcheck.txt")), false);
});

test("collect uses an explicit Prettier config and decodes selected YAML values", (t) => {
  const { write, read, run } = fixture(t);
  write(
    "prettier.config.mjs",
    configSource({
      spellcheck: { frontMatter: { include: ["title"] } },
    }),
  );
  write(
    "example.md",
    '---\ntitle: "\\u0071zxwidget"\nqzxkey: qzxignored\n---\n',
  );
  const result = run("collect", "*.md", "--config", "prettier.config.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nqzxwidget\n",
  );
});

test("add preserves nested and formatting settings, stores working-directory paths and avoids duplicates", async (t) => {
  const { write, run, directory } = fixture(t);
  mkdirSync(join(directory, "config"));
  write("words.txt", "qzxwidget\n");
  write(
    "config/prettier.config.mjs",
    configSource({
      singleQuote: true,
      spellcheck: { dictionaries: ["@cspell/dict-es-es"], frontMatter: false },
    }),
  );
  for (let count = 0; count < 2; count++) {
    const result = run(
      "add",
      "words.txt",
      "--config",
      "config/prettier.config.mjs",
    );
    assert.equal(result.status, 0, result.stderr);
  }
  const { default: config } = await import(
    pathToFileURL(join(directory, "config/prettier.config.mjs"))
  );
  assert.equal(config.singleQuote, true);
  const settings = loadSettings(config);
  assert.deepEqual(settings.dictionaries, [
    "@cspell/dict-es-es",
    "./words.txt",
  ]);
  assert.equal(settings.frontMatter, false);
});

test("add creates the default spellcheck.json without needing a Prettier config", (t) => {
  const { write, read, run, directory } = fixture(t);
  write("words.txt", "qzxwidget\n");
  const added = run("add", "words.txt");
  assert.equal(added.status, 0, added.stderr);
  assert.equal(existsSync(join(directory, ".prettierrc.mjs")), false);
  assert.deepEqual(JSON.parse(read("spellcheck.json")).dictionaries, [
    "@cspell/dict-en_us",
    "./words.txt",
  ]);
  const before = read("spellcheck.json");
  write("words.txt", "not a word\n");
  const result = run("add", "words.txt");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid vocabulary word/u);
  assert.equal(read("spellcheck.json"), before);
});

test("add fills missing nested settings without removing unrelated configuration", async (t) => {
  for (const spellcheck of [{}, { autocorrect: true }]) {
    const { write, run, directory } = fixture(t);
    write("words.txt", "qzxwidget\n");
    write(".prettierrc.mjs", configSource({ tabWidth: 4, spellcheck }));
    const result = run("add", "words.txt");
    assert.equal(result.status, 0, result.stderr);
    const { default: config } = await import(
      pathToFileURL(join(directory, ".prettierrc.mjs"))
    );
    assert.equal(config.tabWidth, 4);
    assert.deepEqual(loadSettings(config).dictionaries, [
      "@cspell/dict-en_us",
      "./words.txt",
    ]);
  }
});

test("add refuses disabled or dynamic settings and leaves the configuration untouched", (t) => {
  const { write, read, run } = fixture(t);
  write("words.txt", "qzxwidget\n");
  for (const [source, message] of [
    [configSource({ spellcheck: false }), /spellcheck is disabled/u],
    [
      configSource({ spellcheck: { enabled: false } }),
      /spellcheck is disabled/u,
    ],
    [
      'export default {spellcheckConfig:"{}"};\n',
      /export default defineConfig/u,
    ],
    [
      'import { defineConfig } from "prettier-plugin-spellcheck";\nconst base = {};\nexport default defineConfig({...base, spellcheck:{}});\n',
      /static object properties/u,
    ],
    [
      'import { defineConfig } from "prettier-plugin-spellcheck";\nconst names = ["@cspell/dict-en_us"];\nexport default defineConfig({spellcheck:{dictionaries:names}});\n',
      /static dictionaries array/u,
    ],
  ]) {
    write(".prettierrc.mjs", source);
    const result = run("add", "words.txt");
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.equal(read(".prettierrc.mjs"), source);
  }
});

test("collect automatically loads spellcheck.json without a Prettier configuration", (t) => {
  const { write, read, run } = fixture(t);
  write(
    "spellcheck.json",
    JSON.stringify({
      dictionaries: ["@cspell/dict-en_us", "./words.txt"],
      frontMatter: false,
    }),
  );
  write("words.txt", "qzxwidget\n");
  write("example.md", "---\ntitle: qzxignored\n---\n\nhelo qzxwidget\n");
  const result = run("collect", "*.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\n",
  );
});

test("add updates an explicit external JSON config without changing the Prettier configuration", (t) => {
  const { write, read, run, directory } = fixture(t);
  mkdirSync(join(directory, "config"));
  const prettierConfig = JSON.stringify({
    spellcheckConfig: "./config/spelling.json",
  });

  write(".prettierrc.json", prettierConfig);
  write(
    "config/spelling.json",
    JSON.stringify({
      autocorrect: true,
      dictionaries: ["@cspell/dict-en_us"],
      frontMatter: false,
    }),
  );
  write("words.txt", "qzxwidget\n");
  write("example.md", "helo qzxwidget\n");
  for (let count = 0; count < 2; count++) {
    const result = run("add", "words.txt");
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(read(".prettierrc.json"), prettierConfig);
  assert.deepEqual(JSON.parse(read("config/spelling.json")), {
    autocorrect: true,
    dictionaries: ["@cspell/dict-en_us", "./words.txt"],
    frontMatter: false,
  });
  const collected = run("collect", "*.md");
  assert.equal(collected.status, 0, collected.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\n",
  );
});

test("collect checks code prose and configured strings and identifiers using each file's parser", (t) => {
  const { write, read, run } = fixture(t);
  write(
    "spellcheck.json",
    JSON.stringify({
      code: { strings: true, identifiers: true },
    }),
  );
  write("example.ts", 'const heloValue: string = "mispelled"; // helo\n');
  write("ignored.ts", "// qzxignored\n");
  write(".prettierignore", "ignored.ts\n");
  const result = run("collect", "*.{md,js,jsx,ts,tsx}");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\nmispelled\n",
  );
});
