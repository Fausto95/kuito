# keepAwake

Hält den Bildschirm eingeschaltet, solange die aufrufende Komponente gemountet ist. Jeder Aufruf
hält den Bildschirm für sich, und der Bildschirm darf erst wieder in den Ruhezustand gehen, wenn jede
Haltung freigegeben ist.

```tsx
import { keepAwake, app } from 'kuito';

function Player() {
  keepAwake(); // held while Player is mounted
  return <Video />;
}

// For the app's life, outside any component; call the result to let go.
const release = keepAwake({ scope: app });
release();
```

`keepAwake()` ist ein Scope-Effekt (siehe [native Module](native-modules.md#scope-effects)):
während des Aufbaus einer Komponente aufgerufen, hält es den Bildschirm vom Mounten bis zum
Unmounten der Komponente. Überall sonst braucht es `{ scope: app }`, und ein Aufruf
ohne dies wirft. In beiden Fällen gibt es die Funktion zurück, die den Bildschirm
früher in den Ruhezustand lässt; sie zweimal aufzurufen ist unschädlich.

iOS schaltet `UIApplication.isIdleTimerDisabled` ein; Android fügt dem Fenster der Activity
`FLAG_KEEP_SCREEN_ON` hinzu, was nur gilt, solange die
App im Vordergrund ist. Ein Neuladen gibt jede Haltung frei.
