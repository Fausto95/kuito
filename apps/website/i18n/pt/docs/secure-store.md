# secureStore

Segredos como tokens e palavras-passe: os verbos de `storage` sobre o keychain.
O iOS guarda-os no Keychain. O Android cifra-os com uma chave do Android
Keystore, sem dependência de `androidx.security-crypto`. Um segredo que a UI
segue pode ser um sinal:
[`persisted(…, { secure: true })`](storage.md#persisted) guarda aqui o seu valor.

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

As chaves e `keychainService` usam apenas letras, dígitos, `.`, `-` e `_`.
Os valores são strings; guarde `JSON.stringify(value)` para dados. Tudo o resto
rejeita com um `TypeError` antes de chegar à plataforma. Mantenha cada segredo
pequeno, alguns KB no máximo. O Keychain não é uma base de dados.

## Opções

| Opção                   | Predefinição       | Significado                                                                       |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `keychainService`       | `'app'`            | Um conjunto separado de segredos: a mesma chave em dois serviços é dois segredos. |
| `keychainAccessible`    | `'whenUnlocked'`   | Quando o segredo pode ser lido; ver abaixo.                                       |
| `requireAuthentication` | `false`            | Cada utilização exige uma biometria.                                              |
| `authenticationPrompt`  | o texto do sistema | O que o pedido biométrico diz.                                                    |

`set` substitui o segredo juntamente com as suas opções. As leituras e as
eliminações encontram o segredo apenas pela chave e pelo serviço.

### Acessibilidade

| Valor                              | iOS (`kSecAttrAccessible…`)      | Android                                                         |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `'whenUnlocked'`                   | `WhenUnlocked`                   | chave utilizável só com o dispositivo desbloqueado (Android 9+) |
| `'afterFirstUnlock'`               | `AfterFirstUnlock`               | utilizável depois do primeiro desbloqueio após o arranque       |
| `'whenUnlockedThisDeviceOnly'`     | `WhenUnlockedThisDeviceOnly`     | como `'whenUnlocked'`                                           |
| `'afterFirstUnlockThisDeviceOnly'` | `AfterFirstUnlockThisDeviceOnly` | como `'afterFirstUnlock'`                                       |
| `'whenPasscodeSetThisDeviceOnly'`  | `WhenPasscodeSetThisDeviceOnly`  | como `'whenUnlocked'`; escrever exige um bloqueio de ecrã       |

Use `'afterFirstUnlock'` para um segredo de que o trabalho em segundo plano
precisa, como um token que um fetch em segundo plano envia. Ler um segredo
`'whenUnlocked'` com o dispositivo bloqueado rejeita com `ERR_UNAVAILABLE`. No
Android 8 (API 26–27), que não consegue exigir um dispositivo desbloqueado,
`'whenUnlocked'` comporta-se como `'afterFirstUnlock'`. Os dados das
aplicações Android estão de qualquer forma cifrados até ao primeiro desbloqueio.

No iOS, `'whenPasscodeSetThisDeviceOnly'` falha ao escrever sem um código de
acesso, e o sistema elimina o segredo se o código de acesso for removido. O
Android verifica a existência de um bloqueio de ecrã ao escrever, mas um
segredo mantém-se se o bloqueio for removido mais tarde.

### Autenticação

`requireAuthentication: true` liga o segredo às biometrias registadas neste
momento. Registar um novo rosto ou impressão digital torna o segredo ilegível,
e `get` resolve então `null`.

- **iOS:** o controlo de acesso do item é `biometryCurrentSet`. Escrever nunca
  pede confirmação; cada leitura mostra o Face ID ou o Touch ID com
  `authenticationPrompt`. Declare `biometrics` em
  [`kuito.config.ts`](permissions.md#declare-them-in-kuitoconfigts),
  com a razão que o iOS mostra para o Face ID.
- **Android 11+ (API 30):** uma chave do Keystore que exige uma biometria
  forte em cada utilização. Tanto escrever como ler mostram o `BiometricPrompt`
  com `authenticationPrompt` como título. O Android 8–10 rejeita
  `requireAuthentication` com `ERR_AUTH_UNAVAILABLE`. A declaração
  `biometrics` acrescenta a permissão `USE_BIOMETRIC` de que o
  `BiometricPrompt` precisa.

Sem uma biometria registada, escrever rejeita com `ERR_AUTH_UNAVAILABLE`. Um
pedido dispensado rejeita com `ERR_AUTH_CANCELED`, e um falhado com
`ERR_AUTH_FAILED`.

## O que cada plataforma garante

**iOS.** Cada segredo é um item `kSecClassGenericPassword` (serviço, conta =
chave) no grupo de acesso ao Keychain próprio da aplicação. Os itens não são
sincronizados com o Keychain do iCloud. O Keychain protegido pelo Secure
Enclave cifra-os, e as outras aplicações não os conseguem ler.

**Android.** Cada segredo é cifrado com AES-256-GCM usando uma de três chaves
do Keystore: simples, com dispositivo desbloqueado obrigatório, ou ligada à
biometria. O material da chave nunca sai do Keystore, que tem suporte de
hardware (TEE ou StrongBox) nos dispositivos que o têm. O texto cifrado, o seu
IV e o alias da chave são guardados no ficheiro SharedPreferences privado da
aplicação `kuito.securestore`. O nome da entrada (serviço e chave) é dado
autenticado, pelo que um texto cifrado movido para outra entrada falha ao
decifrar. As escritas são confirmadas de forma síncrona.

## Reinstalação e cópia de segurança

| Evento                                           | iOS                                                                                                  | Android                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Desinstalar e depois reinstalar                  | **Os segredos sobrevivem.** O Keychain sobrevive à aplicação.                                        | Os segredos desaparecem: os dados da aplicação e as chaves do Keystore são eliminados.                  |
| Cópia de segurança restaurada, mesmo dispositivo | Restaurados.                                                                                         | O texto cifrado pode ser restaurado, mas a sua chave não.                                               |
| Cópia de segurança restaurada, novo dispositivo  | As cópias cifradas restauram os segredos não `THIS_DEVICE_ONLY`. Os `THIS_DEVICE_ONLY` não se movem. | As chaves nunca saem do dispositivo, pelo que os textos cifrados restaurados não se conseguem decifrar. |

No Android, um segredo cuja chave desapareceu (restaurado, apagado, ou
invalidado por uma nova biometria) lê-se como `null`, e a sua entrada ilegível é
eliminada.

Como os segredos do iOS sobrevivem a uma reinstalação, uma aplicação que tenha
de começar limpa deve registar o seu primeiro arranque em
[`Storage`](storage.md), que uma reinstalação limpa. Quando esse registo não
existir, elimine os segredos que conhece.
