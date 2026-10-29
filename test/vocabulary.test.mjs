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
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

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
  assert.match(result.stderr, /No non-ignored Markdown files/u);
  assert.equal(existsSync(join(directory, "missing.txt")), false);
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
  const settings = JSON.parse(config.spellcheck);
  assert.deepEqual(settings.dictionaries, [
    "@cspell/dict-es-es",
    "./words.txt",
  ]);
  assert.equal(settings.frontMatter, false);
});

test("add creates a normal Prettier config but rejects invalid vocabulary before writing", async (t) => {
  const { write, read, run, directory } = fixture(t);
  write("words.txt", "qzxwidget\n");
  const added = run("add", "words.txt");
  assert.equal(added.status, 0, added.stderr);
  const { default: config } = await import(
    pathToFileURL(join(directory, ".prettierrc.mjs"))
  );
  assert.deepEqual(JSON.parse(config.spellcheck).dictionaries, [
    "@cspell/dict-en_us",
    "./words.txt",
  ]);
  const before = read(".prettierrc.mjs");
  write("words.txt", "not a word\n");
  const result = run("add", "words.txt");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid vocabulary word/u);
  assert.equal(read(".prettierrc.mjs"), before);
});

test("add fills missing nested settings without removing unrelated configuration", async (t) => {
  for (const settings of [
    {},
    { spellcheck: true },
    { spellcheck: { autocorrect: true } },
  ]) {
    const { write, run, directory } = fixture(t);
    write("words.txt", "qzxwidget\n");
    write(".prettierrc.mjs", configSource({ tabWidth: 4, ...settings }));
    const result = run("add", "words.txt");
    assert.equal(result.status, 0, result.stderr);
    const { default: config } = await import(
      pathToFileURL(join(directory, ".prettierrc.mjs"))
    );
    assert.equal(config.tabWidth, 4);
    assert.deepEqual(JSON.parse(config.spellcheck).dictionaries, [
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
    ["export default {};\n", /export default defineConfig/u],
    [
      "const base = {};\nexport default defineConfig({...base});\n",
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
