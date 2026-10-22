# Tarefas em segundo plano

`backgroundTasks` corre JavaScript enquanto a app está em segundo plano ou nem sequer
está a correr: o SO escolhe o momento, lança a app sem UI se for
preciso, e dá à tarefa um prazo. É um [módulo nativo](native-modules.md)
no iOS (BGTaskScheduler) e no Android (JobScheduler).

```tsx
import { backgroundTasks, storage } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
backgroundTasks.define('sync', async ({ deadline }) => {
  const response = await fetch('https://api.example.com/feed');

  await storage.set('feed', await response.text());
});

export default function App() {
  // Once, from anywhere: the OS keeps the registration across launches and reboots.
  void backgroundTasks.register('sync', { minimumInterval: 60, requiresNetwork: true });
  // …
}
```

```ts
// kuito.config.ts
export default {
  // …
  backgroundTasks: ['sync'],
} satisfies KuitoConfig;
```

| Função                                                                      | O que faz                                                                                                                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `define(name, task)`                                                        | A função que o SO corre sob `name`. Chame-a no âmbito do módulo. Definir um nome de novo substitui a sua tarefa.                              |
| `register(name, { minimumInterval?, requiresNetwork?, requiresCharging? })` | Pede ao SO que corra a tarefa aproximadamente a cada `minimumInterval` minutos (no mínimo 15, a predefinição). Substitui um registo anterior. |
| `unregister(name)`                                                          | Impede o SO de a correr.                                                                                                                      |
| `status()`                                                                  | `'available'`, ou `'denied'`/`'restricted'` quando o utilizador ou uma política desligou o trabalho em segundo plano para a app.              |

Uma tarefa recebe `{ name, deadline }`, com `deadline` em milissegundos desde a
época. Resolva quando o trabalho estiver feito. Uma tarefa que lança uma exceção ou rejeita reporta uma
execução falhada ao SO e o seu erro à LogBox (ou ao log do dispositivo, quando
headless). O SO trata `minimumInterval` como um limite inferior: agrupa o trabalho,
pondera a bateria e a utilização, e pode correr uma tarefa horas mais tarde ou nunca.

