# Changelog

## 0.1.1 (Next)

- Your contribution here.

## 0.1.0 (2026/10/29)

- Show concise spelling failures without stack traces, preserving word locations, suggestions, and failure exit status.
- Spellcheck standalone HTML prose and human-facing attributes with source-mapped entities, safe text corrections, suppression/ignore support, and vocabulary collection/refresh.
- Preserve inline suppression explanations across supported Prettier Markdown parser versions, including formatted reason text.
- Add explicit vocabulary refresh with stale-entry pruning, retained spelling/comments, dictionary-alias exclusion, and atomic replacement guarded against concurrent edits.
- Optionally check tagged JS/TS fences in Markdown and code documentation, preserving nested source coordinates and report-only runtime scopes.
- Check literal plain-text documents through a layout-preserving Prettier parser and vocabulary collection, excluding configured vocabulary resources.
- Support suppression reasons, rule lists, colon and todo directives, and isolated documentation scopes without interpreting directives in excluded examples or templates.
- Recognize typographic apostrophes in project vocabulary and preserve apostrophe style during conservative corrections.
- Spellcheck JavaScript, TypeScript, Flow, JSX, and TSX prose using Prettier ASTs, with comment autocorrection, optional report-only strings and identifiers, and code vocabulary collection.
- Load optional `spellcheck.json` automatically, support explicit `spellcheckConfig` paths without a helper, and allow nested inline settings through `defineConfig`.
- Configure spelling inline under one nested `spellcheck` object with a JavaScript Prettier configuration helper.
- Reject invalid per-file Prettier spelling options during vocabulary collection.
- Preserve byte-order marks and CRLF source offsets in spelling diagnostics and corrections.
- Check YAML front matter string values with nested field selection, source-mapped diagnostics, and type-safe plain-scalar corrections.
- Remove the markdownlint development linter and use Prettier with this plugin for documentation checks.
- Replace runtime markdownlint dependencies with Prettier's native Markdown AST and direct CSpell dictionaries, including spelling directives, ignored regions, Unicode and Liquid handling.
- Add vocabulary collection and dictionary registration commands, and spellcheck project documentation.
- Support explicit multilingual dictionaries and project vocabulary.
- Add Node.js and Prettier compatibility CI, Coveralls reporting, and real CLI integration tests.
- Add separate lint automation for JavaScript and Prettier formatting.
- Add Markdown spelling checks and opt-in autocorrection through Prettier.
