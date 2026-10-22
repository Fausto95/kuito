# Architekturentscheidung 0001 — Ausführungs-Backends entkoppeln

Status: **angenommen**

## Entscheidung

1. Kuito besitzt das TSX-Lowering, die Bindungs-Metadaten, stabile Komponentenidentitäten, den Lebenszyklus nativer Views und die Kompatibilitätsregeln für Live Patch.
2. **Entwicklung:** eine persistente Hermes-Runtime innerhalb jeder nativen Shell führt die App aus und nimmt Live Patches als Quellcode entgegen ([Historie](history.md) enthält die Stage-0-Modelle, die zuerst kamen).
3. **Produktions-AOT:** Static Hermes ist ein separat vermessenes Backend. Wo die typisierte Sprachteilmenge unterstützt wird, ist die Typsyntax auf dem Weg zu `shermes -parse-ts` zu erhalten; es darf nicht vorab eine unbedingte Oxc-TS-Strip-Transformation ausgeführt werden.
4. **Abhängigkeiten:** Rolldown löst unveränderte npm-Pakete auf und bündelt sie; Oxc ist die Grundlage für Kuito-spezifische TSX-/reaktive Transformationen. Gewöhnliches untypisiertes npm-JavaScript muss weiterhin verarbeitet werden.
5. Host-APIs und die UI-Mutations-IR unabhängig von Hermes definieren, damit ein Backend ersetzt werden kann, ohne das Rendering neu zu entwerfen.

## Vorgesehene Verträge (noch nicht implementiert)

- `Host.createView(kind, id, props)` / `Host.setProperty(id, name, value)` / `Host.disposeView(id)`
- `Host.attachEvent(viewId, eventName, handlerId)` — stabile ID, dynamisches Nachschlagen in der aktuellen Handler-Tabelle
- `Live.applyModule(moduleId, bytecode)` — validieren, vorbereiten, austauschen, alte Subscriptions verwerfen, andernfalls ablehnen und altes Modul behalten
- `State.get(moduleId, stateId)` — stabile Identität unter kompatiblen Patches
- `Compiler.emitBindings(tsx)` — Subscriptions auf Ziel-Properties registrieren, keine Rerenders ganzer Komponenten

## Besitz und Sicherheit

- Ein nativer Host darf rohe JS-Closure-Zeiger nicht über Patches hinweg halten. Handler-IDs speichern, beim Aufruf auflösen.
- Die Zustandsidentität darf nicht von Quellzeilennummern oder der Aufrufreihenfolge abhängen. Der Slot jedes Hooks ist über seine Komponenteninstanz und den Namen, den der Compiler ihm gibt, geschlüsselt ([Reaktivität](reactivity.md)).
- Die Patch-Vorbereitung muss in ihren Nebenwirkungen eingeschränkt sein. Native Schreibvorgänge sind nicht automatisch umkehrbar; transaktionale Austausche brauchen eine Staging-/Abgleichsrichtlinie.
- Die Kompatibilität der Hermes-ABI und der Bytecode-Version muss auf eine exakte Toolchain-Revision festgepinnt sein.
- Auf iOS darf die Entwicklungsaktualisierung interpretierten Bytecode laden, aber native AOT-Codeänderungen erfordern einen Rebuild; dies ist kein uneingeschränkter nativer OTA-Mechanismus.

## Offene Fragen

- Welche APIs zum Laden von Bytecode-Einheiten/Modulen stehen für die **gewählte** Hermes-Revision in einem persistenten Host zur Verfügung?
- Können alter und neuer Code während der Patch-Vorbereitung koexistieren, und wann ist ein sicheres Verwerfen möglich?
- Wie werden Modul-Imports/-Exports, paketweite Singletons und native Referenzen über Patches hinweg dargestellt?
- Können typisierter Kuito-Code und untypisierte gebündelte npm-Pakete unter nativem AOT mit beobachtbarer Parität koexistieren?
- Bewahren Compiler-Lowering und Bundling die Annotationen, die typisiertes AOT wertvoll machen?

## Quellen

- https://github.com/facebook/hermes/blob/static_h/doc/TypedLanguage.md
- https://github.com/facebook/hermes/blob/static_h/doc/BuildingAndRunning.md
- https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-11-02-hermes-compilation-runtime-modes.md
- https://rolldown.rs/apis/plugin-api
