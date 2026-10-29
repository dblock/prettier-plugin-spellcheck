# Contributor instructions

- Support Node.js 22.18+ and Prettier 3.7+ (3.x).
- Use Prettier's public language parsers and CSpell dictionary APIs directly. Do not add markdownlint or markdownlint-rule-spellcheck dependencies, including development dependencies. Use Prettier with this plugin for documentation checks.
- Keep dictionaries offline. Missing or invalid configuration must fail explicitly.
- Support automatic `spellcheck.json`, an explicit `spellcheckConfig` path, and optional nested inline `spellcheck` settings through `defineConfig`. Keep all three configuration routes consistent.
- Autocorrection is opt-in. If any remaining spelling issue needs manual review, do not format that file.
- Preserve Prettier's ordinary printing and user formatting options. Check code prose using ASTs, not source-wide regular expressions. Strings and identifiers are opt-in and report-only; never rename identifiers or rewrite programmatic strings. Keep unsupported languages and MDX unchanged.
- Add focused tests for source ranges, conservative corrections, dictionary handling, plugin integration, and CLI behavior.
- Keep plain text literal and preserve its layout. Exclude configured vocabulary resources from text checking and collection.
- Keep tagged code fences opt-in, preserve container/source mappings, and isolate their suppression state from surrounding documents.
- Vocabulary collection must not overwrite by default. Refresh is explicit, excludes the old output dictionary, and must fail safely before replacing reviewed vocabulary.
- Run lint and relevant tests before committing. Keep Markdown paragraphs on one source line.
- Never publish to npm or create release tags without explicit authorization.
