# Contributor instructions

- Support Node.js 22.18+ and Prettier 3.7+ (3.x).
- Reuse the public `markdownlint-rule-spellcheck` API and its fixes; do not copy dictionary, Markdown-tokenization, or correction logic.
- Keep dictionaries offline. Missing or invalid configuration must fail explicitly.
- Autocorrection is opt-in. If any remaining spelling issue needs manual review, do not format that file.
- Preserve Prettier's ordinary Markdown printing and user formatting options. Do not spellcheck source code or MDX.
- Add focused tests for plugin and CLI behavior; upstream tests own the spelling engine's internal cases.
- Run lint and relevant tests before committing. Keep Markdown paragraphs on one source line.
- Never publish to npm or create release tags without explicit authorization.
