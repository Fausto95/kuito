# Writing the docs

How a page of the Kuito site is written. The site renders the concise pages under
`content/` and the repository's `docs/*.md` (the "In depth" pages); both follow this.

## A concise page

In this order, leaving out what does not apply:

1. **What it is, in one sentence.** Then **Use it for**: two or three concrete cases,
   as bullets.
2. **A minimal, complete example**, right after. It has its imports, compiles and runs
   as a screen: no undefined names, no `...`.
3. **Patterns**: two to four short examples, each titled by the task it solves
   ("Submit on enter", "Format a card number", "Keep the keyboard up").
4. **Reference**: the generated props, events and methods. Don't repeat it in prose.
5. **Platform differences**: only real ones, as a short table or `Android:` lines
   (`notifications.register` rejects with `ERR_UNSUPPORTED` on Android).
6. **Permissions and config**: the `kuito.config.ts` keys and `permissions` calls it
   needs, as a snippet.
7. **Accessibility**, where it matters.
8. **Related**: two to four links.

## Rules

- **An intro is three sentences at most.** Internals (planning, batching, hook
  identity, wire formats) belong in Architecture, not on a concise page.
- **Lead with code** when the reader's question is "how do I…".
- **A description says what something is for**, not which fields it has: "Options of
  `Camera`: `facing`, `flash`, …" repeats the table.
- **Names come from `docs/naming.md`**, never from React Native, Expo or Reanimated
  for familiarity.
- **Every behavior claim matches `main`.** When unsure, read the source or a test,
  and cite it in the pull request.
- **Every example compiles.** `npm run snippets:check` type-checks every `ts`/`tsx`
  block. A block that is part of a larger program is marked ` ```tsx partial `; the
  site labels it a fragment. Keep those rare.
- **Every export has a description and an example.** `npm run coverage:check` lists
  the gaps: describe an export with JSDoc in the source or in
  `content/api/descriptions.json`; an example comes from real code (the template, the
  demos, `demo/recipes`, a doc's code block) or, for an export nothing uses, from
  `content/api/examples/<id>.tsx`.
- **Links resolve.** `npm run links:check` follows every link to a page, a heading or
  a repository file.

## Translations

French, Portuguese (pt-PT) and German follow the English page heading for heading, so
anchors match, with code, inline code, link targets and product names left verbatim.
They are written once the English page is final.
