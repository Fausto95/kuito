# Komponentenlebenszyklus und logische native Ereignisse

## Aktuelle experimentelle APIs

- `onMount(callback)` läuft nach einem erfolgreichen Host-View-Commit; eine zurückgegebene Funktion wird beim Verwerfen der Instanz bereinigt; eine kompatible Aktualisierung behält dieselbe gemountete Instanz.
- `onCleanup(callback)` registriert eine Bereinigung, ohne beim Mounten zu laufen.
- `watch(source, observer, {immediate?})` beobachtet den ausgewählten Signalwert und überspringt standardmäßig die anfängliche Benachrichtigung. Abhängigkeiten werden neu verfolgt, wenn sich die Quelle ändert. Ein Watch vergleicht Werte über die Lebensdauer seiner Instanz: wenn die Instanz erneut läuft (neue Props, ein neu geplanter Zweig), benachrichtigt ein ausgewählter Wert, der vom zuletzt gesehenen abweicht, den Beobachter.
- `effect(callback)` verfolgt synchrone Signal-Lesezugriffe und läuft nach dem Mounten; die zurückgegebene Bereinigung läuft vor der erneuten Ausführung und beim Abbau.
- `ref()` gibt ein stabiles View-Handle für native View-IDs zurück; Handles bieten logische Eltern/Kinder, `setProperty`, die Host-Befehle `focus`/`blur` und EventTarget-ähnliche Listener.
- Natives Drücken wird über die Capture-, Target- und Bubble-Phase zugestellt; `dispatchEvent` akzeptiert benutzerdefinierte ereignisförmige Objekte. Der native Host-Dispatch ist noch ein Proof of Concept, keine W3C-konforme Implementierung.

## Einschränkungen

- Fast Refresh erzeugt derzeit den Komponenten-Deskriptorbaum neu. Unveränderte Komponenten-Lifecycle-Scopes werden bei kompatibler Aktualisierung beibehalten; geänderte Effekte werden ersetzt, und stabile Handles überleben, solange die View-Identitäten erhalten bleiben.
- `focus` und `blur` erfordern eine echte plattformnative Befehlsimplementierung und werfen einen beschreibenden Fehler, wenn sie fehlt.
- `setProperty` schreibt imperativ; nachfolgende Signal-Commits können diesen Wert überschreiben.
- Die Ereignisabbrechung gilt für Kuitos logischen Ereignisgraphen; sie stoppt nicht automatisch eine bereits ausgelöste UIKit-/Android-OS-Aktion.
- Bereinigungs-Callbacks sind derzeit nicht transaktional: eine Exception während einer Bereinigung nach dem Host-Commit kann native View-Mutationen nicht zurückrollen.
- Die Typisierung von Ereignisargumenten und passive Listener, Barrierefreiheitssemantik, zusammengesetzte Portale und das Verwerfen verschachtelter Lifecycle-Scopes sind unvollständig.
