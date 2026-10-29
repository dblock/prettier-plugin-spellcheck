# prettier-plugin-spellcheck

[![Test](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/prettier-plugin-spellcheck/actions/workflows/lint.yml) [![Coverage](https://coveralls.io/repos/github/dblock/prettier-plugin-spellcheck/badge.svg?branch=main)](https://coveralls.io/github/dblock/prettier-plugin-spellcheck?branch=main)

Markdown, HTML, plain-text, and JavaScript/TypeScript spelling checks with opt-in prose autocorrection for Prettier, powered by CSpell.

Requires Node.js 22.18 or later and Prettier 3.7 or later (3.x).

## Installation

```sh
npm install --save-dev prettier github:dblock/prettier-plugin-spellcheck
```

The package is not yet published to npm; install from GitHub for now.

## Usage

No spelling configuration is required. Load the plugin on the command line:

```sh
npx prettier --plugin prettier-plugin-spellcheck --check "**/*.{md,html,txt,js,jsx,ts,tsx}"
```

Alternatively, register it in your normal Prettier configuration:

```json
{
  "plugins": ["prettier-plugin-spellcheck"]
}
```

Spelling errors fail formatting with line/column locations and suggestions. Prettier has no native spelling-diagnostics interface, so errors are reported as formatter failures, not warnings. Markdown, HTML, and plain-text prose, code comments, and user-facing JSX text are checked by default. MDX is not supported.

Example run:

```sh
printf '# helo\n' | npx prettier --plugin prettier-plugin-spellcheck --stdin-filepath example.md
```

Simplified output:

```text
example.md:1:3 Misspelled word: "helo". Suggestions: hello, helio, halo.
```

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
  "spellcheckConfig": "./config/spellcheck.json"
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
npx prettier-plugin-spellcheck collect "**/*.{md,html,txt,js,jsx,ts,tsx}" --output .spellcheck.txt
# Edit .spellcheck.txt: keep only words you want to accept.
npx prettier-plugin-spellcheck add ./.spellcheck.txt
```

`collect` respects `.gitignore`, `.prettierignore`, per-file Prettier configuration, spelling suppression comments, and configured dictionaries. It checks Markdown, HTML, plain text, and supported code files using the same scope settings as formatting, and skips unsupported languages and MDX. Configured vocabulary files and the selected output are excluded from inputs. It never changes source files; without `--refresh`, it never overwrites an existing candidate file. Collection does not compute suggestions.

To explicitly rebuild an existing vocabulary, inspired by rubocop-spellcheck:

```sh
npx prettier-plugin-spellcheck collect "**/*.{md,html,txt,js,jsx,ts,tsx}" --output .spellcheck.txt --refresh
```

`--refresh` ignores the selected vocabulary while checking, including aliases to that file, but retains all other dictionaries and suppression rules. It removes obsolete entries, preserves comments and the original spelling/order of retained entries, and appends sorted new candidates. **Scan the full intended project and review new candidates for typos:** partial scans can remove words still used elsewhere. An existing regular `.txt` output is required; symbolic links, concurrent edits, failed scans, and wholly disabled input sets are rejected without replacing the vocabulary. A successful scan with no unknown words clears obsolete entries while retaining comments. Source and configuration files are never rewritten.

Use `--config path/to/prettier.config.mjs` to select an explicit Prettier configuration. Otherwise the commands discover the normal Prettier configuration; `collect` also applies each file's overrides.

`add` registers reviewed vocabulary in `spellcheck.json` by default, creating it if needed. If `spellcheckConfig` selects another JSON file, it updates that file instead. No Prettier configuration or helper is required.

For inline settings, `add` updates a static `export default defineConfig({...})` with a literal dictionary array, preserving other settings and comments. Dynamic inline configurations must be edited manually. Updated configurations are formatted with Prettier, duplicate paths are avoided, and disabled spelling is never silently enabled.

## YAML front matter in Markdown

YAML front matter checking applies only to YAML metadata at the start of Markdown documents, not standalone `.yaml`/`.yml` files, YAML code blocks, or MDX. It is enabled by default for string values, including nested objects and arrays. Keys, comments, numbers, and booleans are skipped. Anchored strings are checked once at their definition; aliases are not expanded.

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

## JavaScript and TypeScript

Prettier exposes language-specific ASTs through its public parsers. The plugin uses these ASTs to select comments, JSX text, strings, and identifiers without interpreting the rest of the source as prose. Supports JavaScript, TypeScript, Flow, JSX, and TSX through the `babel`, `babel-ts`, `babel-flow`, `typescript`, `flow`, `acorn`, and `espree` parsers. Source code is parsed, never evaluated.

Comments and visible JSX text are checked by default. Literal `alt`, `title`, `placeholder`, `aria-label`, and `aria-description` attributes are checked too. JSX expressions, structural attributes such as `className` and `src`, and other programmatic strings are excluded by default.

Comments are parsed as Markdown, combining adjacent line comments so code fences work. Inline code, fenced and indented examples, links' destinations, JSDoc/TSDoc tag names, types, parameter names, and `@example` code are skipped by default. Documentation descriptions and link labels are checked. Tooling directives, shebangs, and source map references are excluded.

Inspired by [rubocop-spellcheck](https://github.com/dblock/rubocop-spellcheck), strings and identifiers can be enabled separately. In `spellcheck.json`, an explicit spelling configuration, or the helper's nested `spellcheck` object:

```json
{
  "code": {
    "comments": true,
    "jsx": true,
    "strings": false,
    "identifiers": false,
    "fences": false
  }
}
```

`strings: true` checks ordinary literals and literal text in template interpolation, including decoded escapes. Module paths in imports, exports, `require`, and `new URL`, object/property keys, regular expressions, directives, and tagged template text are excluded. Expressions inside template interpolation are still checked according to the enabled scopes.

`identifiers: true` checks every identifier occurrence, splitting names at underscores, numbers, and case boundaries, including acronym boundaries. Intentional API names and abbreviations belong in project vocabulary.

Strings, attributes, and identifiers are **report-only**, even with autocorrection enabled: changing runtime text or renaming one occurrence can break behavior or external APIs. Comment prose and literal JSX text can use conservative autocorrection. If any report-only spelling error remains, the entire file is left untouched.

Set `code: false` to retain Markdown checking without checking code. Individual scope flags can also be disabled. Other Prettier languages and MDX remain outside this code support.

Native code comments support `// spellcheck-disable`, `// spellcheck-enable`, `// spellcheck-disable-file`, `// spellcheck-disable-line`, and `// spellcheck-disable-next-line`, including block-comment forms. `// prettier-ignore` also excludes the following AST node from spelling. Directive-looking text inside string literals does not control spelling.

### Tagged code fences

Set `code.fences: true` to check explicitly tagged JavaScript/TypeScript fences in Markdown documents and code documentation. Supported labels are `js`, `javascript`, `jsx`, `mjs`, `cjs`, `ts`, `typescript`, `tsx`, and `flow`, case-insensitively. The same comment, JSX, string, and identifier scope settings apply; strings and identifiers still cannot be corrected automatically.

This adapts tagged-code checking from rubocop-spellcheck. Untagged fences, other languages, indented code, inline code, and `@example` blocks remain excluded. Diagnostics map back through list/quote prefixes and original line endings. Directives inside a fence cannot suppress surrounding prose. Invalid selected snippets are errors; suppress or ignore the entire fence to leave an intentionally incomplete example unchecked.

## Plain text

The plugin checks `.txt` and `.text` files literally, inspired by [dylint-spellcheck](https://github.com/dblock/dylint-spellcheck). Backticks, markup, Liquid, and directive-looking text have no special meaning; URLs, email addresses, and identifier-like tokens are still skipped. Use `--parser spellcheck-text` for documents without an extension.

Plain-text formatting preserves spacing, indentation, and final newlines instead of applying Markdown formatting. Normal Prettier line-ending options still apply, and opt-in autocorrection uses the same conservative rules. Configured `.txt` vocabulary files are excluded from spelling and remain unchanged.

## HTML

Standalone HTML is checked through Prettier's public `html` parser. Text content, including page titles, and literal `alt`, `title`, `placeholder`, `aria-label`, and `aria-description` attributes are checked by default. Structural attributes such as `class`, `id`, `src`, and `href` are not prose.

Scripts, styles, `code`, `pre`, `kbd`, `samp`, `template`, elements with the `hidden` attribute, front matter, and ordinary comment text are excluded. YAML front matter checking is Markdown-only. Template expressions and Liquid tags are skipped, never evaluated. CSS visibility is not computed. HTML-comment spelling directives and Prettier's `prettier-ignore`/`prettier-ignore-attribute` comments are honored.

Entities are decoded using parser tokens, with original source coordinates preserved. Text can use conservative opt-in autocorrection, but words containing encoded entities or split across inline elements are report-only because rewriting their source could change markup. Attributes are always report-only. Scripts and styles still receive ordinary Prettier formatting without embedded spelling checks.

Set `html: false` in your spelling settings to disable HTML checking. Raw HTML and HTML fences inside Markdown remain excluded; the `angular`, `vue`, `lwc`, and `mjml` parsers are not included in this support.

## Corrections

Set `autocorrect` to `true` in your spelling settings, then run:

```sh
npx prettier --plugin prettier-plugin-spellcheck --write "**/*.{md,html,txt,js,jsx,ts,tsx}"
```

Corrections are opt-in. A lowercase or title-case word is only replaced when the dictionary-valid first suggestion is one letter edit or transposition away. ALL CAPS, mixed case, and words inside dotted, hyphenated, or identifier-like tokens are not automatically corrected.

If any spelling error in a file lacks an approved correction, that entire file fails without being rewritten. Other files in the same Prettier invocation may still be written. Review the diff: even conservative spelling corrections can change meaning.

Use `enabled: false` in your spelling settings to turn off checking. The ordinary Prettier option `spellcheck: false` also disables spelling, without a helper, while retaining normal formatting; an explicit boolean `spellcheck` overrides the settings' `enabled` value.

Standard Prettier overrides are supported, including switching between inline and external settings. An override's settings replace the root settings rather than deep-merging them.

## Scope

Uses Prettier's public language ASTs and CSpell dictionaries directly. Markdown checking covers headings, paragraphs, lists, quotes, tables, link labels, image descriptions, and string values in YAML front matter. Markdown code blocks are skipped unless tagged-code checking is enabled. Raw HTML within Markdown, link destinations, URLs, email addresses, and entity-encoded word fragments are skipped.

Use `<!-- spellcheck-disable -->` and `<!-- spellcheck-enable -->` to suppress spelling in a region. The `spellcheck-disable-file`, `spellcheck-disable-line`, and `spellcheck-disable-next-line` variants are also supported. Existing `<!-- markdownlint-disable spellcheck -->` comments remain compatible without loading markdownlint.

Directives accept a reason after `--` and optional comma- or space-separated rule names, including `all`. The colon forms `spellcheck:disable` and `spellcheck:enable` are also supported: a standalone disable starts a region, but a trailing colon disable suppresses only its own line. `spellcheck:todo` always suppresses its own line. These forms also work in native code comments. HTML directives inside code documentation stay local to their comment group; directives inside examples, Liquid, and ignored nodes cannot disable surrounding prose.

Prettier's `<!-- prettier-ignore -->` directive skips the next Markdown node for both spelling and formatting. Properly separated top-level `prettier-ignore-start`/`prettier-ignore-end` ranges are skipped too. Ignore-looking text inside code is not treated as a directive.

Unicode words, accented letters, apostrophes, and original UTF-16 source coordinates are supported. Curly apostrophes also try straight-apostrophe dictionary lookup without ignoring vocabulary capitalization; corrections preserve the original apostrophe style. Liquid expressions (`{{ ... }}`) and tags (`{% ... %}`), including multiline forms, are excluded from Markdown spelling checks; surrounding prose is checked. Ordinary formatting remains delegated to Prettier.

The plugin wraps Prettier's built-in Markdown, HTML, and supported code parsers. Plugins that also replace these parsers are not automatically composable; load order alone does not guarantee both transformations run.

## Contributing and releasing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md). Publishing to npm and creating release tags require explicit authorization.

## License

[MIT](LICENSE).
