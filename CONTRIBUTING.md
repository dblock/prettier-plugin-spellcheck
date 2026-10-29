# Contributing

Install Node.js 22.18 or later, then:

```sh
npm ci
npm run lint
npm test
```

Use Prettier's public Markdown parser and CSpell dictionaries directly; markdownlint is only a development linter. Add focused tests for source ranges, conservative spelling corrections, and Prettier integration. Spelling changes must be opt-in, deterministic, and idempotent.

Run lint and the relevant tests immediately before committing. Keep Markdown paragraphs on one source line, update the changelog for user-visible changes, and use one logical commit per pull request.
