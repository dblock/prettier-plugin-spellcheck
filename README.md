# prettier-plugin-spellcheck

[![Test](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/lint.yml) [![Coverage](https://coveralls.io/repos/github/dblock/prettier-plugin-spellcheck/badge.svg?branch=main)](https://coveralls.io/github/dblock/prettier-plugin-spellcheck?branch=main)

Markdown spelling checks and opt-in autocorrection for Prettier, powered by CSpell.

Requires Node.js 22.18 or later and Prettier 3.7 or later (3.x).

## Installation

```sh
npm install --save-dev prettier prettier-plugin-spellcheck
```

The package is not yet published to npm. Until publication, install `github:dblock/prettier-plugin-spellcheck` instead.

## Usage

In `.prettierrc.json`:

```json
{
  "plugins": ["prettier-plugin-spellcheck"],
  "proseWrap": "never"
}
```

```sh
npx prettier --check "**/*.md"
```

Spelling errors fail formatting with line/column locations and suggestions. Prettier has no native spelling-diagnostics interface, so errors are reported as formatter failures, not warnings. Spelling is checked in Markdown prose, not source code or MDX.

## Dictionaries

Point `spellcheckConfig` at a JSON file in your Prettier configuration:

```json
{
  "plugins": ["prettier-plugin-spellcheck"],
  "spellcheckConfig": "./.spellcheck.json",
  "proseWrap": "never"
}
```

In `.spellcheck.json`:

```json
{
  "dictionaries": {
    "en": ["@cspell/dict-en_us", "./.spellcheck.txt"]
  }
}
```

Create `.spellcheck.txt` with one accepted, case-sensitive word per line. Blank lines and `#` comments are ignored. Vocabulary files are resolved relative to the spelling configuration file and reloaded on each format, so editor sessions see edits immediately.

The `spellcheckConfig` path is relative to the process working directory, not the Prettier configuration file. Use an absolute path when invoking Prettier from elsewhere. Installed dictionary packages resolve from the working directory; install them in the project where you run Prettier.

Without a spelling configuration, bundled American English is used. An explicit `dictionaries` map replaces that default, so include `@cspell/dict-en_us` if you still want English. All configured languages participate together:

```json
{
  "dictionaries": {
    "en": ["@cspell/dict-en_us", "@cspell/dict-software-terms"],
    "es": ["@cspell/dict-es-es"]
  }
}
```

Install additional dictionary packages yourself. No dictionary discovery, network requests, CSpell configuration imports, or Hunspell/system dictionaries are used while formatting. Invalid configuration and missing dictionaries are errors.

## Project vocabulary

Collect unknown words, review the candidates to remove actual typos, and add the reviewed dictionary:

```sh
npx prettier-plugin-spellcheck collect "**/*.md" --output .spellcheck.txt
# Edit .spellcheck.txt: keep only words you want to accept.
npx prettier-plugin-spellcheck add ./.spellcheck.txt
```

`collect` respects `.gitignore`, `.prettierignore`, per-file Prettier configuration, spelling suppression comments, and configured dictionaries. It skips source code and MDX and never changes input files or overwrites an existing candidate file. Collection does not compute suggestions.

Use `--config path/to/spelling.json` to select an explicit spelling configuration; otherwise `collect` uses each file's `spellcheckConfig` setting. `add` defaults to `.spellcheck.json`, preserves existing settings and languages, and avoids duplicate paths. Use `--language es` to add vocabulary under another language. Remember to set `spellcheckConfig` in your Prettier configuration after creating the spelling configuration.

## Corrections

Set `"spellcheckAutocorrect": true` in your Prettier configuration, then run:

```sh
npx prettier --write "**/*.md"
```

Corrections are opt-in. A lowercase or title-case word is only replaced when the dictionary-valid first suggestion is one letter edit or transposition away. ALL CAPS, mixed case, and words inside dotted, hyphenated, or identifier-like tokens are not automatically corrected.

If any spelling error in a file lacks an approved correction, that entire file fails without being rewritten. Other files in the same Prettier invocation may still be written. Review the diff: even conservative spelling corrections can change meaning.

Use `"spellcheck": false` to turn off spelling while retaining normal Markdown formatting.

## Scope

Uses Prettier's public Markdown AST and CSpell dictionaries directly. There is no runtime dependency on markdownlint or markdownlint-rule-spellcheck. Checks headings, paragraphs, lists, quotes, tables, link labels, and image descriptions. Skips code, HTML, link destinations, URLs, email addresses, and entity-encoded word fragments. YAML front matter is currently skipped.

Use `<!-- spellcheck-disable -->` and `<!-- spellcheck-enable -->` to suppress spelling in a region. The `spellcheck-disable-file`, `spellcheck-disable-line`, and `spellcheck-disable-next-line` variants are also supported. Existing `<!-- markdownlint-disable spellcheck -->` comments remain compatible without loading markdownlint.

Prettier's `<!-- prettier-ignore -->` directive skips the next Markdown node for both spelling and formatting. Properly separated top-level `prettier-ignore-start`/`prettier-ignore-end` ranges are skipped too. Ignore-looking text inside code is not treated as a directive.

Unicode words, accented letters, apostrophes, and original UTF-16 source coordinates are supported. Liquid expressions (`{{ ... }}`) and tags (`{% ... %}`), including multiline forms, are excluded from spelling checks; surrounding prose is checked. Code and MDX continue to use Prettier's ordinary formatting.

The plugin wraps Prettier's built-in `markdown` parser. Plugins that also replace that parser are not automatically composable; load order alone does not guarantee both transformations run.

## License

[MIT](LICENSE).
