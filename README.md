# prettier-plugin-spellcheck

[![Test](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/lint.yml) [![Coverage](https://coveralls.io/repos/github/dblock/prettier-plugin-spellcheck/badge.svg?branch=main)](https://coveralls.io/github/dblock/prettier-plugin-spellcheck?branch=main)

Markdown spelling checks and opt-in autocorrection for Prettier, powered by CSpell.

Requires Node.js 22.18 or later and Prettier 3.7 or later (3.x).

## Installation

```sh
npm install --save-dev prettier github:dblock/prettier-plugin-spellcheck
```

The package is not yet published to npm; install from GitHub for now.

## Usage

In `.prettierrc.mjs`:

```js
import { defineConfig } from "prettier-plugin-spellcheck";

export default defineConfig({
  spellcheck: {
    autocorrect: false,
  },
});
```

`defineConfig` registers the plugin and accepts one nested `spellcheck` object alongside ordinary Prettier settings. Prettier's public plugin options do not accept objects, so the helper serializes that option internally. Use a JavaScript configuration, not a nested object in `.prettierrc.json`.

```sh
npx prettier --check "**/*.md"
```

Spelling errors fail formatting with line/column locations and suggestions. Prettier has no native spelling-diagnostics interface, so errors are reported as formatter failures, not warnings. Spelling is checked in Markdown prose, not source code or MDX.

## Dictionaries

Bundled American English is the default. Configure additional dictionaries inline in the same Prettier configuration:

```js
import { defineConfig } from "prettier-plugin-spellcheck";

export default defineConfig({
  spellcheck: {
    dictionaries: [
      "@cspell/dict-en_us",
      "@cspell/dict-software-terms",
      "@cspell/dict-es-es",
      "./.spellcheck.txt",
    ],
  },
});
```

Create `.spellcheck.txt` with one accepted, case-sensitive word per line. Blank lines and `#` comments are ignored. Vocabulary files are resolved relative to the process working directory and reloaded on each format, so editor sessions see edits immediately. Use absolute paths when running Prettier from elsewhere.

An explicit `dictionaries` array replaces the default, so include `@cspell/dict-en_us` if you still want English. All configured languages participate together.

Install additional dictionary packages in the project where you run Prettier:

```sh
npm install --save-dev @cspell/dict-software-terms @cspell/dict-es-es
```

No dictionary discovery, network requests, CSpell configuration imports, or Hunspell/system dictionaries are used while formatting. Invalid configuration and missing dictionaries are errors.

## Project vocabulary

Collect unknown words, review the candidates to remove actual typos, and add the reviewed dictionary:

```sh
npx prettier-plugin-spellcheck collect "**/*.md" --output .spellcheck.txt
# Edit .spellcheck.txt: keep only words you want to accept.
npx prettier-plugin-spellcheck add ./.spellcheck.txt
```

`collect` respects `.gitignore`, `.prettierignore`, per-file Prettier configuration, spelling suppression comments, and configured dictionaries. It skips source code and MDX and never changes input files or overwrites an existing candidate file. Collection does not compute suggestions.

Use `--config path/to/prettier.config.mjs` to select an explicit Prettier configuration. Otherwise `collect` resolves each file's normal Prettier configuration, including overrides.

`add` registers the reviewed vocabulary in the discovered Prettier configuration, or creates `.prettierrc.mjs` if none exists. It preserves other settings, formats the configuration with Prettier, and avoids duplicate dictionary paths. Existing configurations must use a static `export default defineConfig({...})` with a literal dictionary array; dynamic configurations and non-JavaScript formats must be edited manually. Disabled spelling is never silently enabled.

## YAML front matter

YAML front matter checking is enabled by default for string values, including nested objects and arrays. Keys, comments, numbers, and booleans are skipped. Anchored strings are checked once at their definition; aliases are not expanded.

Select fields under `spellcheck.frontMatter`:

```js
export default defineConfig({
  spellcheck: {
    frontMatter: {
      include: ["title", "description", "authors.name", "metadata"],
      exclude: ["metadata.id", "metadata.url"],
    },
  },
});
```

Omitting `include` checks all string values; `include: []` checks none. Dotted paths select nested fields, including fields inside arrays without numeric indices. Selecting a parent includes its subtree, and exclusions win.

Set `spellcheck: { frontMatter: false }` to skip front matter spelling. Quoted and block string values are checked but never automatically corrected. Plain values can be corrected only when the replacement remains a YAML string. Malformed YAML and invalid field selectors are errors. Non-YAML front matter is not spellchecked.

## Corrections

Set `spellcheck: { autocorrect: true }` in your Prettier configuration, then run:

```sh
npx prettier --write "**/*.md"
```

Corrections are opt-in. A lowercase or title-case word is only replaced when the dictionary-valid first suggestion is one letter edit or transposition away. ALL CAPS, mixed case, and words inside dotted, hyphenated, or identifier-like tokens are not automatically corrected.

If any spelling error in a file lacks an approved correction, that entire file fails without being rewritten. Other files in the same Prettier invocation may still be written. Review the diff: even conservative spelling corrections can change meaning.

Use `spellcheck: false` or `spellcheck: { enabled: false }` inside `defineConfig` to turn off spelling while retaining normal Markdown formatting. Standard Prettier overrides are supported; an override's `spellcheck` value replaces the root value rather than deep-merging it.

## Scope

Uses Prettier's public Markdown AST and CSpell dictionaries directly. There is no dependency on markdownlint or markdownlint-rule-spellcheck. Checks headings, paragraphs, lists, quotes, tables, link labels, image descriptions, and YAML string values. Skips code, HTML, link destinations, URLs, email addresses, and entity-encoded word fragments.

Use `<!-- spellcheck-disable -->` and `<!-- spellcheck-enable -->` to suppress spelling in a region. The `spellcheck-disable-file`, `spellcheck-disable-line`, and `spellcheck-disable-next-line` variants are also supported. Existing `<!-- markdownlint-disable spellcheck -->` comments remain compatible without loading markdownlint.

Prettier's `<!-- prettier-ignore -->` directive skips the next Markdown node for both spelling and formatting. Properly separated top-level `prettier-ignore-start`/`prettier-ignore-end` ranges are skipped too. Ignore-looking text inside code is not treated as a directive.

Unicode words, accented letters, apostrophes, and original UTF-16 source coordinates are supported. Liquid expressions (`{{ ... }}`) and tags (`{% ... %}`), including multiline forms, are excluded from spelling checks; surrounding prose is checked. Code and MDX continue to use Prettier's ordinary formatting.

The plugin wraps Prettier's built-in `markdown` parser. Plugins that also replace that parser are not automatically composable; load order alone does not guarantee both transformations run.

## Contributing and releasing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md). Publishing to npm and creating release tags require explicit authorization.

## License

[MIT](LICENSE).
