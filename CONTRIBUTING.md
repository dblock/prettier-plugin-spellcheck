# Contributing

Install Node.js 22.18 or later, then:

```sh
npm ci
npm run lint
npm test
```

Keep the plugin a thin adapter around `markdownlint-rule-spellcheck`, not a second spelling engine. Add focused tests for Prettier integration and configuration behavior. Spelling changes must be opt-in, deterministic, and idempotent.

Run lint and the relevant tests immediately before committing. Keep Markdown paragraphs on one source line, update the changelog for user-visible changes, and use one logical commit per pull request.
