# Cycle de vie des composants et événements natifs logiques

## API expérimentales actuelles

- `onMount(callback)` s'exécute après un commit de vue hôte réussi ; une fonction retournée est nettoyée à la disposition de l'instance ; un rafraîchissement compatible conserve la même instance montée.
- `onCleanup(callback)` enregistre un nettoyage sans s'exécuter au montage.
- `watch(source, observer, {immediate?})` observe la valeur de signal sélectionnée, en sautant la notification initiale par défaut. Les dépendances sont re-suivies à mesure que la source change. Un watch compare les valeurs pendant la durée de vie de son instance : quand l'instance se ré-exécute (nouvelles props, une branche re-planifiée), une valeur sélectionnée qui diffère de la dernière vue notifie l'observateur.
- `effect(callback)` suit les lectures synchrones de signaux et s'exécute après le montage ; le nettoyage retourné s'exécute avant la ré-exécution et pendant le démontage.
- `ref()` retourne un handle de vue stable pour les identifiants de vues natives ; les handles fournissent parent/enfants logiques, `setProperty`, les commandes hôte `focus`/`blur`, et des écouteurs à la manière d'EventTarget.
- La pression native est livrée à travers les phases de capture, de cible et de remontée ; `dispatchEvent` accepte des objets personnalisés en forme d'événement. Le dispatch hôte natif reste une preuve de concept, pas une implémentation conforme au W3C.

## Limitations

- Le Fast Refresh recrée actuellement l'arbre de descripteurs des composants. Les portées de cycle de vie des composants inchangés sont conservées lors d'un rafraîchissement compatible ; les effets modifiés sont remplacés, et les handles stables survivent tant que les identités des vues sont conservées.
- `focus` et `blur` nécessitent une véritable implémentation de commande native à la plateforme et lèvent une erreur descriptive en son absence.
- `setProperty` écrit impérativement ; des commits de signaux ultérieurs peuvent écraser cette valeur.
- L'annulation d'événement s'applique au graphe d'événements logique de Kuito ; elle n'arrête pas automatiquement une action de l'OS UIKit/Android déjà émise.
- Les callbacks de nettoyage ne sont pas transactionnels pour l'instant : une exception pendant un nettoyage après un commit hôte ne peut pas annuler les mutations de vues natives.
- Le typage des arguments d'événement et les écouteurs passifs, la sémantique d'accessibilité, les portails composés et la disposition des portées de cycle de vie imbriquées sont incomplets.
