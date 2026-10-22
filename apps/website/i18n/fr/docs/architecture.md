# Architecture decision record 0001 — Découpler les backends d'exécution

Statut : **accepté**

## Décision

1. Kuito possède l'abaissement du TSX, les métadonnées de liaison, les identités stables des composants, le cycle de vie des vues natives et les règles de compatibilité des Live Patches.
2. **Développement :** un runtime Hermes persistant à l'intérieur de chaque shell natif exécute l'application et reçoit les Live Patches sous forme de source ([l'historique](history.md) contient les modèles de l'étape 0 qui ont précédé).
3. **AOT de production :** Static Hermes est un backend mesuré séparément. Là où le sous-ensemble typé du langage est pris en charge, préserver la syntaxe des types sur le chemin vers `shermes -parse-ts` ; ne pas exécuter d'abord une transformation Oxc inconditionnelle de suppression du TS.
4. **Dépendances :** Rolldown résout et empaquette des packages npm non modifiés ; Oxc est la base des transformations TSX/réactives propres à Kuito. Le JavaScript npm ordinaire non typé doit toujours être pris en charge.
5. Définir les API hôte et l'IR de mutation d'UI indépendamment de Hermes afin de pouvoir remplacer un backend sans reconcevoir le rendu.

## Contrats prévus (pas encore implémentés)

- `Host.createView(kind, id, props)` / `Host.setProperty(id, name, value)` / `Host.disposeView(id)`
- `Host.attachEvent(viewId, eventName, handlerId)` — identifiant stable, recherche dynamique dans la table de gestionnaires courante
- `Live.applyModule(moduleId, bytecode)` — valider, préparer, échanger, disposer les anciens abonnements, sinon rejeter et conserver l'ancien module
- `State.get(moduleId, stateId)` — identité stable sous des patches compatibles
- `Compiler.emitBindings(tsx)` — enregistrer des abonnements par propriété cible, pas des re-rendus de composants entiers

## Propriété et sécurité

- Un hôte natif ne doit pas conserver de pointeurs bruts vers des closures JS d'un patch à l'autre. Stocker des identifiants de gestionnaire, les résoudre à l'invocation.
- L'identité de l'état ne doit pas dépendre des numéros de ligne de la source ni de l'ordre d'appel. L'emplacement de chaque hook est indexé par son instance de composant et le nom que le compilateur lui donne ([réactivité](reactivity.md)).
- La préparation d'un patch doit être contrainte en effets de bord. Les écritures natives ne sont pas automatiquement réversibles ; les échanges transactionnels nécessitent une politique de staging/réconciliation.
- La compatibilité de l'ABI Hermes et de la version du bytecode doit être épinglée à une révision exacte de la toolchain.
- Sur iOS, le rafraîchissement de développement peut charger du bytecode interprété, mais les changements de code AOT natif nécessitent une reconstruction ; ce n'est pas un mécanisme OTA natif sans restriction.

## Questions ouvertes

- Quelles API de chargement d'unités/modules de bytecode sont disponibles pour la révision Hermes **choisie** dans un hôte persistant ?
- L'ancien et le nouveau code peuvent-ils coexister pendant la préparation d'un patch, et quand une disposition sûre est-elle possible ?
- Comment les imports/exports de modules, les singletons au niveau du package et les références natives sont-ils représentés d'un patch à l'autre ?
- Le code Kuito typé et les packages npm empaquetés non typés peuvent-ils coexister sous AOT natif avec une parité observable ?
- L'abaissement du compilateur et l'empaquetage préservent-ils les annotations qui donnent sa valeur à l'AOT typé ?

## Sources

- https://github.com/facebook/hermes/blob/static_h/doc/TypedLanguage.md
- https://github.com/facebook/hermes/blob/static_h/doc/BuildingAndRunning.md
- https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-11-02-hermes-compilation-runtime-modes.md
- https://rolldown.rs/apis/plugin-api
