import assert from "node:assert/strict";
import test from "node:test";
import * as prettier from "prettier";
import * as plugin from "../src/index.mjs";

const format = (source, options = {}) =>
  prettier.format(source, {
    parser: "markdown",
    plugins: [plugin],
    proseWrap: "never",
    ...options,
  });

test("reports spelling locations and suggestions without changing prose by default", async () => {
  await assert.rejects(format("# helo\n", { filepath: "example.md" }), (error) => {
    assert.match(error.message, /example\.md:1:3 Misspelled word: "helo"/u);
    assert.match(error.message, /Suggestions: hello/u);
    assert.match(error.message, /this file was not formatted/u);
    return true;
  });
});

test("autocorrects prose and delegates formatting to Prettier idempotently", async () => {
  const source = "#  Helo\n\nA mispelled word in [helo](https://wrng.invalid).\n";
  const options = { spellcheckAutocorrect: true };
  const actual = await format(source, options);
  assert.equal(
    actual,
    "# Hello\n\nA misspelled word in [hello](https://wrng.invalid).\n",
  );
  assert.equal(await format(actual, options), actual);
});

test("refuses partial corrections when another word needs manual review", async () => {
  await assert.rejects(
    format("helo xqzvvv\n", { spellcheckAutocorrect: true }),
    /<markdown>:1:6 Misspelled word: "xqzvvv"/u,
  );
});

test("does not rewrite mixed case, uppercase or identifier-like tokens", async () => {
  for (const source of ["heLo", "HELO", "helo-world", "helo.world"]) {
    await assert.rejects(
      format(source, { spellcheckAutocorrect: true }),
      /Spelling check failed/u,
    );
  }
  assert.equal(await format("wrong_token sha256\n"), "wrong_token sha256\n");
});

test("skips code, URLs, destinations and HTML", async () => {
  const source =
    "`wrng`\n\n```text\nwrng\n```\n\n[hello](wrng.md)\n\n<div>wrng</div>\n";
  assert.equal(
    await format(source),
    await prettier.format(source, { parser: "markdown", proseWrap: "never" }),
  );
});

test("can disable spelling without disabling ordinary formatting", async () => {
  assert.equal(
    await format("#  helo\n", { spellcheck: false }),
    "# helo\n",
  );
});
