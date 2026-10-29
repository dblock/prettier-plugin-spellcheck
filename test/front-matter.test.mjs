import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as prettier from "prettier";
import * as plugin from "../src/index.mjs";
import { checkSource } from "../src/spelling.mjs";

test("checks nested YAML string values and anchored definitions, not keys or aliases", async () => {
  const source =
    "---\nwrng: 42\nauthor:\n  name: &person helo\npeople:\n  - *person\n  - name: mispelled\n---\n\nhelo\n";
  const issues = await checkSource(source);
  assert.deepEqual(
    issues.map(({ word, line, column }) => ({ word, line, column })),
    [
      { word: "helo", line: 4, column: 17 },
      { word: "mispelled", line: 7, column: 11 },
      { word: "helo", line: 10, column: 1 },
    ],
  );
});

test("autocorrects plain YAML scalars and body prose through Prettier idempotently", async () => {
  const source = "---\ntitle: helo\n---\n\n# helo\n";
  const options = {
    parser: "markdown",
    plugins: [plugin],
    spellcheckAutocorrect: true,
  };
  const actual = await prettier.format(source, options);
  assert.equal(actual, "---\ntitle: hello\n---\n\n# hello\n");
  assert.equal(await prettier.format(actual, options), actual);
});

test("decodes escaped YAML words for diagnostics and collection but never fixes quotes or blocks", async () => {
  const source = '---\ntitle: "\\u0068elo"\nsummary: >\n  helo world\n---\n';
  const issues = await checkSource(source, {}, { autocorrect: true });
  assert.deepEqual(
    issues.map(({ word, line, column, replacement }) => ({
      word,
      line,
      column,
      replacement,
    })),
    [
      { word: "helo", line: 2, column: 9, replacement: undefined },
      { word: "helo", line: 4, column: 3, replacement: undefined },
    ],
  );
});

test("selects nested YAML fields with exclusion precedence and can disable front matter", async () => {
  const source =
    "---\ntitle: helo\nmetadata:\n  description: mispelled\n  id: qzxignored\nauthors:\n  - name: helo\n---\n";
  const settings = {
    markdown: {
      frontMatter: {
        include: ["metadata", "authors.name"],
        exclude: ["metadata.id"],
      },
    },
  };
  assert.deepEqual(
    (await checkSource(source, settings)).map(({ word }) => word),
    ["mispelled", "helo"],
  );
  assert.deepEqual(
    await checkSource(source, { markdown: { frontMatter: false } }),
    [],
  );
  assert.deepEqual(
    await checkSource(source, { markdown: { frontMatter: { include: [] } } }),
    [],
  );
});

test("never changes a YAML string into a boolean or null", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "prettier-yaml-types-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "words.txt");
  writeFileSync(path, "null\ntrue\n");
  const issues = await checkSource(
    "---\ntitle: nll\n---\n",
    {
      dictionaries: { project: [path] },
    },
    { autocorrect: true },
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].suggestions[0], "null");
  assert.equal(issues[0].replacement, undefined);
});

test("fails explicitly on malformed YAML and invalid field configuration", async () => {
  await assert.rejects(
    checkSource("---\ntitle: [broken\n---\n"),
    /Invalid YAML front matter/u,
  );
  await assert.rejects(
    checkSource("Hello\n", { markdown: { frontMatter: { include: "title" } } }),
    /arrays of dotted field paths/u,
  );
  await assert.rejects(
    checkSource("Hello\n", { markdown: false }),
    /markdown must be an object/u,
  );
});
