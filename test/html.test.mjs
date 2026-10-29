import assert from "node:assert/strict";
import test from "node:test";
import * as prettier from "prettier";
import { defineConfig } from "../src/index.mjs";
import { applyCorrections, checkSource } from "../src/spelling.mjs";

const check = (source, settings = {}) =>
  checkSource(source, settings, { parser: "html" });
const format = (source, settings = {}, options = {}) =>
  prettier.format(
    source,
    defineConfig({
      parser: "html",
      spellcheck: { autocorrect: true, ...settings },
      ...options,
    }),
  );

test("HTML checks prose and human-facing attributes, not structural attributes", async () => {
  const source =
    '<!doctype html><html><head><title>helo</title></head><body><p>mispelled</p><img alt="helo" src="qzxpath"><input placeholder="helo" aria-label="helo" aria-description="helo" title="helo" value="qzxvalue" class="qzxclass" id="qzxid"></body></html>';
  const issues = await check(source, { autocorrect: true });
  assert.deepEqual(
    issues.map(({ word }) => word),
    ["helo", "mispelled", "helo", "helo", "helo", "helo", "helo"],
  );
  assert.equal(issues[0].replacement, "hello");
  assert.ok(
    issues.slice(2).every(({ replacement }) => replacement === undefined),
  );
  await assert.rejects(format(source), /Spelling check failed/u);
});

test("HTML excludes scripts, styles, code examples, hidden content, templates, and comment prose", async () => {
  const source = [
    "<!-- qzxcomment -->",
    '<script>// qzxscript\nconst value="qzxstring";</script>',
    "<style>.qzxclass{color:red}</style>",
    "<code><!-- spellcheck-disable-file -->qzxcode</code>",
    "<pre>qzxpre</pre><kbd>qzxkey</kbd><samp>qzxoutput</samp>",
    "<template><p>qzxtemplate</p></template>",
    '<div hidden title="qzxhidden">qzxhidden</div>',
    "<p>helo</p>",
  ].join("\n");
  const settings = { code: { strings: true, identifiers: true } };
  assert.deepEqual(
    (await check(source, settings)).map(({ word }) => word),
    ["helo"],
  );
  const actual = await format(source, settings);
  assert.equal(
    actual,
    await prettier.format(source.replace("<p>helo</p>", "<p>hello</p>"), {
      parser: "html",
    }),
  );
  assert.match(actual, /const value = "qzxstring";/u);
});

test("HTML entities and inline elements preserve original UTF-16 ranges without unsafe corrections", async () => {
  const source =
    "\uFEFF<p>he&#108;o caf&eacute; &#x1F600; he<em>lo</em></p>\r\n<p>mispelled</p>";
  const issues = await check(source, { autocorrect: true });
  assert.deepEqual(
    issues.map(({ word }) => word),
    ["helo", "helo", "mispelled"],
  );
  assert.equal(
    source.slice(issues[0].offset, issues[0].offset + issues[0].length),
    "he&#108;o",
  );
  assert.equal(
    source.slice(issues[1].offset, issues[1].offset + issues[1].length),
    "he<em>lo",
  );
  assert.equal(issues[0].replacement, undefined);
  assert.equal(issues[1].replacement, undefined);
  assert.equal(issues[2].line, 2);
  assert.equal(issues[2].column, 4);
  assert.equal(
    applyCorrections(source, issues),
    source.replace("mispelled", "misspelled"),
  );
  assert.deepEqual(await check("<p>hel<strong>lo</strong> world</p>"), []);
  const attribute = (await check('<img alt="he&#108;o">'))[0];
  assert.equal(attribute.word, "helo");
  assert.equal(attribute.offset, 10);
  assert.equal(attribute.replacement, undefined);
  assert.deepEqual(
    (await check("<p>&amp;helo;</p>")).map(({ word }) => word),
    ["helo"],
  );
});

test("HTML preserves native front matter and checks visible CDATA without losing source coordinates", async () => {
  const source =
    "---\ntitle: qzxfrontmatter 😀\n---\nhelo\n<svg><text><![CDATA[helo]]></text></svg>";
  const issues = await check(source, { autocorrect: true });
  assert.deepEqual(
    issues.map(({ word, line }) => [word, line]),
    [
      ["helo", 4],
      ["helo", 5],
    ],
  );
  assert.equal(issues[0].offset, source.indexOf("helo"));
  const corrected = source.replaceAll("helo", "hello");
  assert.equal(applyCorrections(source, issues), corrected);
  assert.equal(
    await format(source),
    await prettier.format(corrected, { parser: "html" }),
  );
});

test("HTML corrections retain normal formatting, idempotence, and caller options", async () => {
  const source = "\uFEFF<div><p>helo</p><p>mispelled</p></div>\r\n";
  const corrected = source
    .replace("helo", "hello")
    .replace("mispelled", "misspelled");
  const options = defineConfig({
    parser: "html",
    endOfLine: "crlf",
    spellcheck: { enabled: true, autocorrect: true },
  });
  const actual = await prettier.format(source, options);
  assert.equal(
    actual,
    await prettier.format(corrected, { parser: "html", endOfLine: "crlf" }),
  );
  assert.equal(await prettier.format(actual, options), actual);
  assert.equal(options.spellcheck, true);
  assert.match(
    await prettier.format("// helo\n", { ...options, parser: "babel" }),
    /\/\/ hello/u,
  );
});

test("HTML honors spelling directives, ignored nodes, and ignored attributes without leaking hidden directives", async () => {
  const source = [
    "<!-- spellcheck:disable -- deliberate example -->",
    "<p>qzxhidden</p>",
    "<!-- spellcheck:enable -->",
    "<!-- prettier-ignore -->",
    '<section title="qzxignored"><!-- spellcheck-disable-file --><p>qzxignored</p></section>',
    "<p>helo</p>",
    "<!-- prettier-ignore-attribute -->",
    '<img alt="qzxattribute" src="qzxpath">',
    "<!-- prettier-ignore-attribute title -->",
    '<div title="qzxattribute" aria-label="helo">hello</div>',
  ].join("\n");
  assert.deepEqual(
    (await check(source)).map(({ word }) => word),
    ["helo", "helo"],
  );
  assert.deepEqual(
    await check("<p>qzxhidden</p><!-- spellcheck:todo -- deliberate -->"),
    [],
  );
});

test("HTML template expressions are not prose and cannot control surrounding spelling", async () => {
  const source =
    "{% assign text = '<!-- spellcheck-disable-file -->' %}<p>helo {{ qzxexpression }} qzx{{ value }}fragment</p>";
  assert.deepEqual(
    (await check(source)).map(({ word }) => word),
    ["helo"],
  );
});

test("HTML can be disabled without expanding Markdown, tagged-template, or other template-language scopes", async () => {
  const source = "<p>helo</p>";
  assert.deepEqual(await check(source, { html: false }), []);
  assert.equal(
    await format(source, { html: false }),
    await prettier.format(source, { parser: "html" }),
  );
  for (const [parser, input] of [
    ["markdown", "# hello\n\n<div>helo</div>\n"],
    ["markdown", "```html\n<p>helo</p>\n```\n"],
    ["babel", "const page = html`<p>helo</p>`;"],
    ["vue", "<template><p>helo</p></template>"],
    ["angular", "<p>helo</p>"],
  ]) {
    assert.equal(
      await format(input, {}, { parser }),
      await prettier.format(input, { parser }),
      parser,
    );
  }
  await assert.rejects(check("<p><div></p>"), /Unexpected closing tag/u);
});
