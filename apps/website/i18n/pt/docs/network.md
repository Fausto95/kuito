# network

A rede do dispositivo: o seu tipo, se está ativa e se chega à internet. No iOS
é `NWPathMonitor`; no Android, o callback de rede por omissão do
`ConnectivityManager`. Nenhum faz polling, e nenhum precisa dos Play Services.

```tsx
import { Text, network } from 'kuito';

network.state.value; // the state now, synchronously
await network.refresh(); // the same, read off the JS thread

function OfflineBanner() {
  return <Text>{network.state.value.isInternetReachable ? '' : 'You are offline'}</Text>;
}
```

| Membro      | É                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------- |
| `state`     | Um sinal do estado. Observado, acompanha cada mudança; não observado, uma leitura pergunta. |
| `refresh()` | O estado atual, como Promise. Use-o onde bloquear o JS não é bem-vindo.                     |

## O estado

```ts
{
  type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown',
  isConnected: boolean,
  isInternetReachable: boolean,
  details: { isExpensive: boolean, cellularGeneration: '2g' | '3g' | '4g' | '5g' | null },
}
```

| Campo                        | iOS (`NWPath`)                                              | Android (`NetworkCapabilities` da rede por omissão)        |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `type`                       | a interface que o caminho usa; `none` quando não satisfeito | o transporte da rede; `none` sem rede                      |
| `isConnected`                | `status` não é `unsatisfied`                                | `NET_CAPABILITY_INTERNET`                                  |
| `isInternetReachable`        | `status` é `satisfied`                                      | `NET_CAPABILITY_VALIDATED`                                 |
| `details.isExpensive`        | `isExpensive` (rede móvel, um hotspot pessoal)              | não `NET_CAPABILITY_NOT_METERED`                           |
| `details.cellularGeneration` | o rádio de dados do `CTTelephonyNetworkInfo`                | `TelephonyManager.dataNetworkType`, com `READ_PHONE_STATE` |

Qualquer outro transporte (uma VPN sem transporte subjacente, Bluetooth,
loopback) lê-se como `unknown`. `cellularGeneration` é null fora da rede móvel.

### Porque não há sonda de alcance

`isInternetReachable` é o veredicto da própria plataforma, e o Kuito não faz
nenhum pedido por sua conta. O Android valida cada rede por si: sonda uma vez
quando a rede sobe, volta a verificar quando as apps reportam falhas, e mantém
um captive portal por validar até se iniciar sessão nele, pelo que `VALIDATED`
é tão bom como uma sonda da app sem o tráfego. O iOS não tem flag de
validação; um caminho `satisfied` significa uma rota capaz de transportar
tráfego, pelo que um Wi-Fi com captive portal pode ler-se aí como alcançável. A
sonda do netinfo apanharia esse caso ao custo de um pedido a um URL fixo a
cada mudança, de uma dependência de um servidor e de um atraso antes da
resposta. Sonde o seu próprio backend se a sua app precisar de certeza sobre
isso.

## Observar

`state` muda quando qualquer campo difere do último estado. A plataforma só
monitoriza enquanto algo o observa: o primeiro componente que lê
`network.state` em JSX ou num `watch` inicia o `NWPathMonitor` ou regista o
callback de rede, e o último a desmontar pára-o.

## Notas por plataforma

- **`cellularGeneration` no Android precisa de `READ_PHONE_STATE`.** A shell
  não a declara nem a pede, pelo que a geração é null até a app receber essa
  permissão. O 5G non-standalone lê-se como `4g`: o Android só o reporta
  através de `TelephonyDisplayInfo`, que precisa de um listener por mudança.
- **O Android precisa de `ACCESS_NETWORK_STATE`,** uma permissão normal que a
  spec do módulo declara, pelo que só as apps que usam `network` a pedem.
- **O simulador iOS segue a rede do Mac.** Reporta a ligação do Mac como
  `wifi` (ou `ethernet`), nunca `cellular`, e `cellularGeneration` é null.
  Desligar o Wi-Fi do Mac chega à app como `none`. O Network Link Conditioner
  modela a velocidade e as perdas, mas deixa o caminho `satisfied`. A rede
  móvel e o Low Data Mode precisam de um dispositivo.
- **Uma leitura não observada no iOS** inicia um `NWPathMonitor` de uso único
  e espera pelo seu primeiro caminho, o que leva milissegundos; desiste ao fim
  de um segundo com `unknown`. Enquanto algo observa o estado, uma leitura
  responde a partir do monitor em execução.
