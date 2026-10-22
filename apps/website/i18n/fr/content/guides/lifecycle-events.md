# Événements de cycle de vie

Les hooks de cycle de vie exécutent du code autour du commit de vue hôte d'un composant, et les handles de vue exposent les vues natives et leurs événements logiques. Ces API sont expérimentales.

## Hooks de cycle de vie

- `onMount(callback)` s'exécute après un commit de vue hôte réussi ; une fonction retournée est nettoyée à la disposition de l'instance. Un rafraîchissement compatible conserve la même instance montée.
- `onCleanup(callback)` enregistre un nettoyage sans s'exécuter au montage.
- `effect(callback)` suit les lectures synchrones de signaux et s'exécute après le montage ; le nettoyage retourné s'exécute avant la ré-exécution et pendant le démontage.

## Observer une valeur

`watch(source, observer, { immediate? })` observe la valeur de signal sélectionnée, en sautant la notification initiale par défaut. Les dépendances sont re-suivies à mesure que la source change. Un watch compare les valeurs pendant la durée de vie de son instance : quand l'instance se ré-exécute (nouvelles props, une branche re-planifiée), une valeur sélectionnée qui diffère de la dernière qu'il a vue notifie l'observateur.

## Handles de vue et événements natifs

`ref()` retourne un handle de vue stable pour les identifiants de vues natives. Les handles fournissent parent/enfants logiques, `setProperty`, les commandes hôte `focus`/`blur`, et des écouteurs à la manière d'EventTarget.

L'appui natif est livré à travers les phases de capture, de cible et de remontée ; `dispatchEvent` accepte des objets personnalisés en forme d'événement. Le dispatch hôte natif est une preuve de concept, pas une implémentation conforme au W3C.

## Limitations

- Le Fast Refresh recrée l'arbre de descripteurs des composants. Les portées de cycle de vie inchangées sont conservées lors d'un rafraîchissement compatible ; les effets modifiés sont remplacés, et les handles stables survivent tant que les identités des vues sont conservées.
- `focus` et `blur` nécessitent une véritable implémentation de commande native à la plateforme et lèvent une erreur descriptive en son absence.
- `setProperty` écrit impérativement ; des commits de signaux ultérieurs peuvent écraser cette valeur.
- L'annulation d'événement s'applique au graphe d'événements logique de Kuito ; elle n'arrête pas une action de l'OS UIKit/Android déjà émise.
- Les callbacks de nettoyage ne sont pas transactionnels : une exception pendant un nettoyage après un commit hôte ne peut pas annuler les mutations de vues natives.
- Le typage des arguments d'événement et les écouteurs passifs, la sémantique d'accessibilité, les portails composés et la disposition des portées de cycle de vie imbriquées sont incomplets.

## En profondeur

[Cycle de vie des composants et événements natifs logiques](../../../../docs/lifecycle-events.md) couvre les mêmes API et limitations dans leur forme d'origine.
