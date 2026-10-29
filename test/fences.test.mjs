import assert from "node:assert/strict";
import test from "node:test";
import * as prettier from "prettier";
import { defineConfig } from "../src/index.mjs";
import { applyCorrections, checkSource } from "../src/spelling.mjs";

const settings = { autocorrect: true, code: { fences: true } };

test("tagged fences are opt-in, use language aliases, and leave other examples alone", async () => {
  for (const language of [
    "js",
    "javascript",
    "jsx",
    "mjs",
    "cjs",
    "ts",
    "typescript",
    "tsx",
    "flow",
    "JS",
  ]) {
    const source = `\`\`\`${language}\n// helo\n\`\`\`\n`;
    assert.deepEqual(await checkSource(source), []);
    assert.deepEqual(
      (await checkSource(source, settings)).map(({ word }) => word),
      ["helo"],
      language,
    );
  }
  for (const source of [
    "```\nhelo\n```\n",
    "```ruby\nhelo\n```\n",
    "    // helo\n",
  ]) {
    assert.deepEqual(await checkSource(source, settings), []);
  }
});

test("nested fenced JSX maps BOM, CRLF, and expanded tabs back to original source", async () => {
  const source =
    "\uFEFF> ```tsx\r\n>\tconst node = <div>helo</div>;\r\n> ```\r\n";
  const issues = await checkSource(source, settings);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].offset, source.indexOf("helo"));
  assert.equal(issues[0].line, 2);
  assert.equal(issues[0].column, source.indexOf("helo") - source.indexOf("\n"));
  assert.equal(
    applyCorrections(source, issues),
    source.replace("helo", "hello"),
  );
  const options = { parser: "markdown", endOfLine: "crlf" };
  assert.equal(
    await prettier.format(
      source,
      defineConfig({ ...options, spellcheck: settings }),
    ),
    await prettier.format(source.replace("helo", "hello"), options),
  );
});

test("fenced strings and identifiers remain report-only with exact escape source ranges", async () => {
  const source =
    "# helo\n\n- ```ts\n  const heloValue: string = '\\u0068elo';\n  ```\n";
  const config = {
    autocorrect: true,
    code: { fences: true, strings: true, identifiers: true },
  };
  const issues = await checkSource(source, config);
  assert.deepEqual(
    issues.map(({ word, replacement }) => ({ word, replacement })),
    [
      { word: "helo", replacement: "hello" },
      { word: "helo", replacement: undefined },
      { word: "helo", replacement: undefined },
    ],
  );
  assert.equal(issues[1].offset, source.indexOf("heloValue"));
  assert.equal(
    source.slice(issues[2].offset, issues[2].offset + issues[2].length),
    "\\u0068elo",
  );
  await assert.rejects(
    prettier.format(
      source,
      defineConfig({ parser: "markdown", spellcheck: config }),
    ),
    /Spelling check failed/u,
  );
});

test("fence directives are isolated and fully suppressed or ignored snippets are not parsed", async () => {
  const source = [
    "```js",
    "// spellcheck-disable-file -- deliberate example",
    "// qzxhidden",
    "```",
    "",
    "helo",
    "",
    "<!-- spellcheck-disable -->",
    "```js",
    "const = ;",
    "```",
    "<!-- spellcheck-enable -->",
    "",
    "<!-- prettier-ignore -->",
    "```ts",
    "const = ;",
    "```",
    "",
    "```js",
    "// helo",
    "```",
  ].join("\n");
  assert.deepEqual(
    (await checkSource(source, settings)).map(({ word }) => word),
    ["helo", "helo"],
  );
  await assert.rejects(
    checkSource("Hello\n\n```ts\nconst = ;\n```\n", settings),
    /Invalid ts code fence at line 3/u,
  );
});

test("tagged examples inside code documentation retain outer comment positions", async () => {
  const source = "/**\n * ```js\n * // helo\n * ```\n */\n";
  const issues = await checkSource(source, settings, { parser: "babel" });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].offset, source.indexOf("helo"));
  assert.equal(issues[0].line, 3);
  assert.equal(
    applyCorrections(source, issues),
    source.replace("helo", "hello"),
  );
});
