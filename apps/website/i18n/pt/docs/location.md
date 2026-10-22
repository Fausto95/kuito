# location

A posição, a orientação e os endereços do dispositivo. No iOS é o Core Location; no
Android, o `LocationManager` da plataforma, o `Geocoder` e o sensor de vetor de
rotação. Nada precisa dos Play Services, pelo que o módulo não acrescenta nenhuma
dependência à aplicação. Os rádios só funcionam enquanto um pedido espera ou uma
vigilância está em curso.

```tsx
import { Text, location, permissions } from 'kuito';

const { status } = await permissions.request('location');

if (status === 'granted') {
  const here = await location.current({ accuracy: 'high' });
  const [place] = await location.reverseGeocode(here.coords);
}

function Here() {
  // Locates while Here is mounted; the fixes land in location.position.
  location.watch({ distanceInterval: 20 });

  return <Text>{`${location.position.value?.coords.latitude ?? '…'}`}</Text>;
}
```

| Membro                                    | É                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `current({ accuracy? })`                  | Uma posição nova.                                                                               |
| `last({ maxAge?, requiredAccuracy? })`    | A última posição que a plataforma teve, de imediato, ou `null` sem uma que cumpra os limites.   |
| `watch(options?)`                         | Localiza para `position` enquanto o seu âmbito durar; devolve a sua subscrição.                 |
| `position`                                | Um sinal: a posição mais recente que qualquer vigilância trouxe, ou `null`.                     |
| `error`                                   | Um sinal: o erro que terminou uma vigilância, ou `null` enquanto nenhuma tiver terminado.       |
| `watchHeading(callback)`                  | Chama `callback(heading)` à medida que o dispositivo roda, até `remove()`.                      |
| `geocode(address)`                        | As posições de um endereço.                                                                     |
| `reverseGeocode({ latitude, longitude })` | Os lugares numa posição, o mais próximo primeiro.                                               |
| `servicesEnabled()`                       | Se os serviços de localização estão ligados no dispositivo.                                     |
| `defineUpdates(name, task)`               | A tarefa que recebe as posições das atualizações em segundo plano. Chame-a no âmbito do módulo. |
| `startUpdates(name, options?)`            | Localiza também em segundo plano, para a tarefa, até `stopUpdates(name)`.                       |
| `stopUpdates(name)`                       | Para as atualizações da tarefa.                                                                 |
| `updating(name)`                          | Se as atualizações da tarefa estão a correr, ou retomam no próximo arranque da aplicação.       |

`maxAge` é em milissegundos e `requiredAccuracy` em metros. `watch` num
componente começa quando o componente é montado e para quando é desmontado;
noutro sítio, o `remove()` da subscrição para-o. Uma vigilância que a plataforma recusa
define `error` e não deixa nada a correr. `watchHeading` resolve a sua
subscrição assim que a bússola arranca, pelo que um dispositivo sem bússola rejeita.

## Permissão

Todas as funções exceto `geocode`, `watchHeading`, `servicesEnabled` e o
`stop` e o `has` das atualizações em segundo plano precisam da permissão `location`, e o
módulo nunca pede. Peça-a com
[`permissions.request('location')`](permissions.md); sem ela, uma chamada rejeita
com `ERR_PERMISSION`. A localização aproximada conta como concedida, como no Expo:
o `accuracy` da posição diz quão precisa é.

