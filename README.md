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

No spelling configuration is required. Load the plugin on the command line:

```sh
npx prettier --plugin prettier-plugin-spellcheck --check "**/*.md"
```

Alternatively, register it in your normal Prettier configuration:

```json
{
  "plugins": ["prettier-plugin-spellcheck"]
}
```

Spelling errors fail formatting with line/column locations and suggestions. Prettier has no native spelling-diagnostics interface, so errors are reported as formatter failures, not warnings. Spelling is checked in Markdown prose, not source code or MDX.

## Configuration

### Automatic configuration

The plugin automatically reads `spellcheck.json` from the process working directory when it exists. If it is absent, bundled American English is used and autocorrection is off. No helper or additional Prettier options are needed.

An optional `spellcheck.json`:

```json
{
  "autocorrect": false
}
```

### Explicit configuration file

Select a different file with `spellcheckConfig` in any normal Prettier configuration, without a helper:

```json
{
  "plugins": ["prettier-plugin-spellcheck"],
  "spellcheckConfig": "./config/spelling.json"
}
```

The selected JSON file has the same settings as `spellcheck.json`. Paths are relative to the process working directory. An explicitly selected missing file is an error; it never falls back to the default file.

### Inline configuration

For inline settings, use `defineConfig` in `.prettierrc.mjs`:

```js
import { defineConfig } from "prettier-plugin-spellcheck";

export default defineConfig({
  spellcheck: {
    autocorrect: false,
  },
});
```

The helper registers the plugin and accepts one nested `spellcheck` object alongside ordinary Prettier settings. Prettier's public plugin options do not accept objects, so the helper serializes inline settings internally.

Priority is **inline settings → explicit `spellcheckConfig` → automatic `spellcheck.json` → built-in defaults**. Inline settings replace, rather than merge with, file settings. Configuration files are reloaded on every format. Invalid configuration is an error.

## Dictionaries

In `spellcheck.json`, an explicit configuration file, or the helper's nested `spellcheck` object:

```json
{
  "dictionaries": [
    "@cspell/dict-en_us",
    "@cspell/dict-software-terms",
    "@cspell/dict-es-es",
    "./.spellcheck.txt"
  ]
}
```

An explicit `dictionaries` array replaces the default, so include `@cspell/dict-en_us` if you still want English. All configured languages participate together.

Install additional dictionary packages in the project where you run Prettier:

```sh
npm install --save-dev @cspell/dict-software-terms @cspell/dict-es-es
```

Create `.spellcheck.txt` with one accepted, case-sensitive word per line. Blank lines and `#` comments are ignored. Vocabulary paths are relative to the process working directory in all configuration forms, and vocabulary is reloaded on every format. Use absolute paths when running Prettier from elsewhere.

No dictionary discovery, network requests, CSpell configuration imports, or Hunspell/system dictionaries are used while formatting. Missing or invalid dictionaries are errors.

## Project vocabulary

Collect unknown words, review the candidates to remove actual typos, and add the reviewed dictionary:

```sh
npx prettier-plugin-spellcheck collect "**/*.md" --output .spellcheck.txt
# Edit .spellcheck.txt: keep only words you want to accept.
npx prettier-plugin-spellcheck add ./.spellcheck.txt
```

`collect` respects `.gitignore`, `.prettierignore`, per-file Prettier configuration, spelling suppression comments, and configured dictionaries. It skips source code and MDX and never changes input files or overwrites an existing candidate file. Collection does not compute suggestions.

Use `--config path/to/prettier.config.mjs` to select an explicit Prettier configuration. Otherwise the commands discover the normal Prettier configuration; `collect` also applies each file's overrides.

`add` registers reviewed vocabulary in `spellcheck.json` by default, creating it if needed. If `spellcheckConfig` selects another JSON file, it updates that file instead. No Prettier configuration or helper is required.

For inline settings, `add` updates a static `export default defineConfig({...})` with a literal dictionary array, preserving other settings and comments. Dynamic inline configurations must be edited manually. Updated configurations are formatted with Prettier, duplicate paths are avoided, and disabled spelling is never silently enabled.

## YAML front matter

YAML front matter checking is enabled by default for string values, including nested objects and arrays. Keys, comments, numbers, and booleans are skipped. Anchored strings are checked once at their definition; aliases are not expanded.

Select fields with `frontMatter` in your spelling settings:

```json
{
  "frontMatter": {
    "include": ["title", "description", "authors.name", "metadata"],
    "exclude": ["metadata.id", "metadata.url"]
  }
}
```

Omitting `include` checks all string values; `include: []` checks none. Dotted paths select nested fields, including fields inside arrays without numeric indices. Selecting a parent includes its subtree, and exclusions win.

Set `frontMatter: false` to skip front matter spelling. Quoted and block string values are checked but never automatically corrected. Plain values can be corrected only when the replacement remains a YAML string. Malformed YAML and invalid field selectors are errors. Non-YAML front matter is not spellchecked.

## Corrections

Set `autocorrect` to `true` in your spelling settings, then run:

```sh
npx prettier --plugin prettier-plugin-spellcheck --write "**/*.md"
```

Corrections are opt-in. A lowercase or title-case word is only replaced when the dictionary-valid first suggestion is one letter edit or transposition away. ALL CAPS, mixed case, and words inside dotted, hyphenated, or identifier-like tokens are not automatically corrected.

If any spelling error in a file lacks an approved correction, that entire file fails without being rewritten. Other files in the same Prettier invocation may still be written. Review the diff: even conservative spelling corrections can change meaning.

Use `enabled: false` in your spelling settings to turn off checking. The ordinary Prettier option `spellcheck: false` also disables spelling, without a helper, while retaining normal Markdown formatting; an explicit boolean `spellcheck` overrides the settings' `enabled` value.

Standard Prettier overrides are supported, including switching between inline and external settings. An override's settings replace the root settings rather than deep-merging them.

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
