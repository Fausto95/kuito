# Tâches en arrière-plan

`backgroundTasks` exécute du JavaScript pendant que l'app est en arrière-plan ou pas
lancée du tout : l'OS choisit le moment, lance l'app sans UI s'il le
faut, et donne à la tâche une échéance. C'est un [module natif](native-modules.md)
sur iOS (BGTaskScheduler) et Android (JobScheduler).

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

| Fonction                                                                    | Ce qu'elle fait                                                                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `define(name, task)`                                                        | La fonction que l'OS exécute sous `name`. Appelez-la à la portée du module. Redéfinir un nom remplace sa tâche.                                            |
| `register(name, { minimumInterval?, requiresNetwork?, requiresCharging? })` | Demande à l'OS d'exécuter la tâche environ toutes les `minimumInterval` minutes (au moins 15, la valeur par défaut). Remplace un enregistrement antérieur. |
| `unregister(name)`                                                          | Empêche l'OS de l'exécuter.                                                                                                                                |
| `status()`                                                                  | `'available'`, ou `'denied'`/`'restricted'` quand l'utilisateur ou une politique a désactivé le travail en arrière-plan pour l'app.                        |

Une tâche reçoit `{ name, deadline }`, avec `deadline` en millisecondes depuis
l'epoch. Résolvez quand le travail est fait. Une tâche qui lève une exception ou rejette signale une
exécution échouée à l'OS et son erreur à la LogBox (ou au journal de l'appareil, en mode
headless). L'OS traite `minimumInterval` comme une borne inférieure : il regroupe le travail,
pèse la batterie et l'usage, et peut exécuter une tâche des heures plus tard ou pas du tout.

`register` échoue avec `ERR_UNDECLARED` pour un nom que la config ne déclare pas,
et sur un appareil iOS avec `ERR_UNAVAILABLE` quand Background App Refresh est
désactivé. Le simulateur n'a pas de BGTaskScheduler (voir [Débogage](#debugging)).

