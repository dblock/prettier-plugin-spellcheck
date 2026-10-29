import assert from "node:assert/strict";
import test from "node:test";
import * as prettier from "prettier";
import { defineConfig } from "../src/index.mjs";
import { codeParsers } from "../src/code.mjs";
import { applyCorrections, checkSource } from "../src/spelling.mjs";

const check = (source, settings = {}, parser = "babel") =>
  checkSource(source, settings, { parser });
const format = (source, settings = {}, options = {}) =>
  prettier.format(
    source,
    defineConfig({
      parser: "babel",
      spellcheck: { autocorrect: true, ...settings },
      ...options,
    }),
  );

test("checks and corrects JS, TS, and Flow comments with every supported parser", async () => {
  const source = 'const helo = "wrng"; // helo\n/** mispelled */\n';
  const corrected = source
    .replace("// helo", "// hello")
    .replace("mispelled", "misspelled");
  for (const parser of Object.keys(codeParsers)) {
    const issues = await check(source, {}, parser);
    assert.deepEqual(
      issues.map(({ word }) => word),
      ["helo", "mispelled"],
      parser,
    );
    const actual = await format(source, {}, { parser });
    assert.equal(actual, await prettier.format(corrected, { parser }), parser);
    assert.equal(await format(actual, {}, { parser }), actual, parser);
  }
});

test("treats comments as Markdown and skips documentation syntax and examples", async () => {
  const source = [
    "/**",
    " * @param {{wrng: string}} qzxparam - A helo message.",
    " * @returns {Promise<wrng>} A mispelled value.",
    " * @example",
    " * wrng.call('wrng');",
    " * @deprecated Use [helo](https://wrng.invalid) and `wrng`.",
    " * See {@link wrng} and {@link wrng|helo}.",
    " */",
    "// ```js",
    "// wrng.call('wrng');",
    "// ```",
    "// TODO(owner): helo",
    "",
  ].join("\n");
  assert.deepEqual(
    (await check(source)).map(({ word }) => word),
    ["helo", "mispelled", "helo", "helo", "helo"],
  );
  const actual = await format(source);
  assert.match(actual, /qzxparam - A hello message/u);
  assert.match(actual, /A misspelled value/u);
  assert.match(actual, /wrng\.call\('wrng'\)/u);
});

test("checks JSX text and human-facing attributes, not expressions or structural attributes", async () => {
  const source =
    'const node = <div className="wrng">helo {wrng}<img alt="helo" src="wrng.png" /></div>;';
  for (const parser of Object.keys(codeParsers)) {
    assert.deepEqual(
      (await check(source, {}, parser)).map(({ word }) => word),
      ["helo", "helo"],
      parser,
    );
  }
  await assert.rejects(format(source), /Spelling check failed/u);
  const corrected = source.replace('alt="helo"', 'alt="hello"');
  const actual = await format(corrected);
  assert.match(actual, /hello \{wrng\}/u);
  assert.match(actual, /className="wrng"/u);
  assert.deepEqual(await check(source, { code: { jsx: false } }), []);
});

test("opt-in strings decode escapes and interpolation, with source-correct report-only diagnostics", async () => {
  const source = 'const a = "\\u0068elo"; const b = `mispelled ${"helo"}`;';
  for (const parser of Object.keys(codeParsers)) {
    assert.deepEqual(await check(source, {}, parser), []);
    const issues = await check(
      source,
      { autocorrect: true, code: { strings: true } },
      parser,
    );
    assert.deepEqual(
      issues.map(({ word }) => word).sort(),
      ["helo", "helo", "mispelled"],
      parser,
    );
    assert.equal(
      source.slice(issues[0].offset, issues[0].offset + issues[0].length),
      "\\u0068elo",
      parser,
    );
    assert.ok(
      issues.every(({ replacement }) => replacement === undefined),
      parser,
    );
  }
});

