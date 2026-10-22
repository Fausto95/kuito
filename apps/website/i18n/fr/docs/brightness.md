# brightness

La luminosité de l'écran tant que l'application est au premier plan.

```tsx
import { Text, brightness } from 'kuito';

brightness.level.value = 1; // a QR code, a boarding pass
<Text>{`${brightness.level.value ?? '…'}`}</Text>;
await brightness.restore();
```

| Membre      | Valeur                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`     | Un signal en écriture, de 0 à 1 : le niveau de l'application si elle en a défini un, sinon celui du système. `null` jusqu'à ce que la plateforme réponde. |
| `system`    | Un signal : si l'application n'a pas défini de niveau, ou a restauré celui du système. `null` jusqu'à ce que la plateforme réponde.                       |
| `restore()` | Rend la luminosité au système, puis relit les deux signaux.                                                                                               |

La luminosité est lue sur le thread principal, si bien que les signaux démarrent à `null` et que la
première lecture interroge la plateforme. Affecter `level` s'affiche immédiatement ; un niveau
hors de 0 à 1 lève une `RangeError` avant que quoi que ce soit ne traverse, et une écriture que la
plateforme rejette passe par la couture d'erreur et relit le niveau.

Le niveau ne tient que tant que l'application est au premier plan, et un rechargement le rend :

- iOS a une seule luminosité pour tout l'appareil, si bien que `UIScreen.brightness`
  survit à l'application. Le module conserve le niveau du système d'avant le premier
  changement, le remet quand l'application passe en arrière-plan (via
  [`KuitoAppLifecycle`](app-state.md#how-it-is-wired)), et applique à nouveau le niveau
  de l'application à son retour.
- Android définit le `screenBrightness` de la fenêtre, que le système limite déjà
  à l'activité.

La luminosité du système entier (son mode, la permission `WRITE_SETTINGS`) n'y est
pas, pas plus qu'un événement de changement : `level` suit les propres écritures de l'application. Le simulateur iOS n'a pas de rétroéclairage : il ignore le niveau
et lit toujours 0.5. Essayez la luminosité sur un appareil ou sur l'émulateur Android.
