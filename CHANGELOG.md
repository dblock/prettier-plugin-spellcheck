# Changelog

## 0.1.0 (Next)

- Your contribution here.
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
