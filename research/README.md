# Research

What Kuito tried before and beside the product, kept so the evidence stays
next to the code it judged. Nothing here ships, and app code never imports it.

- [`probe.ts`](probe.ts): the Stage 0 Hermes feasibility probes, run with
  `node research/probe.ts all` (or `core`, `typed`, `aot`, `bytecode`, `npm`,
  `npm-bytecode`). `HERMES_BIN` and `SHERMES_BIN` name the `hermes` and
  `shermes` to run, the `PATH`'s by default; `hermes-feasibility.yml` runs
  them in CI against the pinned release. Each writes
  `dist/stage0-results.json`. [History](../docs/history.md) says what they
  proved.
- [`experiments/`](experiments): the probes' raw Hermes inputs: global
  scripts that call `print`. Not linted.
- [Kill criteria](kill-criteria.md): the Stage 0 gates and how a probe scores.
- [Intended contracts](intended-contracts.md): interfaces ADR 0001 listed and
  the runtime never implemented.
