# Lebenszyklus-Ereignisse

Lebenszyklus-Hooks führen Code um den Host-View-Commit einer Komponente aus, und View-Handles legen native Views und ihre logischen Ereignisse offen. Diese APIs sind experimentell.

## Lebenszyklus-Hooks

- `onMount(callback)` läuft nach einem erfolgreichen Host-View-Commit; eine zurückgegebene Funktion wird beim Entsorgen der Instanz aufgeräumt. Ein kompatibler Refresh behält dieselbe gemountete Instanz.
- `onCleanup(callback)` registriert Aufräumarbeiten, ohne beim Mount zu laufen.
- `effect(callback)` verfolgt synchrone Signal-Lesevorgänge und läuft nach dem Mounten; zurückgegebenes Cleanup läuft vor erneuter Ausführung und beim Abbau.

## Einen Wert beobachten

`watch(source, observer, { immediate? })` beobachtet den ausgewählten Signalwert und überspringt standardmäßig die erste Benachrichtigung. Abhängigkeiten werden neu verfolgt, wenn sich die Quelle ändert. Ein Watch vergleicht Werte über die Lebensdauer seiner Instanz: wenn die Instanz erneut läuft (neue Props, ein neu geplanter Zweig), benachrichtigt ein ausgewählter Wert, der vom zuletzt gesehenen abweicht, den Observer.

## View-Handles und native Ereignisse

`ref()` gibt ein stabiles View-Handle für native View-IDs zurück. Handles bieten logische Eltern/Kinder, `setProperty`, die Host-Befehle `focus`/`blur` und EventTarget-ähnliche Listener.

Natives Drücken wird durch Capture-, Target- und Bubble-Phase zugestellt; `dispatchEvent` akzeptiert eigene ereignisförmige Objekte. Der native Host-Dispatch ist ein Proof of Concept, keine W3C-konforme Implementierung.

## Einschränkungen

- Fast Refresh erstellt den Komponenten-Deskriptorbaum neu. Unveränderte Lebenszyklus-Scopes bleiben bei kompatiblem Refresh erhalten; geänderte Effekte werden ersetzt, und stabile Handles überleben, solange View-Identitäten erhalten bleiben.
- `focus` und `blur` erfordern eine echte plattformnative Befehlsimplementierung und werfen ohne sie einen beschreibenden Fehler.
- `setProperty` schreibt imperativ; spätere Signal-Commits können diesen Wert überschreiben.
- Ereignisabbruch gilt für Kuitos logischen Ereignisgraphen; er stoppt keine bereits ausgelöste UIKit-/Android-OS-Aktion.
- Cleanup-Callbacks sind nicht transaktional: eine Ausnahme in einem Cleanup nach dem Host-Commit kann native View-Änderungen nicht zurückrollen.
- Typisierung der Ereignisargumente und passive Listener, barrierefreie Semantik, zusammengesetzte Portale und das Entsorgen verschachtelter Lebenszyklus-Scopes sind unvollständig.

## Vertiefung

[Komponentenlebenszyklus und logische native Ereignisse](../../../../docs/lifecycle-events.md) behandelt dieselben APIs und Einschränkungen in ihrer ursprünglichen Form.
