# Work on the Kuito website

The website renders the repository's guides and a generated reference for every public export, component, CSS property and CLI command. Edit the canonical source, regenerate, then check the rendered page.

## Start locally

Install root dependencies first (`npm ci` at the repository root), then from this directory:

```sh
npm ci
npm run dev
```

Use Node.js 22.18 or newer. The website has its own lockfile and dependencies. `predev` and `prebuild` generate the docs automatically.

## Find the source to edit

| Content                                              | Source                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Guides, component workflows and architecture details | `../../docs/*.md`                                                    |
| Documentation and architecture landing pages         | `content/introduction.md`, `content/architecture.md`                 |
| Sections, order and merged reference pages           | `src/content/docs-map.json`, `src/content/sections.ts`               |
| Component groups                                     | `src/content/categories.json`                                        |
| API signatures, props, options and types             | Public exports of `kuito`, `kuito/config`, `kuito/tests` and globals |
| Descriptions missing source JSDoc                    | `content/api/descriptions.json`                                      |
| Complete API examples                                | Markdown fences or `content/api/examples/<export-id>.tsx`            |
| CSS and CLI examples/use cases                       | `content/api/css-examples.json`, `content/api/cli-examples.json`     |
| Navigation/UI labels                                 | `src/i18n/messages.ts`                                               |

There is one public prose page per topic. Do not create a second short/long version. A `page` entry in the map merges a guide with its generated export page. Every root docs file must be mapped or explicitly excluded. Historical experiments can stay repository-only.

The six top-level sections separate learning guides, components, APIs, architecture, CLI and styling/TSX. Within them, categories describe tasks: arranging views, forms and actions, storing data, navigation, debugging or releasing. Keep examples beside the feature they demonstrate. There is no `/examples` gallery or legacy URL compatibility layer.

## Generate and validate

```sh
npm run generate
npm run coverage:check
npm run snippets:check
npm run links:check
npm run build
npx tsc --noEmit
```

`api:generate` reads declarations, `usage:generate` indexes complete authored examples with the TypeScript checker, and `docs:generate` renders Markdown and indexes. Generated JSON and the TanStack route tree are ignored. A build creates the route tree needed for TypeScript checking; `npm run typecheck` builds first if preferred.

Coverage requires a description and complete example for every export, with no type exemptions. A type can use the example of an API that consumes it, labeled with that relationship. Imports alone do not count as usage. Dedicated examples take priority. The generator does not mine demo fragments or clip code.

Snippet checks compile all English TS/TSX examples against the actual exports, and parse CSS and CLI examples with the framework's parsers. They do not execute device APIs, network calls, Swift or Kotlin. Mark a deliberate code fragment with `partial`, but prefer a complete example. Link checks verify local pages, headings and repository targets; they do not fetch unrelated external sites.

`api-surface.txt` records export signatures and the CLI/CSS surface. After an intentional surface or reference-generation change, run `npm run coverage`, review the diff and commit it. CI runs the docs checks and production build in `.github/workflows/kuito-website.yml`.

## Translate a page

English comes from the canonical source. French, Portuguese and German mirror its repository-relative path under `i18n/<locale>/`, with `apps/website/` removed for website-owned pages.

Translate the final English page, preserving code, link destinations and heading order/count. Then record the SHA-256 of that English source under the locale and source path in `i18n/source-hashes.json`. For example, `shasum -a256 ../../docs/apps.md` computes the source hash. The build only uses a translation when its recorded hash matches; otherwise it serves the current English page with a notice. Update hashes only after reviewing the translation against the new source.

UI labels are separately translated in `src/i18n/messages.ts`. Do not mark an old translation current just to remove the notice.

## Preview and deploy

```sh
npm run preview
```

Inspect navigation, search, a component's guide/props, an API example, a CSS entry and the narrow-screen layout. The theme uses `data-theme` on the root element and tokens in `src/styles.css`.

After configuring Cloudflare credentials and the target account, `npm run deploy` publishes the `kuito-website` Worker. Deployment is separate from a docs change or Git push.

For prose conventions, read [Writing documentation](CONTRIBUTING-DOCS.md).

## Social previews

Every page emits its title, description, canonical URL, Open Graph tags and Twitter large-image card in the server-rendered HTML. `src/lib/metadata.ts` keeps these fields aligned, including locale prefixes and the production origin (`https://kuito.dev`). Documentation pages use their own generated descriptions.

All routes share the branded 1200 × 630 PNG at `public/social-card.png`. Regenerate it after changing `scripts/export-social-card.mjs` or the logo:

```sh
npm run social:export
```

To verify actual server HTML across all locale and route families, build the site, start `npm run preview -- --host 127.0.0.1 --port 4175`, then run `npm run metadata:check -- http://127.0.0.1:4175` in another terminal.
