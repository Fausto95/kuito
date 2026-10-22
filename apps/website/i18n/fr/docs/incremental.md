# Rafraîchissement incrémental au niveau du composant

Le compilateur de développement de Kuito attribue des identifiants stables `modulePath#functionName` et
des empreintes de source aux fonctions de composant nommées. Le runtime conserve un
cache de descripteurs par instance, indexé par identifiant de module et chemin logique du composant.

L'empreinte d'un composant couvre son propre code et chaque instruction de premier niveau
de son module qu'il lit, directement ou via d'autres instructions de premier niveau : modifier
une constante ou un helper ré-exécute les composants qui le lisent, et seulement ceux-là. Les lectures
sont résolues par liaison, si bien qu'un nom que le composant déclare lui-même n'est pas une lecture
de l'instruction du module portant ce nom. Un composant qu'un autre ne fait que rendre en
JSX (`<Card />`) n'est pas lu : sa propre empreinte couvre ses modifications.

Une empreinte hache l'arbre syntaxique, pas le texte : positions, commentaires,
parenthèses, styles de guillemets et indentation JSX ne comptent pas. Une modification qui ne fait que
reformater ou commenter du code ne ré-exécute aucun composant et n'envoie aucune prop. Les expressions
JSX sont indexées de la même manière, tout comme les fonctions du thread d'UI
(`docs/motion.md`).

Lors d'un rafraîchissement de source, les composants inchangés dont l'identité des props est inchangée réutilisent leur
arbre de descripteurs précédent, ce qui évite de ré-exécuter du code arbitraire dans ces
composants. Les composants enfants imbriqués sont résolus via un registre de définitions
neuf, si bien que modifier un enfant peut le mettre à jour même quand son parent reste en cache.

Une instance de composant est sa place dans l'arbre, sa définition de composant et
sa `key`, les trois dans son chemin : `<parent path>.<place>.c<definition>:<key>`.
Une `key` compte partout où se trouve un élément, dans une liste ou comme enfant unique. Ainsi une
place qui rend un autre composant, ou le même avec une autre key, contient
une nouvelle instance avec un chemin propre, dont les vues reçoivent de nouvelles étiquettes et sont remontées,
et l'instance qui part libère son état (`docs/control-flow.md`). Une vue
avec une prop `id` est l'exception : son étiquette est l'id, si bien qu'elle reste la même
vue native où qu'elle soit rendue, tant que son type et son parent le restent.

Toute re-planification, un rafraîchissement ou un basculement de `Show`, n'envoie à une vue native que les props
qui ont changé : les scalaires sont comparés avec `Object.is`, et les props objet (`style`,
`gestures`, dégradés) par le JSON sous lequel elles ont franchi la frontière hôte la dernière fois,
puisque le planificateur les reconstruit à chaque parcours. Un basculement de `Show` ne planifie que sa
branche (`docs/control-flow.md`).

Les emplacements d'état, l'identité des vues natives, les refs et les enregistrements `onMount` à durée de vie d'instance
sont conservés tant que dure le chemin d'une instance. Au sein d'une
instance, chaque hook garde son emplacement par nom, pas par ordre d'appel
(`docs/reactivity.md`) : ajouter, réordonner ou appeler conditionnellement des hooks conserve
l'état des autres.
Les portées d'effect/watch et le travail asynchrone sont disposés et remplacés quand leur
composant propriétaire s'exécute à nouveau ; les portées des composants inchangés restent intactes. Un hook qu'un
patch supprime est disposé, et les composants supprimés libèrent les portées d'état, asynchrones
et de cycle de vie de tous leurs hooks.

**Limitations restantes :** Il s'agit d'une mémoïsation par composant pendant le HMR, pas
d'un bundler de source incrémental : Rolldown régénère toujours un bundle JS. Un
composant dont la source a changé ré-exécute sa fonction, si bien que les expressions hors
des liaisons mises en cache à grain fin peuvent être réévaluées. Une valeur importée d'un autre fichier n'est couverte que par
son instruction `import`, si bien qu'un composant qui lit une constante modifiée dans un
autre fichier reste en cache jusqu'à ce que son propre module change. La comparaison des props est un
`Object.is` superficiel ; des objets mutables peuvent compromettre la justesse. Les composants
nouvellement composés sans identité stable du compilateur se replient sur la ré-exécution.
Les enfants conditionnels sans key stable peuvent changer d'identité lors d'un réordonnancement.
Les mutations hôte ne sont pas réversibles de manière transactionnelle, et les effets s'exécutent sur le
thread VM/UI courant. Évitez les effets de bord dans le corps des fonctions de composant.
