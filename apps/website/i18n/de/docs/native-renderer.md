# Nativer Renderer

Wie die View-Operationen des Kernels zu UIKit- und Android-Views werden.

## Form

- App-TSX wird über Rolldowns Oxc-JSX-Lowering kompiliert (klassische `__kuitoJSX`-Laufzeit).
- Berechnete native Eigenschaften sind JSX-Ausdrücke, die Signale lesen (z. B. `opacity={visible.value ? 1 : 0}`), die der Compiler in Closures verwandelt. Der Kernel verfolgt die von der Closure gelesenen Signale und abonniert sie, wobei er Aktualisierungen auf Eigenschaftsebene durchführt, **ohne die Komponentenfunktion erneut auszuführen**. Strukturelle Bedingungen (`Show`, `Switch`/`Match`, reaktive Kind-Ausdrücke) planen das Modul neu, wenn sich ihre Signale ändern; siehe [Kontrollfluss](control-flow.md).
- Das Label einer View bildet auf ein natives Objekt ab: ihr `id`-Prop oder `__kuito:<module>:<path>`, generiert aus ihrem Ort, ihrer Komponente und ihrem Schlüssel ([inkrementelle Aktualisierung](incremental.md)). Innerhalb des Kernels hat jedes Label eine Nummer (`src/runtime/view-ids.ts`), vom Plan, der es zuerst benennt, bis die View entfernt wird; `plan.ts`, `reconcile.ts` und `commit.ts` arbeiten mit Nummern, und `host.ts` verwandelt sie an der Host-Grenze zurück in Labels. Kompatible Patches aktualisieren Eigenschaftswerte und Handler, während das Objekt und das Signal erhalten bleiben. Entfernte Views werden freigegeben. Eine View, deren Art oder Elternelement sich ändert, wird entfernt und mit ihrem Teilbaum neu erzeugt. Verschiebungen behalten die längste Folge bereits geordneter Kinder bei und verschieben den Rest.
- `native/ios/Renderer/` (UIKit) und `native/android/app/src/main/java/dev/kuito/runtime/renderer/` (Android Views) implementieren dieselben View-Operationen mit demselben Layout:
  - `Kuito*Renderer` besitzt nur den View-Baum: erzeugen, verschieben, entfernen (mit `exiting`), leeren.
  - `KuitoViewFactory` bildet jede Kuito-Art auf eine native View ab und verdrahtet ihre Events. Arten, die native Module beisteuern (`module:<Name>`), kommen über dieselbe Suche aus `KuitoModuleViews` und bringen ihre eigene Prop-Tabelle mit, die auf dem Stil der View vor den gemeinsamen gehalten wird ([native Views](native-modules.md#views)).
  - `KuitoEventEmitter` schreibt Events im Wire-Format, das in [Events](events.md) beschrieben ist.
  - `properties/` enthält eine Tabelle pro Anliegen (Animation, Layout, Dekoration, Text, Steuerelemente), nach Prop-Namen indiziert; `KuitoProperties` führt sie zusammen, weist ein zweimal beanspruchtes Prop ab und indiziert die Setter nach Prop-Schlüssel (`KuitoProperties.byKey`), sodass der Schlüssel eines Records seinen Setter findet, ohne einen Namen zu hashen. Die eigenen Props einer Modul-View kommen zuerst, nach Namen. Fügen Sie ein Prop in `src/protocol/manifest.ts` hinzu (sein Anliegen benennt die Tabelle), führen Sie `npm run generate` aus und fügen Sie dann auf beiden Plattformen einen Eintrag in diese Tabelle hinzu; `test/protocol-parity.test.ts` schlägt fehl, bis jede vom Manifest markierte Plattform den Setter hat, und schlägt bei einem Setter, einer View-Art oder einem Event-Payload-Schlüssel fehl, den das Manifest nicht auflistet. Jede Tabelle ist ein einziges Literal, damit der Test sie lesen kann.
  - `styling/` enthält den Record pro View (`KuitoViewStyle`, siehe unten), Animationsspezifikationen, Farben und Wertparsing.
  - `KuitoCommands` bildet jeden Befehl darauf ab, was er tut. Ein Befehl ist eine einmalige Anweisung (`focus`, `blur`, `keyboard.dismiss`, `accessibility.announce`, `accessibility.focus`, `accessibility.status`): Der Kernel schreibt einen `Command`-Record in den Host-Batch, nach den davor liegenden Mutationen (docs/native-scheduling.md). Id 0 adressiert die App.
  - `keyboard/` verfolgt die Tastatur und verschiebt ausweichende Views ([Tastatur](keyboard.md)); `accessibility/` setzt die Barrierefreiheits-Props jeder View zusammen und meldet den Status ([Barrierefreiheit](accessibility.md)).

## Ein Record pro View

Jeder Renderer führt eine Map, `nodes`, von der Nummer einer View zu ihrem
Record, `KuitoViewStyle`. Der Record ist alles, was der Renderer über die View
weiß:

- `view`: ihre native View, nil, solange der Knoten geflattet ist. Der
  Layout-Knoten zeigt auf dieselbe View; das Setzen des Record-Werts setzt den
  des Knotens.
- `content`: wohin die Views ihrer Kinder gehen, wenn das nicht die View ist
  (der Inhalt eines Scroll).
- `layoutRoot` (iOS) und `sheet`: gesetzt für eine View, die ihren eigenen
  Teilbaum außerhalb des Layouts ihres Elternelements anordnet.
- `exiting`: gesetzt, sobald eine entfernte View Kuitos Baum verlassen hat,
  aber nicht den Bildschirm. `animated`, während der UI-Thread ihr `exit`
  ausführt, dessen Props sie bis `exited` weiterhin annimmt; `transition`,
  während die Transition ihres Containers eine Seite vom Bildschirm bewegt.
  Jede andere Mutation daran ist ein `missingView`. Der Record verschwindet,
  wenn die View verschwunden ist.
- Ihr Layout-Knoten, Gesten und der Stilzustand von Props, die sich zu einem
  Plattformwert zusammensetzen (Transformation, Textattribute, Hintergrund).

Flattening ändert einen Sachverhalt, das `view` des Records, und der Record
bleibt. `clear()` verwirft jeden Record.

## Fehler

Jeder Fehler, den ein Renderer wirft, ist ein `KuitoRenderError`, mit
denselben vier Fällen auf beiden Plattformen
(`native/ios/Renderer/KuitoRenderError.swift`,
`native/android/.../renderer/KuitoRenderError.kt`). Die Shell verwirft die
Mutation und meldet den Fehler ([LogBox](logbox.md)); nichts fällt zurück.

| Fall               | Wann                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupportedProp`  | Die View nimmt kein solches Prop und keinen solchen Befehl entgegen: Keine Tabelle hat es, oder es gehört einer anderen Art (`objectFit` auf einer `Box`).                         |
| `unsupportedValue` | Das Prop oder der Befehl nimmt keinen solchen Wert entgegen. Er benennt das Prop, den Wert, die View und was das Prop entgegennimmt.                                               |
| `invalidTree`      | Die Mutation ergibt einen Baum, den der Renderer nicht anzeigen kann: eine Nummer in Gebrauch, eine unbekannte Art, eine Seite außerhalb ihres Containers, zweimaliges Flattening. |
| `missingView`      | Keine View hat die Nummer.                                                                                                                                                         |

Ein Setter wirft `context.unsupportedProp()` oder
`context.unsupportedValue(value, reason)`. Code unterhalb eines Setters, der
keinen Kontext hat (eine Gestenspezifikation, die Schlüssel einer Liste, der
Name eines Symbols), wirft `KuitoRenderError.Rejection(reason)`, was der
Renderer in `unsupportedValue` für das gerade gesetzte Prop verwandelt; die
Ablehnung eines Befehls wird zu `unsupportedValue` für den Befehl.

## Beispiel

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

Der Kernel plant die drei Views einmal; ein Press schreibt `count`, und allein
der `Text` wird aktualisiert; nichts wird neu geplant.

## Lokale Validierung

Führen Sie `npm test` für reine JS-/VM-Vertragstests aus, und die Renderer-Tests auf einem Simulator und einem Emulator (`CLAUDE.md` nennt die Befehle).
