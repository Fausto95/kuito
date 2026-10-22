# Stage-by-stage kill criteria

These are **kill criteria for a strategy**, not automatic reasons to abandon Kuito.

| Gate                    | Pass criteria                                                                                                             | Kill / redesign trigger                                                | Fallback                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| S0 typed input          | `shermes -parse-ts` accepts representative typed subset and produces correct output                                       | Frequent unsupported TS syntax or semantic mismatch                    | Restrict typed subset; use untyped output for unsupported code |
| S0 native AOT           | `shermes -exec` passes and binary behavior matches interpreter on representative logic                                    | Unstable compiler/linking or incompatible semantics                    | Keep AOT experimental, ship bytecode path                      |
| S0 npm                  | Unmodified `lodash-es` code bundles and runs in Node and Hermes bytecode                                                  | npm semantics/API incompatibilities cannot be isolated                 | Add targeted host adapters or change execution engine          |
| S0 bytecode             | Hermes compiles and executes a known script; record HBC/toolchain version                                                 | Bytecode load/execute fails                                            | Investigate pinned Hermes version                              |
| S0 hot-swap feasibility | One embedded Hermes VM replaces registered code without resetting independently stored state                              | Requires rebuilding VM per update, or unsafe stale native references   | Reconsider module and native host architecture                 |
| S1 native UI            | Stable native view nodes can be mutated by individual property updates                                                    | Whole-tree updates are required for simple signals                     | Redesign binding IR / renderer                                 |
| S2 Live Patch           | Compatible state survives code changes, handlers are fresh, old listeners freed; rejected patch retains previous behavior | State loss or stale handlers on ordinary edits                         | Stop feature expansion; fix lifecycle                          |
| S3 mobile               | Both iOS and Android run same TSX demo using UIKit/Android Views                                                          | Platform integration requires distinct app languages for ordinary code | Revise host abstractions                                       |
| S4 AOT parity           | Identical test suite passes on bytecode and AOT, with reproducible measurements                                           | Semantic divergence or prohibitive binary/link overhead                | Do not call AOT production-ready                               |

## Scoring rules

- `PASS`: real toolchain executed successfully; record command, version/revision and exit code.
- `BLOCKED`: missing tool, dependency, or platform. It is **not** success or proof of failure.
- `FAIL`: a present toolchain produced an unsuccessful result; attach stderr.
- The Node reference-model tests do **not** satisfy the hot-swap feasibility gate. That gate requires a single embedded Hermes runtime, not JavaScript function replacement in Node.

The overarching core go/no-go is an actual TSX -> native views, signal updates, persistent Hermes bytecode HMR, and unmodified npm dependency on both mobile platforms. AOT is measured separately.