`register` falha com `ERR_UNDECLARED` para um nome que a configuração não declara,
e num dispositivo iOS com `ERR_UNAVAILABLE` quando a Atualização em Segundo Plano está
desligada. O Simulador não tem BGTaskScheduler (ver [Depuração](#debugging)).

As [tarefas de localização](location.md#background-updates) também são tarefas em segundo plano,
que a plataforma corre a cada lote de posições em vez de segundo um horário:
`location.defineUpdates` define uma.

## Declará-las em kuito.config.ts

`backgroundTasks` lista os nomes que a app pode registar: letras, dígitos, `.`,
`_` e `-`. A lista de um ambiente substitui a base
([apps](apps.md#environments)). A CLI escreve-os nas shells geradas
(`src/cli/shells.ts`):

- **iOS**: `BGTaskSchedulerPermittedIdentifiers` (os nomes, tal como escritos) e
  os `UIBackgroundModes` `fetch` e `processing`.
- **Android**: o job service `KuitoBackgroundTaskService`, os nomes como
  meta-data `dev.kuito.backgroundTasks`, e `RECEIVE_BOOT_COMPLETED`, que
  mantém os jobs registados entre reinícios.

Uma app sem tarefas em segundo plano não recebe nada disto.

## Como uma tarefa corre

1. **O SO inicia a tarefa.** No iOS dispara um launch handler do BGTaskScheduler;
   a shell regista um para cada nome declarado enquanto a app arranca,
   uma vez que o BGTaskScheduler só os aceita nessa altura. No Android, o JobScheduler inicia
   o `KuitoBackgroundTaskService` no processo da app.
2. **Torna-se uma execução** com um id e um prazo, guardada por
   `KuitoBackgroundTasks` (um por plataforma, ao lado dos outros objetos partilhados
   da shell). Vai para o runtime que começou a escutar execuções por último:
   a UI da app, quando abre enquanto um runtime headless está ativo.
3. **Se nenhum runtime escuta, a shell inicia um headless**,
   `KuitoHeadlessRuntime`, através do `startRuntime` que entrega a
   `KuitoBackgroundTasks` quando a app arranca (o app delegate do iOS, o
   `KuitoApplication` do Android): um runtime Hermes com módulos nativos e
   sem árvore de vistas. Define `__kuitoHostHeadless` antes de o kernel carregar, depois
   avalia o kernel e a app incluída. Os módulos da app correm, pelo que as suas
   chamadas a `define` também correm, mas o kernel salta o `patch`, pelo que nada é montado. No
   Android, os módulos num runtime headless não têm activity: um que precise dela
   falha com `ERR_NO_ACTIVITY`. `storage` funciona; `share()` e os pedidos de `permissions`
   não.
4. **O kernel escuta execuções assim que uma tarefa é definida**
   (`src/runtime/background-tasks.ts`). Escutar é o sinal: a plataforma
   entrega as execuções em espera como o evento `run`, e o kernel chama a tarefa.
5. **A execução termina uma vez.** Quando a tarefa termina, o kernel chama `finish`, e
   a plataforma informa o SO (`setTaskCompleted(success:)`, `jobFinished`). Se
   o SO expirar a tarefa primeiro, ou o prazo passar, a execução termina como
   falhada e um `finish` posterior é ignorado. Quando a última execução termina, um runtime
   headless encerra, a não ser que haja tarefas de localização a correr: as suas execuções chegam
   a cada poucos segundos, pelo que fica ativo até as suas atualizações pararem.

Quando a app está em segundo plano mas viva, o seu runtime de UI já está
a escutar, pelo que a tarefa corre lá, ao lado da app montada, sem segundo
runtime. Uma execução para um nome que a app nunca definiu falha de imediato e di-lo.

O runtime headless avalia a app incluída, nunca um Live Patch: uma tarefa
alterada durante `kuito dev` corre em segundo plano tal como estava na última build.

## Limites das plataformas

|                    | iOS                                                                                                                                         | Android                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Agendador          | BGTaskScheduler                                                                                                                             | JobScheduler, periódico e persistido                                                                 |
| Tempo de execução  | App refresh: cerca de 30 s. Processing: minutos                                                                                             | 10 minutos                                                                                           |
| `deadline`         | 25 s (refresh) ou 170 s (processing) após o início                                                                                          | 9 minutos após o início                                                                              |
| `requiresCharging` | Torna-a uma tarefa de processing (`requiresExternalPower`), que o iOS corre quando o dispositivo está inativo, muitas vezes de noite        | `setRequiresCharging`                                                                                |
| `requiresNetwork`  | Aplica-se às tarefas de processing; as tarefas de app refresh não têm ligação garantida                                                     | `NETWORK_TYPE_ANY`                                                                                   |
| Repetições         | O iOS corre um pedido uma vez; cada execução submete o seguinte, a partir do registo que o Kuito guarda                                    | Os jobs periódicos repetem-se                                                                        |
| Desligado quando   | A Atualização em Segundo Plano está desligada (`status()` diz `denied`), Modo de Poupança de Energia, ou o utilizador forçou o fecho da app | O utilizador restringiu a utilização em segundo plano da app (`restricted`), ou forçou a sua paragem |

**Porquê o JobScheduler, e não o WorkManager.** Um job periódico com restrições de rede e de
carregamento, mantido entre reinícios, é tudo o que `register` precisa, e o JobScheduler
fá-lo em todas as versões de Android que o Kuito suporta. O WorkManager acrescenta cerca de 0,4 MB
e a sua própria base de dados para trazer as mesmas funcionalidades aos níveis de API abaixo de 23 e para
encadear trabalho, nenhum dos quais o Kuito usa. Os ids dos jobs são o `hashCode` Java
do nome da tarefa, tornado não negativo.

## Depuração

O SO decide quando as tarefas correm, por isso dispare-as à mão. Cada `register` regista no log
o comando para a sua tarefa.

**Dispositivo iOS**: pause a app no depurador (`lldb`, ou o botão de pausa do
Xcode) e corra:

```text
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"sync"]
```

Retome, e o launch handler dispara; `_simulateExpirationForTaskWithIdentifier:`
expira-a. A tarefa tem de estar registada primeiro: o iOS só simula um lançamento para o qual
tem um pedido.

**Simulador iOS**: não tem BGTaskScheduler. `submit` falha aí e o
comando do depurador não encontra nenhum pedido, pelo que `register` guarda o registo,
regista isto no log em vez de falhar, e cada tarefa declarada escuta uma notificação
Darwin:

```sh
xcrun simctl spawn booted notifyutil -p dev.kuito.backgroundTasks.run.sync
```

A execução segue o mesmo caminho de um lançamento: o runtime de UI se algum
escutar, caso contrário um headless. O Simulador suspende uma app pouco depois
de ela sair do ecrã, e uma notificação publicada nessa altura é entregue quando
ela regressa. Para experimentar o caminho headless, inicie o binário da app sem scene,
tal como o iOS o lança para uma tarefa, e depois publique a notificação:

```sh
xcrun simctl terminate booted <bundle id>
DATA=$(xcrun simctl get_app_container booted <bundle id> data)
SIMCTL_CHILD_HOME=$DATA SIMCTL_CHILD_CFFIXED_USER_HOME=$DATA \
  xcrun simctl spawn booted "$(xcrun simctl get_app_container booted <bundle id>)/KuitoIOS" &
```

As duas variáveis dão-lhe os dados da própria app, pelo que `storage` é o da app.

**Android**:

```sh
adb shell cmd jobscheduler run -f <applicationId> <job id>
```

`-f` corre-o mesmo quando as suas restrições não estão satisfeitas. Para verificar o caso em que
a app não está a correr, coloque-a em segundo plano e mate apenas o processo
(`adb shell am kill <applicationId>`); `am force-stop` para a app, e o
Android não corre jobs para uma app parada. `adb shell dumpsys jobscheduler`
lista os jobs da app.

Em ambas as plataformas a execução regista o seu resultado (`Background task 'sync'
succeeded`) no log do dispositivo: Console.app ou `xcrun simctl spawn booted log
stream` no iOS, a tag `Kuito` do logcat no Android, para onde também vai a saída de
`console` de um runtime headless.
