# Zu Kuito beitragen

Vielen Dank für die Mithilfe bei der Verbesserung von Kuito. Das Projekt ist experimentell: Die nützlichsten Beiträge sind klein, getestet und klar dokumentiert.

## Vor dem Öffnen eines PR

1. Bestehende Issues und Diskussionen durchsuchen, um doppelte Arbeit zu vermeiden.
2. Das Problem und das vorgeschlagene Verhalten erläutern, insbesondere bei Änderungen an der öffentlichen API.
3. Den nächstgelegenen Runtime-, Compiler-, CLI- oder nativen Smoke-Test hinzufügen oder aktualisieren.
4. Dokumentation und Beispiele aktualisieren, wenn sich für Nutzer sichtbares Verhalten ändert.
5. Plattformspezifische Einschränkungen explizit benennen. Keine gemessene Performance ohne reproduzierbaren Benchmark behaupten.

## Lokale Einrichtung

```bash
npm install
npm ci --prefix apps/website             # Lint prüft auch die Website
npm --prefix apps/website run build      # schreibt die Dateien, die die Website importiert
npm test
npm run lint
npm run fmt
```

Der native Showcase wird mit `npm run demo:ios` oder `npm run demo:android` gestartet. Die mobilen Toolchains müssen lokal installiert sein.

### Website

Die TanStack-Start-Website liegt unter `apps/website`.

```bash
cd apps/website
npm install
npm run typecheck
npm run build
```

Beiträge zur Website sollen barrierefrei und responsiv bleiben und experimentelle Funktionen transparent kennzeichnen.

## Erwartungen an Pull Requests

- Die für Nutzer sichtbare Änderung beschreiben und bei UI-Änderungen Vorher-/Nachher-Screenshots beifügen.
- Das Issue verlinken oder die Motivation erläutern.
- Angeben, welche Befehle auf welchen Geräten ausgeführt wurden.
- Attributionen Dritter und Lizenzverpflichtungen beibehalten.
- Ein Changeset hinzufügen, wenn Nutzer die Änderung bemerken (siehe [Releases](#releases)).

## Releases

Das npm-Paket `kuito` wird mit [Changesets](https://github.com/changesets/changesets) versioniert.
Ein PR, der ändert, was Nutzer bekommen (die CLI, `kuito`, `kuito/config`, `kuito/tests`, die
nativen Shells, die Templates), fügt eines hinzu:

```bash
npm run changeset
```

Der Befehl fragt nach der Versionsstufe (patch, minor oder major) und einer Zeile für das
Changelog und schreibt es nach `.changeset/`. Dokumentation, Tests und interne Refactorings
brauchen keines.

Auf `main` hält der Release-Workflow (`.github/workflows/release.yml`) einen PR
„Version packages“ offen, der die ausstehenden Changesets anwendet: die neue Version in
`package.json` und ihren Eintrag in `CHANGELOG.md`. Das Mergen dieses PRs veröffentlicht die
Version auf npm und setzt ihren Tag.

## Verhaltenskodex und Lizenz

Erwartet wird eine respektvolle, konstruktive Zusammenarbeit. Kuito steht unter der
[MIT-Lizenz](LICENSE).
