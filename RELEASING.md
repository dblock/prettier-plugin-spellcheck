# Releasing

Publishing and release tags require explicit authorization. The GitHub repository is usable before npm publication by installing `github:dblock/prettier-plugin-spellcheck`.

## Prepare

1. Start with a clean `main` branch synchronized with GitHub.
2. Update the version with `npm version VERSION --no-git-tag-version`, date the changelog section, and review the public documentation.
3. Run `npm run lint`, `npm run coverage`, `npm audit`, and `npm pack --dry-run`. Confirm the package includes its runtime modules, CLI, license, README, and changelog.
4. Commit the release preparation with the Copilot coauthor trailer when applicable, push, and wait for the exact-head lint and compatibility jobs to pass.

## Publish

Confirm the intended npm account with `npm whoami`. Ask the maintainer for a fresh one-time password immediately before publishing; do not retain or repeat the code.

```sh
npm publish --access public --otp FRESH_CODE
```

Verify the public package version and integrity with `npm view prettier-plugin-spellcheck@VERSION version dist.integrity`, then install that exact version in a temporary project and exercise both the Prettier plugin and vocabulary CLI.

Only after verifying publication, create an annotated `vVERSION` tag at the release preparation commit, push that tag, and create the matching GitHub release. Do not overwrite an existing version or tag.

## Continue development

Advance the version without creating a tag, add a new changelog section with the contribution placeholder, commit, and push. Leave the working tree clean.
