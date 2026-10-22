# secureStore

Les secrets tels que les jetons et les mots de passe : les verbes de `storage`
au-dessus du trousseau. iOS les garde dans le Keychain. Android les chiffre
avec une clé de l'Android Keystore, sans dépendance à
`androidx.security-crypto`. Un secret que l'interface suit peut être un
signal : [`persisted(…, { secure: true })`](storage.md#persisted) y conserve sa
valeur.

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

Les clés et `keychainService` n'utilisent que des lettres, des chiffres, `.`,
`-` et `_`. Les valeurs sont des chaînes ; stockez `JSON.stringify(value)` pour
des données. Tout le reste est rejeté avec une `TypeError` avant d'atteindre
la plateforme. Gardez chaque secret petit, quelques Ko au plus. Le Keychain
n'est pas une base de données.

## Options

| Option                  | Défaut              | Signification                                                                       |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `keychainService`       | `'app'`             | Un ensemble distinct de secrets : la même clé dans deux services fait deux secrets. |
| `keychainAccessible`    | `'whenUnlocked'`    | Quand le secret peut être lu ; voir ci-dessous.                                     |
| `requireAuthentication` | `false`             | Chaque utilisation demande une biométrie.                                           |
| `authenticationPrompt`  | le texte du système | Ce que dit l'invite biométrique.                                                    |

`set` remplace le secret avec ses options. Les lectures et les suppressions
retrouvent le secret par sa clé et son service seuls.

### Accessibilité

| Valeur                             | iOS (`kSecAttrAccessible…`)      | Android                                                           |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `'whenUnlocked'`                   | `WhenUnlocked`                   | clé utilisable seulement tant que déverrouillé (Android 9+)       |
| `'afterFirstUnlock'`               | `AfterFirstUnlock`               | utilisable une fois déverrouillé après le démarrage               |
| `'whenUnlockedThisDeviceOnly'`     | `WhenUnlockedThisDeviceOnly`     | comme `'whenUnlocked'`                                            |
| `'afterFirstUnlockThisDeviceOnly'` | `AfterFirstUnlockThisDeviceOnly` | comme `'afterFirstUnlock'`                                        |
| `'whenPasscodeSetThisDeviceOnly'`  | `WhenPasscodeSetThisDeviceOnly`  | comme `'whenUnlocked'` ; l'écriture exige un verrouillage d'écran |

Utilisez `'afterFirstUnlock'` pour un secret dont un travail en arrière-plan a
besoin, comme un jeton qu'un fetch en arrière-plan envoie. Lire un secret
`'whenUnlocked'` pendant que l'appareil est verrouillé rejette avec
`ERR_UNAVAILABLE`. Sur Android 8 (API 26–27), qui ne peut pas exiger un
appareil déverrouillé, `'whenUnlocked'` se comporte comme
`'afterFirstUnlock'`. Les données des applications Android sont de toute façon
chiffrées jusqu'au premier déverrouillage.

Sur iOS, `'whenPasscodeSetThisDeviceOnly'` échoue à écrire sans code d'accès,
et le système supprime le secret si le code d'accès est retiré. Android
vérifie la présence d'un verrouillage d'écran à l'écriture, mais un secret
reste si le verrouillage est retiré plus tard.

### Authentification

`requireAuthentication: true` lie le secret aux données biométriques
enregistrées à cet instant. Enregistrer un nouveau visage ou une nouvelle
empreinte rend le secret illisible, et `get` se résout alors en `null`.

- **iOS :** le contrôle d'accès de l'élément est `biometryCurrentSet`.
  L'écriture ne demande jamais rien ; chaque lecture affiche Face ID ou Touch
  ID avec `authenticationPrompt`. Déclarez `biometrics` dans
  [`kuito.config.ts`](permissions.md#declare-them-in-kuitoconfigts), avec la
  raison qu'iOS affiche pour Face ID.
- **Android 11+ (API 30) :** une clé Keystore qui exige une biométrie forte
  à chaque utilisation. L'écriture comme la lecture affichent
  `BiometricPrompt` avec `authenticationPrompt` pour titre. Android 8–10
  rejette `requireAuthentication` avec `ERR_AUTH_UNAVAILABLE`. La déclaration
  `biometrics` ajoute la permission `USE_BIOMETRIC` dont `BiometricPrompt` a
  besoin.

Sans biométrie enregistrée, l'écriture rejette avec `ERR_AUTH_UNAVAILABLE`.
Une invite fermée rejette avec `ERR_AUTH_CANCELED`, et une invite échouée
avec `ERR_AUTH_FAILED`.

## Ce que chaque plateforme garantit

**iOS.** Chaque secret est un élément `kSecClassGenericPassword` (service,
account = clé) dans le groupe d'accès Keychain propre à l'application. Les
éléments ne sont pas synchronisés avec le trousseau iCloud. Le Keychain,
protégé par la Secure Enclave, les chiffre, et les autres applications ne
peuvent pas les lire.

**Android.** Chaque secret est chiffré en AES-256-GCM avec l'une de trois
clés Keystore : simple, exigeant un appareil déverrouillé, ou liée à la
biométrie. Le matériel de clé ne quitte jamais le Keystore, qui est adossé au
matériel (TEE ou StrongBox) sur les appareils qui en disposent. Le texte
chiffré, son IV et l'alias de la clé sont stockés dans le fichier
SharedPreferences privé `kuito.securestore` de l'application. Le nom de
l'entrée (service et clé) est une donnée authentifiée, de sorte qu'un texte
chiffré déplacé vers une autre entrée échoue à se déchiffrer. Les écritures
sont validées de manière synchrone.

## Réinstallation et sauvegarde

| Événement                             | iOS                                                                                                                 | Android                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Désinstallation, puis réinstallation  | **Les secrets survivent.** Le Keychain survit à l'application.                                                      | Les secrets ont disparu : les données et les clés Keystore de l'application sont supprimées.             |
| Sauvegarde restaurée, même appareil   | Restaurés.                                                                                                          | Le texte chiffré peut être restauré, mais pas sa clé.                                                    |
| Sauvegarde restaurée, nouvel appareil | Les sauvegardes chiffrées restaurent les secrets non `THIS_DEVICE_ONLY`. Ceux en `THIS_DEVICE_ONLY` ne migrent pas. | Les clés ne quittent jamais l'appareil, donc les textes chiffrés restaurés ne peuvent pas se déchiffrer. |

Sur Android, un secret dont la clé a disparu (restaurée, effacée ou invalidée
par une nouvelle biométrie) se lit comme `null`, et son entrée illisible est
supprimée.

Parce que les secrets iOS survivent à une réinstallation, une application qui
doit démarrer propre devrait enregistrer son premier lancement dans
[`Storage`](storage.md), qu'une réinstallation efface. Quand cet enregistrement
manque, supprimez les secrets qu'elle connaît.
