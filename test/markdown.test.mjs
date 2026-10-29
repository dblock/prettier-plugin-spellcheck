import assert from "node:assert/strict";
import test from "node:test";
import * as prettier from "prettier";
import { defineConfig } from "../src/index.mjs";
import {
  applyCorrections,
  checkSource,
  oneEditAway,
} from "../src/spelling.mjs";

const format = (source, options = {}) =>
  prettier.format(
    source,
    defineConfig({
      parser: "markdown",
      spellcheck: { autocorrect: true },
      ...options,
    }),
  );

test("preserves Unicode and UTF-16 fix positions with CRLF and inline markup", async () => {
  const source = "# 😀 café **helo**\r\n\r\n> helo\r\n\r\nHello\thelo\r\n";
  assert.equal(
    await format(source, { endOfLine: "crlf" }),
    "# 😀 café **hello**\r\n\r\n> hello\r\n\r\nHello hello\r\n",
  );
  await assert.rejects(
    format("😀 xqzvvv\n"),
    /<markdown>:1:4 Misspelled word: "xqzvvv"/u,
  );
});

test("leaves Liquid contents alone while correcting surrounding prose", async () => {
  const source = "{{ wrng.qzx }} helo\n\n{% assign qzx = 'wrng' %}\n\nhelo\n";
  assert.equal(
    await format(source),
    await prettier.format(source.replaceAll("helo", "hello"), {
      parser: "markdown",
    }),
  );
});

test("preserves BOM and CRLF offsets in body and YAML spelling corrections", async () => {
  const source = "\uFEFF---\r\ntitle: helo\r\n---\r\n\r\nhelo\r\n";
  const issues = await checkSource(source, { autocorrect: true });
  assert.deepEqual(
    issues.map(({ word }) => word),
    ["helo", "helo"],
  );
  for (const issue of issues) {
    assert.equal(
      source.slice(issue.offset, issue.offset + issue.length),
      issue.word,
    );
  }
  assert.equal(
    applyCorrections(source, issues),
    source.replaceAll("helo", "hello"),
  );
  assert.equal(
    await format(source, { endOfLine: "crlf" }),
    source.replaceAll("helo", "hello"),
  );
});

test("supports native spelling directives and markdownlint compatibility comments", async () => {
  for (const prefix of ["spellcheck", "markdownlint"]) {
    const source = `<!-- ${prefix}-disable spellcheck -->\n\nqzxignored\n\n<!-- ${prefix}-enable spellcheck -->\n\n#  helo\n`;
    assert.equal(await format(source), source.replace("#  helo", "# hello"));
  }
  assert.equal(
    (await checkSource("qzxignored <!-- spellcheck-disable-line -->\n")).length,
    0,
  );
  assert.equal(
    (await checkSource("<!-- spellcheck-disable-next-line -->\nqzxignored\n"))
      .length,
    0,
  );
});

test("supports directive reasons, rule lists, colon regions, and own-line todo", async () => {
  const source = [
    "<!-- markdownlint-disable other,all -- deliberate examples -->",
    "qzxhidden",
    "<!-- markdownlint-enable all -- checked again -->",
    "qzxhidden <!-- spellcheck:disable -- deliberate example -->",
    "helo",
    "qzxhidden <!-- spellcheck:todo -- deliberate example -->",
    "<!-- spellcheck:disable -- deliberate region -->",
    "qzxhidden",
    "<!-- spellcheck:enable -->",
    "helo",
  ].join("\n");
  assert.deepEqual(
    (await checkSource(source)).map(({ word, line }) => ({ word, line })),
    [
      { word: "helo", line: 5 },
      { word: "helo", line: 10 },
    ],
  );
});

test("directives hidden in Liquid and ignored nodes cannot suppress surrounding prose", async () => {
  for (const source of [
    "{{\n<!-- spellcheck-disable -->\n}}\n\nhelo\n",
    "{% assign text = '\n<!-- spellcheck-disable-file -->\n' %}\n\nhelo\n",
    "<!-- prettier-ignore -->\n\n<!-- spellcheck-disable -->\n\nhelo\n",
  ]) {
    assert.deepEqual(
      (await checkSource(source)).map(({ word }) => word),
      ["helo"],
    );
  }
});

test("does not check or correct the node following prettier-ignore", async () => {
  const source = "<!-- prettier-ignore -->\n\nhelo   qzxignored\n\nhelo\n";
  const result = await format(source);
  assert.equal(
    result,
    "<!-- prettier-ignore -->\nhelo   qzxignored\n\nhello\n",
  );
  assert.equal(await format(result), result);
});

test("honors top-level ignore ranges without treating code as directives", async () => {
  const source =
    "Hello\n\n<!-- prettier-ignore-start -->\n\nhelo   qzxignored\n\n<!-- prettier-ignore-end -->\n\n`<!-- prettier-ignore -->`\n\nhelo\n";
  assert.equal(await format(source), source.replace("\nhelo\n", "\nhello\n"));
});

test("checks image descriptions without changing destinations or inline code", async () => {
  const source = "![helo **world** `wrng`](wrng.png)\n\n[helo](wrng.md)\n";
  assert.equal(
    await format(source),
    "![hello **world** `wrng`](wrng.png)\n\n[hello](wrng.md)\n",
  );
});

test("skips entity fragments, emails and whole identifier-like tokens", async () => {
  const source =
    "he&#108;o person@wrng.invalid wrong_token sha256 can't2stop\n";
  assert.deepEqual(await checkSource(source), []);
  const issues = await checkSource("😀 helo helo\n");
  assert.deepEqual(
    issues.map(({ offset, line, column }) => ({ offset, line, column })),
    [
      { offset: 3, line: 1, column: 4 },
      { offset: 8, line: 1, column: 9 },
    ],
  );
});

test("limits corrections to exactly one edit or adjacent transposition", () => {
  for (const [left, right] of [
    ["helo", "hello"],
    ["helllo", "hello"],
    ["hallo", "hello"],
    ["hlelo", "hello"],
  ]) {
    assert.equal(oneEditAway(left, right), true);
  }
  for (const [left, right] of [
    ["hello", "hello"],
    ["hello", "world"],
    ["helo", "helping"],
    ["ab", "cd"],
  ]) {
    assert.equal(oneEditAway(left, right), false);
  }
});

test("leaves programmatic strings and unsupported MDX unchanged", async () => {
  for (const [parser, source] of [
    ["babel", 'const helo="wrng";'],
    ["mdx", "# helo\n"],
  ]) {
    assert.equal(
      await format(source, { parser }),
      await prettier.format(source, { parser }),
    );
  }
});