O módulo declara o que pede nas
[necessidades nativas](native-modules.md#native-needs) da sua especificação, pelo que uma aplicação que
importa `location` inclui `NSLocationWhenInUseUsageDescription` e, no Android,
`ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION`, e uma aplicação que não importa
não inclui nenhuma. Indique a razão que o iOS mostra em `kuito.config.ts`; ela substitui a
razão genérica do módulo:

```ts
permissions: { location: 'Find screenings near you.' },
```

As [atualizações em segundo plano](#background-updates) precisam também de `locationAlways`
declarado.

## Precisão

| `accuracy`          | `desiredAccuracy` no iOS               | Fornecedores Android, por ordem |
| ------------------- | -------------------------------------- | ------------------------------- |
| `lowest`            | `kCLLocationAccuracyThreeKilometers`   | network, gps                    |
| `low`               | `kCLLocationAccuracyKilometer`         | network, gps                    |
| `balanced` (padrão) | `kCLLocationAccuracyHundredMeters`     | network, gps                    |
| `high`              | `kCLLocationAccuracyNearestTenMeters`  | gps, network                    |
| `highest`           | `kCLLocationAccuracyBest`              | gps, network                    |
| `bestForNavigation` | `kCLLocationAccuracyBestForNavigation` | gps, network                    |

Uma vigilância usa o primeiro fornecedor que o dispositivo tem ligado. Uma posição única pede aos
fornecedores ligados, por ordem, até ao GPS e fica com a primeira posição: o fornecedor de rede
pode estar ligado sem nada a reportar (sem Wi-Fi nem dados móveis, um emulador), e uma
posição GPS é suficientemente precisa para qualquer pedido. O fornecedor `fused` da plataforma não é
usado: através do `LocationManager`, pede ao serviço fused da Google uma
posição de consumo equilibrado, que este responde apenas com a localização de rede. Com todos os
fornecedores desligados, o Android rejeita com `ERR_SERVICES_DISABLED`; o iOS reporta
serviços desligados como uma permissão negada.

## Vigilância

```ts
{ accuracy?: LocationAccuracy, timeInterval?: number, distanceInterval?: number }
```

`distanceInterval` são os metros que o dispositivo se move antes da próxima atualização (0,
o padrão, é cada posição). `timeInterval` é o tempo mínimo entre atualizações em
milissegundos, 1000 por padrão; é apenas do Android, pois o iOS entrega as posições à medida
que chegam. Cada vigilância tem o seu próprio pedido na plataforma, pelo que duas vigilâncias mantêm
as suas próprias opções, e a última a terminar, ou um recarregamento, desliga os rádios.

`location.error` guarda o erro que termina uma vigilância. No iOS, isso é o acesso revogado
enquanto a aplicação corre (`ERR_PERMISSION`); uma posição que a plataforma ainda não consegue obter não é
um erro, e a vigilância continua a tentar. O Android termina o processo da aplicação quando
o acesso é revogado, pelo que uma vigilância aí não termina com um erro.

## Atualizações em segundo plano

Uma tarefa de localização continua a receber posições enquanto a aplicação está em segundo plano, e
ao longo dos seus reinícios. É uma
[tarefa em segundo plano](background-tasks.md) que a plataforma executa com cada
lote de posições, no runtime de UI da aplicação quando este corre e num runtime headless
quando não corre.

```tsx
import { location, permissions } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
location.defineUpdates('run', async ({ locations }) => {
  await saveTrack(locations);
});

async function startRun() {
  const { status } = await permissions.request('location');

  if (status === 'granted')
    await location.startUpdates('run', {
      accuracy: 'high',
      distanceInterval: 10,
      notification: { title: 'Recording your run' },
    });
}
```

```ts
// kuito.config.ts
permissions: {
  location: 'Map your runs.',
  locationAlways: 'Record your runs with the screen off.',
},
```

`startUpdates` aceita [as opções de `watch`](#watching) e estas:

| Opção                              | Plataforma | Faz                                                                                                                  |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `pausesUpdatesAutomatically`       | iOS        | Deixa o Core Location pausar as atualizações enquanto o dispositivo fica parado. Desligado por padrão, como no Expo. |
| `showsBackgroundLocationIndicator` | iOS        | Mostra a pílula azul da barra de estado enquanto a aplicação localiza em segundo plano.                              |
| `notification: { title?, body? }`  | Android    | A notificação do serviço em primeiro plano. O nome da aplicação e uma linha genérica por padrão.                     |

A tarefa recebe `{ name, deadline, locations }`: as posições do lote, a mais antiga
primeiro, e o momento em que a plataforma deixa de esperar pela execução, em milissegundos desde
a época. Resolva quando estiverem tratadas; uma tarefa que lança ou rejeita
reporta uma execução falhada ao LogBox ou ao registo do dispositivo, e as atualizações continuam.
Há uma execução por cada posição, por isso mantenha a tarefa curta, ou agrupe o trabalho ao longo de várias
execuções. `startUpdates` para um nome que `defineUpdates` não definiu
rejeita de imediato. Iniciar uma tarefa de novo substitui as suas opções.

**Declarar `locationAlways` liga-as.** A CLI adiciona o modo de segundo plano `location`
ao Info.plist e, no Android, o serviço em primeiro plano
`KuitoLocationService` (tipo `location`) com
`FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_LOCATION`. Sem a
declaração, `startUpdates` rejeita com `ERR_UNDECLARED`: o iOS termina uma
aplicação que localiza em segundo plano sem o modo. As revisões da App Store e da Google
Play perguntam para que é que a aplicação usa a localização em segundo plano, por isso declare-o
apenas numa aplicação que a use.

**Permissões.** As atualizações começam com a permissão `location`, como no Expo,
a partir do primeiro plano: o iOS continua então a localizar em segundo plano com o
indicador azul, e o Android com a sua notificação. `locationAlways` vai
mais longe: sem o indicador no iOS e, aí, relançando a aplicação depois de
ter sido terminada (abaixo). O Android 12 e posteriores recusam iniciar um serviço em primeiro plano
a partir do segundo plano, pelo que `startUpdates` rejeita aí com
`ERR_UNAVAILABLE`; inicie-o a partir de uma ação do utilizador.

**Reinícios.** A plataforma mantém as tarefas iniciadas entre arranques, e
`defineUpdates` retoma as atualizações de uma tarefa quando os módulos da aplicação correm
de novo, até `stopUpdates`. Uma permissão revogada para-as de
vez.

- **iOS**: as atualizações param quando a aplicação é terminada. Com `locationAlways`
  concedido, o iOS vigia também as mudanças significativas (cerca de 500 m) e
  relança a aplicação sem UI por uma delas; a shell inicia um runtime headless,
  a definição da tarefa retoma as atualizações, e seguem-se as execuções. Sem ele,
  as atualizações retomam na próxima vez que o utilizador abrir a aplicação.
- **Android**: o serviço em primeiro plano é persistente (sticky). Quando o Android termina o
  processo da aplicação, reinicia o serviço, e a primeira posição inicia um
  runtime headless. O serviço para com a última tarefa, e quando o utilizador
  para a aplicação a partir das Definições.

Enquanto a UI corre, as execuções vão para o seu runtime; um runtime headless iniciado para
elas mantém-se ativo entre posições, e a UI assume as execuções assim que abre. O
resultado de cada execução só chega ao registo do dispositivo quando falha.

## Valores

```ts
// A fix: current, last, position
{
  coords: {
    latitude: number, longitude: number,
    altitude: number | null, accuracy: number | null, altitudeAccuracy: number | null,
    heading: number | null, speed: number | null,
  },
  timestamp: number, // ms since the epoch
  mocked: boolean,
}

// watchHeading
{ trueHeading: number | null, magHeading: number, accuracy: number }
```

Um campo que a plataforma não conhece é `null`: sem altitude sem uma posição
vertical, sem `heading` nem `speed` enquanto parado. `mocked` é uma localização simulada:
a do simulador iOS, ou a de uma aplicação de localização fictícia no Android. O
`adb emu geo fix` do emulador chega à aplicação como uma posição GPS real.

O `accuracy` da orientação difere como no Expo: graus de erro no iOS, a
calibração da bússola de 0 (nenhuma) a 3 (alta) no Android. O Android deriva
`trueHeading` da orientação magnética e da declinação na última posição
conhecida, pelo que é `null` até haver uma; o iOS reporta-o como o Core Location o faz.
Um dispositivo sem bússola (o simulador iOS) rejeita `watchHeading` com
`ERR_UNAVAILABLE`.

`geocode` resolve `{ latitude, longitude, altitude, accuracy }` para cada
correspondência; o geocodificador do Android não dá altitude nem precisão. `reverseGeocode`
resolve endereços:

| Campo              | iOS (`CLPlacemark`)     | Android (`Address`)          |
| ------------------ | ----------------------- | ---------------------------- |
| `name`             | `name`                  | `featureName`                |
| `streetNumber`     | `subThoroughfare`       | `subThoroughfare`            |
| `street`           | `thoroughfare`          | `thoroughfare`               |
| `district`         | `subLocality`           | `subLocality`                |
| `city`             | `locality`              | `locality`                   |
| `subregion`        | `subAdministrativeArea` | `subAdminArea`               |
| `region`           | `administrativeArea`    | `adminArea`                  |
| `postalCode`       | `postalCode`            | `postalCode`                 |
| `country`          | `country`               | `countryName`                |
| `isoCountryCode`   | `isoCountryCode`        | `countryCode`                |
| `timezone`         | `timeZone`              | `null`                       |
| `formattedAddress` | `null`                  | a primeira linha do endereço |

Ambos os geocodificadores são serviços online com limites de pedidos: geocodifique numa ação do
utilizador, não a cada posição. Um endereço sem correspondência resolve `[]`. O
geocodificador do Android faz parte dos serviços de sistema da Google; um dispositivo sem eles (algumas
compilações AOSP) rejeita com `ERR_UNAVAILABLE`.

## Erros

| Código                     | Significado                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PERMISSION`           | A aplicação não tem a permissão `location`.                                                                                                          |
| `ERR_SERVICES_DISABLED`    | Android: todos os fornecedores de localização estão desligados.                                                                                      |
| `ERR_LOCATION_UNAVAILABLE` | iOS: o Core Location não conseguiu obter uma posição.                                                                                                |
| `ERR_UNAVAILABLE`          | Sem bússola para `watchHeading`, sem geocodificador no Android, ou atualizações em segundo plano iniciadas a partir do segundo plano no Android 12+. |
| `ERR_GEOCODE`              | O geocodificador falhou: offline, ou limite de pedidos atingido.                                                                                     |
| `ERR_UNDECLARED`           | Atualizações em segundo plano sem `locationAlways` declarado.                                                                                        |

Opções inválidas (um `accuracy` desconhecido, um intervalo negativo, uma latitude além de
±90) lançam um `TypeError` como rejeição, antes de algo chegar à plataforma.

## Diferenças em relação ao Expo

- **As permissões vivem em `permissions`.** O
  `requestForegroundPermissionsAsync` do Expo é `permissions.request('location')`,
  e `requestBackgroundPermissionsAsync` é
  `permissions.request('locationAlways')`, da mesma forma para todos os módulos
  ([porquê](permissions.md#differences-from-expo)).
- **As tarefas de localização são definidas em `location`.** O
  `TaskManager.defineTask(name, ({ data: { locations } }) => …)` do Expo é
  `location.defineUpdates(name, ({ locations }) => …)`: posições tipadas, sem
  `data` a desempacotar, e um `error` é uma execução falhada em vez de um argumento.
  Os `deferredUpdatesInterval`, `deferredUpdatesDistance` e
  `activityType` do Expo ainda não existem.
- **Os nomes perdem `Async` e `get`, a posição é um sinal, e a precisão é
  uma string.** `getCurrentPositionAsync` é `current`, `watchPositionAsync` é
  `watch` e `position`; `Accuracy.High` é `'high'`.
- **Sem Play Services no Android.** O Expo usa o
  `FusedLocationProviderClient` da Google, cerca de um megabyte de dependência. Os
  fornecedores da plataforma dão as mesmas posições num telemóvel com GPS; em interiores sem
  varrimento de Wi-Fi, uma posição `high` pode demorar mais a chegar. `current` espera
  pela primeira posição que o fornecedor entrega, sem timeout próprio.

## Ainda não

- **Geofencing** (`startGeofencingAsync`) e `enableNetworkProviderAsync`.