test("opt-in strings exclude dependencies, object keys, directives, regexes, and tagged templates", async () => {
  const source = [
    '"wrng";',
    'import value from "wrng";',
    'export * from "wrng";',
    'import("wrng"); require("wrng"); require.resolve("wrng"); module.require("wrng");',
    'new URL("wrng", import.meta.url);',
    'const object = {"wrng": "hello"}; object["wrng"];',
    "const expression = /wrng/; sql`wrng`;",
  ].join("\n");
  for (const parser of Object.keys(codeParsers)) {
    assert.deepEqual(
      await check(source, { code: { strings: true } }, parser),
      [],
      parser,
    );
  }
  assert.deepEqual(
    await check(
      'type Value = import("wrng").Value;',
      {
        code: { strings: true },
      },
      "typescript",
    ),
    [],
  );
});

test("opt-in identifiers split case, acronym, underscore, and number boundaries but never rename", async () => {
  const source =
    "const heloWorld = {mispelled_name: 1}; heloWorld.mispelled_name;";
  const settings = { autocorrect: true, code: { identifiers: true } };
  for (const parser of Object.keys(codeParsers)) {
    const issues = await check(source, settings, parser);
    assert.deepEqual(
      issues.map(({ word }) => word),
      ["helo", "mispelled", "helo", "mispelled"],
      parser,
    );
    assert.ok(
      issues.every(({ replacement }) => replacement === undefined),
      parser,
    );
  }
  const acronym = await check("const HTTPHelo2Wrld = 1;", settings);
  assert.deepEqual(
    acronym.map(({ word }) => word).filter((word) => word !== "HTTP"),
    ["Helo", "Wrld"],
  );
});

test("honors code suppression comments, tooling directives, and prettier-ignore", async () => {
  const source = [
    "// eslint-disable-next-line no-wrng-rule",
    "// @ts-expect-error wrng",
    "//# sourceMappingURL=wrng.map",
    "// spellcheck-disable",
    'const value = "wrng"; // wrng',
    "// spellcheck-enable",
    "// wrng spellcheck-disable-line",
    "// spellcheck-disable-next-line",
    'const next = "wrng";',
    "// prettier-ignore",
    "const element = <div>wrng</div>;",
    "// helo",
  ].join("\n");
  const settings = { code: { strings: true } };
  assert.deepEqual(
    (await check(source, settings)).map(({ word }) => word),
    ["helo"],
  );
  assert.deepEqual(await check("/* spellcheck-disable-file */\n// wrng\n"), []);
});

test("preserves code BOM, Unicode, CRLF offsets, and ordinary formatting", async () => {
  const source = "\uFEFF// 😀 helo\r\nconst value = 1;\r\n";
  const issues = await check(source, { autocorrect: true });
  assert.equal(issues[0].offset, source.indexOf("helo"));
  assert.equal(issues[0].line, 1);
  assert.equal(issues[0].column, 7);
  assert.equal(
    applyCorrections(source, issues),
    source.replace("helo", "hello"),
  );
  assert.equal(
    await format(source, {}, { endOfLine: "crlf" }),
    await prettier.format(source.replace("helo", "hello"), {
      parser: "babel",
      endOfLine: "crlf",
    }),
  );
  assert.equal(
    await format("// helo\nconst value=1;", { code: false }),
    await prettier.format("// helo\nconst value=1;", { parser: "babel" }),
  );
  await assert.rejects(check("const = ;"), /Unexpected token/u);
});

test("native directives accept reasons and colon forms without checking explanation text", async () => {
  const source = [
    "// spellcheck:disable -- qzxreason",
    "// qzxhidden",
    "// spellcheck:enable -- qzxreason",
    "// qzxhidden spellcheck:todo -- qzxreason",
    "// qzxhidden spellcheck:disable -- qzxreason",
    "// helo spellcheck-enable all -- qzxreason",
    "// helo",
  ].join("\n");
  assert.deepEqual(
    (await check(source)).map(({ word }) => word),
    ["helo", "helo"],
  );
});

test("documentation directives stay in their comment group and examples cannot control spelling", async () => {
  const source = [
    "/** <!-- spellcheck-disable-file -- deliberate example -->",
    " * qzxhidden",
    " */",
    "const value = 1;",
    "/** helo */",
    "// ```js",
    "// // spellcheck-disable -- deliberate example",
    "// ```",
    "// helo",
  ].join("\n");
  assert.deepEqual(
    (await check(source)).map(({ word }) => word),
    ["helo", "helo"],
  );
});
