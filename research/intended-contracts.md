# Intended contracts

Host, Live Patch and compiler interfaces that ADR 0001
([architecture](../docs/architecture.md)) listed as intended. None is
implemented. The runtime has its own: one typed batch per job through
`__kuitoHostCommit` ([native scheduling](../docs/native-scheduling.md)) and
source patches over the dev link ([devtools](../docs/devtools.md)). They are
kept as research notes, not as a plan.

- `Host.createView(kind, id, props)` / `Host.setProperty(id, name, value)` / `Host.disposeView(id)`
- `Host.attachEvent(viewId, eventName, handlerId)` — stable ID, dynamic lookup into the current handler table
- `Live.applyModule(moduleId, bytecode)` — validate, prepare, swap, dispose old subscriptions, otherwise reject and retain old module
- `State.get(moduleId, stateId)` — stable identity under compatible patches
- `Compiler.emitBindings(tsx)` — register target-property subscriptions, not whole component rerenders
