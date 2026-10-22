# Writing documentation

Write for someone completing a task. Start with what the feature helps them do, then give a complete example they can adapt. Explain the behavior the example demonstrates and the constraints that affect its use.

## A useful page

1. Name the task or component clearly.
2. State when to use it in one short paragraph.
3. Show complete code with imports, required configuration and visible behavior.
4. Explain lifecycle, failures, units or platform differences where they matter.
5. Link to the next relevant task and the generated reference.

Keep parameter and prop inventories in the generated reference. Put implementation architecture in architecture pages. Avoid duplicated short/long pages and broad categories that mix unrelated tasks.

## A trustworthy example

Read the implementation or tests before describing behavior. An example must demonstrate what the surrounding text claims: a paginated feed must request the next page, and an upload example must actually use the selected file. Label placeholders and required server contracts. Show an error path for asynchronous work and release subscriptions/resources at the correct lifetime.

Every TS/TSX block is checked against the public API. Prefer a complete block; `partial` marks an intentional fragment and excludes it from export-example coverage. CSS and CLI examples are parsed by the framework. Native platform snippets still require platform review; TypeScript compilation does not validate them.

API examples are indexed from authored docs, with an optional dedicated file in `content/api/examples/<id>.tsx`. Keep the whole context needed to understand the call. A dedicated example's first comment describes its use case. Every export needs an example, including types; a type may show how its consuming API is used, with that relationship displayed.

## Keep sources and navigation aligned

Put public prose in `../../docs/` and register it in `src/content/docs-map.json`. Link to canonical Markdown sources; the generator converts them to website routes. Use task-oriented categories and keep recipes beside related guides. The repository demo remains a useful runnable companion, but is not the website's example source.

Follow [the website README](README.md) for generation, coverage, snippets, links, builds and translation freshness. Review the rendered page before submitting.
