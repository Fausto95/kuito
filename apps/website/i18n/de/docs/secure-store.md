# secureStore

Geheimnisse wie Tokens und Passwörter: die Verben von `storage` über dem
Schlüsselbund. iOS hält sie im Keychain. Android verschlüsselt sie mit einem
Android-Keystore-Schlüssel, ohne Abhängigkeit von `androidx.security-crypto`.
Ein Geheimnis, dem die UI folgt, kann ein Signal sein:
[`persisted(…, { secure: true })`](storage.md#persisted) hält seinen Wert hier.

```tsx
import { secureStore } from 'kuito';

await secureStore.set('token', 's3cret');
await secureStore.get('token'); // 's3cret', or null
await secureStore.delete('token');

await secureStore.set('pin', '1234', {
  keychainService: 'auth',
  keychainAccessible: 'afterFirstUnlock',
  requireAuthentication: true,
  authenticationPrompt: 'Unlock your account',
});
```

Schlüssel und `keychainService` verwenden nur Buchstaben, Ziffern, `.`, `-`
und `_`. Werte sind Strings; für Daten `JSON.stringify(value)` speichern.
Alles andere wird mit einem `TypeError` zurückgewiesen, bevor es die
Plattform erreicht. Jedes Geheimnis klein halten, höchstens wenige KB. Der
Keychain ist keine Datenbank.

## Optionen

| Option                  | Standard             | Bedeutung                                                                                       |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `keychainService`       | `'app'`              | Ein separater Satz von Geheimnissen: derselbe Schlüssel in zwei Services sind zwei Geheimnisse. |
| `keychainAccessible`    | `'whenUnlocked'`     | Wann das Geheimnis gelesen werden kann; siehe unten.                                            |
| `requireAuthentication` | `false`              | Jede Verwendung braucht eine biometrische Authentifizierung.                                    |
| `authenticationPrompt`  | der Text des Systems | Was der biometrische Prompt anzeigt.                                                            |

`set` ersetzt das Geheimnis mitsamt seinen Optionen. Lese- und Löschvorgänge
finden das Geheimnis allein über Schlüssel und Service.

### Zugänglichkeit

| Wert                               | iOS (`kSecAttrAccessible…`)      | Android                                                       |
| ---------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| `'whenUnlocked'`                   | `WhenUnlocked`                   | Schlüssel nur im entsperrten Zustand nutzbar (Android 9+)     |
| `'afterFirstUnlock'`               | `AfterFirstUnlock`               | nutzbar, sobald nach dem Start einmal entsperrt               |
| `'whenUnlockedThisDeviceOnly'`     | `WhenUnlockedThisDeviceOnly`     | wie `'whenUnlocked'`                                          |
| `'afterFirstUnlockThisDeviceOnly'` | `AfterFirstUnlockThisDeviceOnly` | wie `'afterFirstUnlock'`                                      |
| `'whenPasscodeSetThisDeviceOnly'`  | `WhenPasscodeSetThisDeviceOnly`  | wie `'whenUnlocked'`; Schreiben braucht eine Bildschirmsperre |

`'afterFirstUnlock'` für ein Geheimnis verwenden, das Hintergrundarbeit
braucht, etwa ein Token, das ein Background-Fetch sendet. Das Lesen eines
`'whenUnlocked'`-Geheimnisses bei gesperrtem Gerät wird mit `ERR_UNAVAILABLE`
zurückgewiesen. Auf Android 8 (API 26–27), das kein entsperrtes Gerät
verlangen kann, verhält sich `'whenUnlocked'` wie `'afterFirstUnlock'`.
Android-App-Daten sind ohnehin bis zum ersten Entsperren verschlüsselt.

Auf iOS schlägt das Schreiben mit `'whenPasscodeSetThisDeviceOnly'` ohne Code
fehl, und das System löscht das Geheimnis, wenn der Code entfernt wird.
Android prüft beim Schreiben auf eine Bildschirmsperre, aber ein Geheimnis
bleibt bestehen, wenn die Sperre später entfernt wird.

### Authentifizierung

`requireAuthentication: true` bindet das Geheimnis an die jetzt registrierten
biometrischen Merkmale. Das Registrieren eines neuen Gesichts oder
Fingerabdrucks macht das Geheimnis unlesbar, und `get` löst dann `null` auf.

- **iOS:** Die Zugriffskontrolle des Eintrags ist `biometryCurrentSet`. Das
  Schreiben fragt nie nach; jedes Lesen zeigt Face ID oder Touch ID mit
  `authenticationPrompt`. `biometrics` in
  [`kuito.config.ts`](permissions.md#declare-them-in-kuitoconfigts)
  deklarieren, mit dem Grund, den iOS für Face ID anzeigt.
- **Android 11+ (API 30):** ein Keystore-Schlüssel, der für jede Verwendung
  eine starke biometrische Authentifizierung verlangt. Sowohl Schreiben als
  auch Lesen zeigen `BiometricPrompt` mit `authenticationPrompt` als Titel.
  Android 8–10 weist `requireAuthentication` mit `ERR_AUTH_UNAVAILABLE`
  zurück. Die `biometrics`-Deklaration fügt die Berechtigung `USE_BIOMETRIC`
  hinzu, die `BiometricPrompt` braucht.

Ohne registrierte Biometrie wird das Schreiben mit `ERR_AUTH_UNAVAILABLE`
zurückgewiesen. Ein abgebrochener Prompt weist mit `ERR_AUTH_CANCELED`
zurück, ein fehlgeschlagener mit `ERR_AUTH_FAILED`.

## Was jede Plattform garantiert

**iOS.** Jedes Geheimnis ist ein `kSecClassGenericPassword`-Eintrag (Service,
Account = Schlüssel) in der eigenen Keychain-Zugriffsgruppe der App. Einträge
werden nicht mit dem iCloud-Schlüsselbund synchronisiert. Der durch die Secure
Enclave geschützte Keychain verschlüsselt sie, und andere Apps können sie
nicht lesen.

**Android.** Jedes Geheimnis wird mit AES-256-GCM verschlüsselt, mit einem von
drei Keystore-Schlüsseln: einfach, entsperrtes Gerät erforderlich oder
biometrisch gebunden. Das Schlüsselmaterial verlässt den Keystore nie, der auf
Geräten, die eines haben, hardwaregestützt ist (TEE oder StrongBox). Der
Chiffretext, sein IV und der Alias des Schlüssels werden in der privaten
SharedPreferences-Datei `kuito.securestore` der App gespeichert. Der Name des
Eintrags (Service und Schlüssel) ist authentifizierte Daten, sodass ein in
einen anderen Eintrag verschobener Chiffretext nicht entschlüsselt werden
kann. Schreibvorgänge werden synchron committet.

## Neuinstallation und Backup

| Ereignis                                 | iOS                                                                                                                              | Android                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Deinstallation, dann Neuinstallation     | **Geheimnisse überleben.** Der Keychain überdauert die App.                                                                      | Geheimnisse sind weg: Die Daten der App und die Keystore-Schlüssel werden gelöscht.                       |
| Backup wiederhergestellt, gleiches Gerät | Wiederhergestellt.                                                                                                               | Der Chiffretext wird möglicherweise wiederhergestellt, sein Schlüssel aber nicht.                         |
| Backup wiederhergestellt, neues Gerät    | Verschlüsselte Backups stellen Geheimnisse ohne `THIS_DEVICE_ONLY` wieder her. `THIS_DEVICE_ONLY`-Geheimnisse wandern nicht mit. | Schlüssel verlassen das Gerät nie, daher lassen sich wiederhergestellte Chiffretexte nicht entschlüsseln. |

Auf Android wird ein Geheimnis, dessen Schlüssel fehlt (wiederhergestellt,
gelöscht oder durch eine neue Biometrie invalidiert), als `null` gelesen, und
sein unlesbarer Eintrag wird gelöscht.

Da iOS-Geheimnisse eine Neuinstallation überleben, sollte eine App, die sauber
starten muss, ihren ersten Start in [`Storage`](storage.md) festhalten, das
eine Neuinstallation leert. Fehlt dieser Eintrag, die ihr bekannten
Geheimnisse löschen.
