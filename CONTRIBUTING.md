# Contributing to Kuito

Thank you for helping improve Kuito. The project is experimental: the most useful contributions are small, tested and clearly documented.

## Before opening a PR

1. Search existing issues and discussions to avoid duplicate work.
2. Explain the problem and proposed behavior, especially for public API changes.
3. Add or update the closest runtime, compiler, CLI or native smoke test.
4. Update documentation and examples when user-visible behavior changes.
5. Keep platform-specific limitations explicit. Do not claim measured performance without a reproducible benchmark.

## Local setup

```bash
npm install
npm ci --prefix apps/website             # lint type-checks the website too
npm --prefix apps/website run build      # writes the files the site imports
npm test
npm run lint
npm run fmt
```

To run the native showcase, use `npm run demo:ios` or `npm run demo:android`. The mobile toolchains must be installed locally.

### Website

The TanStack Start website lives under `apps/website`.

```bash
cd apps/website
npm install
npm run typecheck
npm run build
```

Site contributions should remain accessible, responsive, and transparent about experimental features.

## Pull request expectations

- Describe the user-visible change and include before/after screenshots for UI changes.
- Link the issue or explain the motivation.
- Show which commands you ran and on which devices.
- Retain third-party attribution and license obligations.
- Add a changeset when users will notice the change (see [Releases](#releases)).

## Releases

The `kuito` npm package is versioned with [Changesets](https://github.com/changesets/changesets).
A PR that changes what users get (the CLI, `kuito`, `kuito/config`, `kuito/tests`, the
native shells, the templates) adds one:

```bash
npm run changeset
```

It asks for the bump (patch, minor or major) and a line for the changelog, and writes it to
`.changeset/`. Docs, tests and internal refactors need none.

On `main`, the release workflow (`.github/workflows/release.yml`) keeps a "Version packages"
PR open with the pending changesets applied: the new version in `package.json` and its
`CHANGELOG.md` entry. Merging that PR publishes the version to npm and tags it.

## Code of conduct and license

Respectful, constructive collaboration is expected. Kuito is released under the
[MIT License](LICENSE).
