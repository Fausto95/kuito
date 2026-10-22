# Kuito website

The product website and documentation hub for **Kuito**, built with [TanStack Start](https://tanstack.com/start) and deployed using Cloudflare's Vite integration for [Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).

## Develop

From this directory:

```sh
npm install
npm run dev
```

`predev` and `prebuild` run `npm run generate`, which produces everything the site renders from the repository:

- `api:generate` reads the framework's TypeScript exports into `src/content/reference.generated.json` (the full API reference, read on the server only).
- `usage:generate` finds real usage of every export in `templates/app`, `demo/` and the docs' code blocks: one TypeScript program whose `kuito`, `kuito/config` and `kuito/tests` imports resolve into `src/`, every call, JSX tag, property access and type reference resolved with the checker to the declaration the reference entry was generated from. The enclosing statement becomes the "Usage" section of that entry, with its file and line; a type nobody names borrows the examples of the exports that mention it. An export nothing uses falls back to a hand-written `content/api/examples/<id>.tsx`.
- `docs:generate` turns `docs/*.md`, `CONTRIBUTING.md` and the concise pages under `content/` into pages under `src/content/generated/`, one JSON per locale, plus the slim API index the client uses for navigation and search. The SVGs that `docs-map.json` lists under `diagrams` (from `docs/assets`) are inlined at the top of their page, ids prefixed, colors mapped to the `--dg-*` tokens so they follow the theme; the Architecture landing shows them all.

Both outputs are gitignored. A new document, a renamed heading or a new export appears on the next build.

## Check

````sh
npm run coverage:check   # api-surface.txt is current; every export has a description and an example
npm run snippets:check   # every ts/tsx example compiles; ```tsx partial opts a fragment out
npm run links:check      # every link reaches a page, a heading or a repository file
npm run typecheck
npm run build
npm run preview
````

`npm run coverage` rewrites `api-surface.txt` after an API change; commit it with the docs
that change. The same checks run in `.github/workflows/kuito-website.yml` on every pull
request that touches what the site is generated from. From the repository root,
`npm run docs:coverage` and `npm run docs:snippets` run the first two.

TanStack Router generates `src/routeTree.gen.ts`, which is gitignored, during the Vite build, so
`npm run typecheck` builds first. A bare `npx tsc --noEmit` needs a build before it.

## Documentation structure

Six sections, after the React Native website: **Guides**, **Components**, **APIs**, **Architecture**, **CLI** and **Language**. `src/content/docs-map.json` places every repository document in a section and category; the generator fails on a document it does not list, so nothing is silently dropped.

- A document can be merged into the generated page of an export (`"page": "fileSystem"`): the page then shows the guide first and the reference underneath, like React Native's API pages.
- Components and APIs come from the generated reference. A component is a primitive or a capitalized export that renders a node; `src/content/categories.json` gives each its category, and the generator fails when the two disagree. Other exports are grouped by the file that declares them (`API_CATEGORY_RULES` in `src/content/sections.ts`).

## Translations

English is the default and lives in the repository documents. French, Portuguese (pt-PT) and German mirror the English sources under `i18n/<locale>/`: `i18n/<locale>/docs/<slug>.md` for a repository document, `i18n/<locale>/content/<path>.md` for a concise page, `i18n/<locale>/CONTRIBUTING.md` for `CONTRIBUTING.md`.

Rules a translation must keep, because the build relies on them:

- The same headings in the same order and count. Heading anchors are the English ones in every locale, by position, so `reactivity.md#stores` resolves everywhere; a count mismatch is reported by `docs:generate` and the page falls back to local anchors.
- Fenced code, inline code, link URLs and anchors verbatim; product names left as is.

A page without a translation is served in English with a notice. UI strings live in `src/i18n/messages.ts`; every locale must define every key (the type checker enforces it).

## Theme

`<html data-theme>` is the single source of truth, persisted in `localStorage` and applied by an inline script before paint (`src/lib/theme.ts`). Colors come from the tokens in `src/styles.css`; the phone and editor mockups on the front page stay dark in both themes on purpose.

## Deploy

After authenticating Wrangler and setting up the Cloudflare account:

```sh
npm run deploy
```

The Worker is named `kuito-website`. Configure the custom domain in Cloudflare after its ownership and DNS are finalized. Deployment is **not automatic** and needs credentials.

## Branding

The caracal source is `public/kuito-mark.svg`. Run `npm run brand:export` to generate the native starter image assets. Generated images belong in the framework package before release.

## Concise pages and hand-written examples

The pages under `content/guides`, `content/components` and `content/language` are the concise documentation: essentials only, one short example per point, and an "In depth" link to the full repository document, which the site still renders as a hidden `<slug>-in-depth` page (searchable, not in the sidebar). `content/api/descriptions.json` gives a one-sentence description to every export whose source has no JSDoc; a JSDoc description, once written, takes precedence. `content/api/examples/<id>.tsx` gives a usage example to an export nothing in the repository uses; real usage, when it exists, wins.
