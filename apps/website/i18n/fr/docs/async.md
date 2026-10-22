# Runtime asynchrone de Kuito — expérimental

Kuito a des actions et ressources asynchrones **à portée de composant**. Elles
sont implémentées dans le noyau Hermes en JavaScript pur et testées dans la VM
isolée de Node. Les timers, `fetch` et le reste de la bibliothèque standard sur
lesquels elles s'appuient sont listés dans [web-apis.md](web-apis.md), avec ce
que chacun ne fait pas.

`async`/`await` fonctionne dans le code de l'app sur les deux plateformes. Les
bundles d'app ciblent ES2022, que Hermes V1 compile tel quel, les fonctions
async restent donc natives. Hermes V1 rejette les générateurs asynchrones
(`async function*`, et `for await` sur l'un d'eux) ; le compilateur de bytecode
les signale au build, et un Live Patch qui en utilise un échoue à s'évaluer
sur l'appareil.

## API publique

```tsx
import { task, resource, VStack, Text, Button } from 'kuito';

function Example() {
  const query = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api', { signal });
    return response.json();
  });

  const save = task(
    async ({ signal }) => {
      await saveChanges({ signal });
    },
    { policy: 'drop' },
  );

  return (
    <VStack>
      <Text>{query.running.value ? 'Loading...' : String(query.data.value ?? '')}</Text>
      <Button
        onPress={() => {
          void save.run().catch(() => {});
        }}
      >
        Save
      </Button>
    </VStack>
  );
}
```

## Exécution et cycle de vie

- `task()` ne démarre que lorsque sa méthode `run(...args)` est appelée, et
  renvoie normalement une Promise rejetée en cas d'échec. L'appelant gère les
  rejets.
- `resource()` démarre après un commit de patch réussi et expose `refresh()`.
  Les échecs d'une ressource remplissent `error.value` plutôt que de provoquer
  un rejet non géré depuis le chargement automatique.
- Les deux exposent des signaux persistants `running`, `data` et `error`, et
  `cancel()`. Politiques de task : `replace` (annule la précédente, le dernier
  résultat l'emporte) et `drop` (réutilise la Promise en cours).
- Lors d'un Fast Refresh compatible, les anciens enregistrements asynchrones
  sont invalidés/abandonnés, tandis que les objets signal restent stables. Les
  continuations obsolètes ne peuvent pas commiter de résultats. Sur les patchs
  rejetés, l'ancien travail reste actif. La libération du composant annule le
  travail.
- L'abandon est coopératif. Les opérations non abandonnables peuvent se
  terminer, mais leurs résultats obsolètes ne mettent jamais à jour l'état
  asynchrone de Kuito. Le signal est l'`AbortSignal` propre au noyau
  ([web-apis.md](web-apis.md#abortcontroller)), le passer à `fetch` annule
  donc la requête.
- Une task ou une ressource garde son emplacement par nom, comme chaque hook
  (`docs/reactivity.md`) : ajouter, retirer ou réordonner des hooks autour
  d'elle conserve ses signaux, et la retirer la libère.

## Intégration des Promises dans l'hôte

Le runtime Hermes mobile partagé appelle désormais `drainMicrotasks()` après
l'évaluation du source et la distribution des événements. C'est un point de
contrôle pour les jobs de Promise ; il ne fournit **pas** de boucle
d'événements. Les callbacks natifs externes doivent rentrer dans le thread de
la VM propriétaire et vider à nouveau les jobs.

Les callbacks de timer, HTTP et de module rentrent dans le thread de la VM
comme des jobs à part entière, chacun suivi d'un point de contrôle des
microtâches.

Les liaisons réactives d'UI actuelles observent les dépendances capturées lors
de leur évaluation initiale. Les dépendances de signal qui dépendent d'une
branche nécessitent encore un re-suivi dynamique.

## Prochains jalons natifs

1. Ajouter des workers natifs indépendants, la mise en cache des ressources et des mesures de performance sur appareil.
