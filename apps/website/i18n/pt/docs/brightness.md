# brightness

O brilho do ecrã enquanto a aplicação está em primeiro plano.

```tsx
import { Text, brightness } from 'kuito';

brightness.level.value = 1; // a QR code, a boarding pass
<Text>{`${brightness.level.value ?? '…'}`}</Text>;
await brightness.restore();
```

| Membro      | É                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `level`     | Um sinal escrevível, de 0 a 1: o nível da aplicação se ela definiu um, caso contrário o do sistema. `null` até a plataforma responder. |
| `system`    | Um sinal: se a aplicação não definiu nenhum nível, ou restaurou o do sistema. `null` até a plataforma responder.                       |
| `restore()` | Devolve o brilho ao sistema, e depois lê de novo ambos os sinais.                                                                      |

O brilho é lido na thread principal, pelo que os sinais começam a `null` e a
primeira leitura pergunta à plataforma. Atribuir `level` tem efeito de imediato; um nível
fora de 0 a 1 lança um `RangeError` antes de algo atravessar, e uma escrita que a
plataforma rejeita passa pela costura de erros e lê o nível de novo.

O nível mantém-se apenas enquanto a aplicação está em primeiro plano, e um reload devolve-o:

- O iOS tem um único brilho para todo o dispositivo, pelo que `UIScreen.brightness`
  sobrevive à aplicação. O módulo guarda o nível do sistema anterior à primeira
  mudança, repõe-no quando a aplicação passa para segundo plano (através de
  [`KuitoAppLifecycle`](app-state.md#how-it-is-wired)), e aplica de novo o
  nível da aplicação quando ela regressa.
- O Android define o `screenBrightness` da janela, que o sistema já
  restringe à atividade.

O brilho do sistema (o seu modo, a permissão `WRITE_SETTINGS`) não
está aqui, nem um evento de mudança: `level` segue as escritas da própria aplicação. O simulador iOS não tem retroiluminação: ignora o nível
e lê sempre 0.5. Experimente o brilho num dispositivo ou no emulador Android.
