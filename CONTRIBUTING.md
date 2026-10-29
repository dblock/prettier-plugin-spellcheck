# Contributing

Install Node.js 22.18 or later, then:

```sh
npm ci
npm run lint
npm test
```

Use Prettier's public language parsers and CSpell dictionaries directly. Do not add markdownlint dependencies. Prettier with this plugin checks documentation formatting and spelling; ESLint checks JavaScript. Add focused tests for source ranges, conservative spelling corrections, and Prettier integration. Spelling changes must be opt-in, deterministic, and idempotent. Code strings and identifiers are report-only, even with autocorrection enabled.

Run lint and the relevant tests immediately before committing. Keep Markdown paragraphs on one source line, update the changelog for user-visible changes, and use one logical commit per pull request.
