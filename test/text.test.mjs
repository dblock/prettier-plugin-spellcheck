import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as prettier from "prettier";
import { defineConfig } from "../src/index.mjs";
import { applyCorrections, checkSource } from "../src/spelling.mjs";

const format = (source, options = {}) =>
  prettier.format(
    source,
    defineConfig({ filepath: "example.txt", ...options }),
  );

test("plain text is literal rather than Markdown, HTML, Liquid, or suppression syntax", async () => {
  const source =
    "`qzxcode` <b>qzxhtml</b> {{ qzxliquid }} &qzxentity;\n<!-- spellcheck-disable -->\nhelo\n";
  const issues = await checkSource(
    source,
    {},
    { parser: "spellcheck-text", suggestions: false },
  );
  for (const word of ["qzxcode", "qzxhtml", "qzxliquid", "qzxentity", "helo"]) {
    assert.ok(
      issues.some((issue) => issue.word === word),
      word,
    );
  }
  assert.deepEqual(
    await checkSource(
      "https://wrng.invalid person@wrng.invalid wrong_token sha256\n",
      {},
      { parser: "spellcheck-text" },
    ),
    [],
  );
});

test("plain text preserves layout, trailing spaces, missing final newline, BOM, and chosen line endings", async () => {
  for (const source of ["  hello\tworld  \n\n", "hello", ""]) {
    assert.equal(await format(source), source);
  }
  const source = "\uFEFF  helo  \r\n\r\n\tworld\r\n";
  const settings = { autocorrect: true };
  const issues = await checkSource(source, settings, {
    parser: "spellcheck-text",
  });
  assert.equal(issues[0].offset, source.indexOf("helo"));
  assert.equal(
    applyCorrections(source, issues),
    source.replace("helo", "hello"),
  );
  assert.equal(
    await format(source, { spellcheck: settings, endOfLine: "crlf" }),
    source.replace("helo", "hello"),
  );
  await assert.rejects(
    format("helo qzxunknown\n", { spellcheck: settings }),
    /Spelling check failed/u,
  );
});

test("configured vocabulary files are not treated as prose", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "prettier-text-test-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const filepath = join(directory, "words.txt");
  const source = "# qzxcomment\nqzxwidget\n";
  writeFileSync(filepath, source);
  assert.equal(
    await format(source, {
      filepath,
      spellcheck: {
        autocorrect: true,
        dictionaries: ["@cspell/dict-en_us", filepath],
      },
    }),
    source,
  );
});
