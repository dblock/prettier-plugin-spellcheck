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

## Corrections

Set `"spellcheckAutocorrect": true` in your Prettier configuration, then run:

```sh
npx prettier --write "**/*.md"
```

Corrections are opt-in. The underlying rule only replaces a lowercase or title-case word when the dictionary-valid first suggestion is one letter edit or transposition away. ALL CAPS, mixed case, and words inside dotted, hyphenated, or identifier-like tokens are not automatically corrected.

If any spelling error in a file lacks an approved correction, that entire file fails without being rewritten. Other files in the same Prettier invocation may still be written. Review the diff: even conservative spelling corrections can change meaning.

Use `"spellcheck": false` to turn off spelling while retaining normal Markdown formatting.

## Scope

Uses [markdownlint-rule-spellcheck](https://github.com/dblock/markdownlint-rule-spellcheck) and its offline CSpell English dictionary. Checks headings, paragraphs, lists, quotes, tables, link labels, and image descriptions. Skips code, HTML, link destinations, URLs, and email addresses. YAML front matter is currently skipped.

Markdownlint suppression comments such as `<!-- markdownlint-disable spellcheck -->` are supported. Other Markdown files and embedded code continue to use Prettier's ordinary formatting.

The plugin wraps Prettier's built-in `markdown` parser. Plugins that also replace that parser are not automatically composable; load order alone does not guarantee both transformations run.

## License

[MIT](LICENSE).