Les [tâches de localisation](location.md#background-updates) sont aussi des tâches en arrière-plan,
que la plateforme exécute à chaque lot de positions plutôt que selon un calendrier :
`location.defineUpdates` en définit une.

## Les déclarer dans kuito.config.ts

`backgroundTasks` liste les noms que l'app peut enregistrer : lettres, chiffres, `.`,
`_` et `-`. La liste d'un environnement remplace celle de base
([apps](apps.md#environments)). La CLI les écrit dans les shells générés
(`src/cli/shells.ts`) :

- **iOS** : `BGTaskSchedulerPermittedIdentifiers` (les noms, tels qu'écrits) et
  les `UIBackgroundModes` `fetch` et `processing`.
- **Android** : le service de job `KuitoBackgroundTaskService`, les noms en
  meta-data `dev.kuito.backgroundTasks`, et `RECEIVE_BOOT_COMPLETED`, qui
  conserve les jobs enregistrés après un redémarrage.

Une app sans tâches en arrière-plan ne reçoit rien de tout cela.

## Comment une tâche s'exécute

1. **L'OS démarre la tâche.** Sur iOS, un gestionnaire de lancement BGTaskScheduler se déclenche ;
   le shell en enregistre un pour chaque nom déclaré pendant le lancement de l'app,
   puisque BGTaskScheduler ne les accepte qu'à ce moment-là. Sur Android, JobScheduler démarre
   `KuitoBackgroundTaskService` dans le processus de l'app.
2. **Elle devient une exécution** avec un id et une échéance, détenue par
   `KuitoBackgroundTasks` (un par plateforme, à côté des autres objets partagés
   du shell). Elle va au runtime qui s'est mis à écouter les exécutions en dernier :
   l'UI de l'app, quand elle s'ouvre alors qu'un runtime headless est actif.
3. **Si aucun runtime n'écoute, le shell en démarre un headless**,
   `KuitoHeadlessRuntime`, via le `startRuntime` qu'il confie à
   `KuitoBackgroundTasks` au lancement de l'app (l'app delegate iOS,
   le `KuitoApplication` d'Android) : un runtime Hermes avec des modules natifs et
   sans arbre de vues. Il définit `__kuitoHostHeadless` avant le chargement du kernel, puis
   évalue le kernel et l'app embarquée. Les modules de l'app s'exécutent, donc leurs
   appels à `define` s'exécutent aussi, mais le kernel saute `patch`, donc rien n'est monté. Sur
   Android, les modules d'un runtime headless n'ont pas d'activité : un module qui en a besoin
   échoue avec `ERR_NO_ACTIVITY`. `storage` fonctionne ; `share()` et les invites de
   `permissions` non.
4. **Le kernel écoute les exécutions dès qu'une tâche est définie**
   (`src/runtime/background-tasks.ts`). L'écoute est le signal : la plateforme
   livre les exécutions en attente sous forme d'événement `run`, et le kernel appelle la tâche.
5. **L'exécution se termine une seule fois.** Quand la tâche se règle, le kernel appelle `finish`, et
   la plateforme le dit à l'OS (`setTaskCompleted(success:)`, `jobFinished`). Si
   l'OS expire la tâche avant, ou si l'échéance passe, l'exécution se termine en
   échec et un `finish` ultérieur est ignoré. Quand la dernière exécution se termine, un runtime
   headless s'arrête, sauf si des tâches de localisation tournent : leurs exécutions arrivent
   toutes les quelques secondes, donc il reste actif jusqu'à l'arrêt de leurs mises à jour.

Quand l'app est en arrière-plan mais vivante, son runtime UI écoute déjà,
donc la tâche s'y exécute, à côté de l'app montée, sans second
runtime. Une exécution pour un nom que l'app n'a jamais défini échoue aussitôt et le dit.

Le runtime headless évalue l'app embarquée, jamais un Live Patch : une tâche
modifiée pendant `kuito dev` s'exécute en arrière-plan telle qu'au dernier build.

## Limites des plateformes

|                    | iOS                                                                                                                                           | Android                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ordonnanceur       | BGTaskScheduler                                                                                                                               | JobScheduler, périodique et persistant                                                               |
| Durée d'exécution  | App refresh : environ 30 s. Processing : des minutes                                                                                          | 10 minutes                                                                                           |
| `deadline`         | 25 s (refresh) ou 170 s (processing) après le début                                                                                           | 9 minutes après le début                                                                             |
| `requiresCharging` | En fait une tâche processing (`requiresExternalPower`), qu'iOS exécute quand l'appareil est inactif, souvent la nuit                          | `setRequiresCharging`                                                                                |
| `requiresNetwork`  | S'applique aux tâches processing ; les tâches app refresh n'ont pas de connexion garantie                                                     | `NETWORK_TYPE_ANY`                                                                                   |
| Répétition         | iOS exécute une requête une fois ; chaque exécution soumet la suivante, à partir de l'enregistrement que Kuito conserve                       | Les jobs périodiques se répètent                                                                     |
| Désactivé quand    | Background App Refresh est désactivé (`status()` dit `denied`), en mode Économie d'énergie, ou si l'utilisateur a forcé la fermeture de l'app | L'utilisateur a restreint l'usage en arrière-plan de l'app (`restricted`), ou l'a forcée à s'arrêter |

**Pourquoi JobScheduler, et pas WorkManager.** Un job périodique avec des contraintes de réseau et de charge,
conservé après un redémarrage, est tout ce dont `register` a besoin, et JobScheduler
le fait sur chaque version d'Android que Kuito prend en charge. WorkManager ajoute environ 0,4 Mo
et sa propre base de données pour apporter les mêmes fonctionnalités aux niveaux d'API inférieurs à 23 et pour
chaîner du travail, deux choses que Kuito n'utilise pas. Les id de job sont le `hashCode` Java
du nom de la tâche, rendu non négatif.

## Débogage

C'est l'OS qui décide quand les tâches s'exécutent, donc déclenchez-les à la main. Chaque `register` journalise
la commande pour sa tâche.

**Appareil iOS** : mettez l'app en pause dans le débogueur (`lldb`, ou le bouton pause
de Xcode) et lancez :

```text
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"sync"]
```

Reprenez, et le gestionnaire de lancement se déclenche ; `_simulateExpirationForTaskWithIdentifier:`
l'expire. La tâche doit d'abord être enregistrée : iOS ne simule qu'un lancement pour lequel il
a une requête.

**Simulateur iOS** : il n'a pas de BGTaskScheduler. `submit` y échoue et la
commande du débogueur ne trouve aucune requête, donc `register` conserve l'enregistrement,
journalise ceci au lieu d'échouer, et chaque tâche déclarée écoute une notification
Darwin :

```sh
xcrun simctl spawn booted notifyutil -p dev.kuito.backgroundTasks.run.sync
```

L'exécution suit le même chemin qu'un lancement : le runtime UI si l'un
écoute, sinon un runtime headless. Le simulateur suspend une app un instant
après qu'elle a quitté l'écran, et une notification postée à ce moment est livrée quand
elle revient. Pour essayer le chemin headless, démarrez le binaire de l'app sans scène,
comme iOS le lance pour une tâche, puis postez la notification :

```sh
xcrun simctl terminate booted <bundle id>
DATA=$(xcrun simctl get_app_container booted <bundle id> data)
SIMCTL_CHILD_HOME=$DATA SIMCTL_CHILD_CFFIXED_USER_HOME=$DATA \
  xcrun simctl spawn booted "$(xcrun simctl get_app_container booted <bundle id>)/KuitoIOS" &
```

Les deux variables lui donnent les données propres de l'app, de sorte que `storage` est celui de l'app.

**Android** :

```sh
adb shell cmd jobscheduler run -f <applicationId> <job id>
```

`-f` l'exécute même quand ses contraintes ne sont pas satisfaites. Pour vérifier le cas où
l'app ne tourne pas, mettez-la en arrière-plan et tuez seulement le processus
(`adb shell am kill <applicationId>`) ; `am force-stop` arrête l'app, et
Android n'exécute aucun job pour une app arrêtée. `adb shell dumpsys jobscheduler`
liste les jobs de l'app.

Sur les deux plateformes, l'exécution journalise son résultat (`Background task 'sync'
succeeded`) dans le journal de l'appareil : Console.app ou `xcrun simctl spawn booted log
stream` sur iOS, le tag logcat `Kuito` sur Android, où va aussi la sortie `console`
d'un runtime headless.
