# Contributor instructions

- Support Node.js 22.18+ and Prettier 3.7+ (3.x).
- Use Prettier's public Markdown parser and CSpell dictionary APIs directly. Do not add markdownlint or markdownlint-rule-spellcheck dependencies, including development dependencies. Use Prettier with this plugin for documentation checks.
- Keep dictionaries offline. Missing or invalid configuration must fail explicitly.
- Configure spelling inline under one nested `spellcheck` key using `defineConfig`; do not introduce a separate spelling configuration file.
- Autocorrection is opt-in. If any remaining spelling issue needs manual review, do not format that file.
- Preserve Prettier's ordinary Markdown printing and user formatting options. Do not spellcheck source code or MDX.
- Add focused tests for source ranges, conservative corrections, dictionary handling, plugin integration, and CLI behavior.
- Run lint and relevant tests before committing. Keep Markdown paragraphs on one source line.
- Never publish to npm or create release tags without explicit authorization.
