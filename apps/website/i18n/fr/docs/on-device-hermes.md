# Tranche verticale Hermes sur l'appareil (expérimental)

Il s'agit d'un **prototype d'implémentation**, pas d'une version mobile validée.

## Objectif

Exécuter le bootstrap de Kuito, la réactivité de l'UI, les gestionnaires d'événements et le code source de l'application **à l'intérieur de chaque processus natif mobile** au lieu d'exécuter le JS sur l'ordinateur de bureau et de refléter les événements d'UI par WebSocket.

- Le `native/shared/KuitoRuntime.{h,cpp}` partagé embarque un `facebook::hermes::HermesRuntime` persistant et met en attente des mutations de vue typées dans une file C++. Après chaque entrée dans la VM, il vide un lot, en dédupliquant les écritures de propriété répétées sans réordonner la création/suppression des vues.
- Sur Android, `KuitoJNI.cpp` et `KuitoNativeRuntime.kt` détiennent Hermes sur un `HandlerThread`, livrent un lot sous forme de tableau JNI par tâche de VM, et appliquent les mutations à `KuitoAndroidRenderer` sur le Looper principal. Le build natif Gradle consomme le prefab Hermes V1 de `com.facebook.hermes:hermes-android` et construit `libjsi.so` à partir de l'`API/jsi` de Hermes au tag de la même release (`native/android/app/src/main/cpp/jsi`, dont le `jsi/jsi/VERSION` nomme le commit), l'ABI contre laquelle `libhermesvm.so` est lié. Aucune bibliothèque React Native n'est empaquetée.
  - Une exception Kotlin pendant un appel hôte (une requête, un timer, un module natif, un log) est effacée avant tout nouvel appel JNI et devient une erreur JavaScript nommant l'appel et l'exception Java (`JavaException.h`), si bien qu'elle atteint le `catch` de l'application ou la LogBox au lieu d'interrompre le processus.
  - L'`Intl` Android de Hermes (`toLocaleString`, `Intl.DateTimeFormat`, ...) est du Java derrière fbjni, qui charge ses bibliothèques via le `NativeLoader` de SoLoader. `KuitoNativeRuntime` l'initialise avant le démarrage de Hermes : une exception dans le code `Intl` propre à Hermes n'atteint jamais le catch de Kuito et interrompt le processus.
- Sur iOS, `KuitoHermesBridge.mm` et `KuitoHermesBridge.h` détiennent Hermes sur une file de dispatch série, mettent en tampon les mutations de vue et envoient chaque lot ordonné à `KuitoUIKitRenderer` sur la file de dispatch principale. Un package Swift local lie la même release Hermes V1, précompilée (`src/cli/hermes-ios.ts`).
- `src/dev/device-server.ts` ne livre **que des patches de code source JavaScript** par un WebSocket limité à localhost. Toute la logique applicative et le dispatch des boutons s'exécutent dans la VM de l'appareil.

## Utilisation

Installez les dépendances Node et les SDK natifs. Sur macOS, ayez Xcode et XcodeGen. Sur Android, JDK 21, Android SDK/NDK, CMake, Gradle 8, l'émulateur. `kuito doctor` les vérifie.

```sh
kuito doctor
kuito dev android
# macOS only:
kuito dev ios
```

`kuito build android` construit le shell Android avec les assets JS générés du bootstrap et de l'application. `kuito dev --no-launch` n'exécute que la compilation des patches de source.

Pour construire sans lancer :

```sh
kuito build ios              # or android: the bundled JS and the shells, in .kuito/ (apps.md)
```

`native/ios` et `native/android` se construisent encore seuls, mais sans le
JS empaqueté, qui appartient à l'application en cours de construction.

`KUITO_DEV_URL` (iOS) et l'extra d'intent `kuito_dev_url` (Android) sélectionnent le transport de patches localhost, l'émulateur Android utilisant `10.0.2.2` et un Android physique `adb reverse`.

## JavaScript ou bytecode Hermes

Hermes n'exécute que le bytecode compilé par sa propre release. Les deux plateformes lient la même release Hermes V1, épinglée une seule fois dans `native/hermes.json` (version, commit du tag, intégrité du compilateur, somme de contrôle iOS), que la CLI, Gradle et la CI lisent. `test/hermesc.test.ts` échoue quand un consommateur répète l'épinglage ou que le JSI vendorisé est d'un autre commit.

- **Les deux plateformes** démarrent à partir de bytecode : `bootstrap.hbc` (le kernel `src/runtime` empaqueté) et `app.hbc`, compilés une fois par le `hermesc` de cette release (`src/cli/hermesc.ts`). Le compilateur est livré dans le package npm `hermes-compiler`, si bien que la CLI télécharge une fois l'archive épinglée dans `~/.cache/kuito`, vérifie son hash d'intégrité et conserve `hermesc`. Le bytecode épargne à l'appareil l'analyse et la compilation d'environ 270 Ko de script au démarrage à froid (`docs/performance.md`).
- **Les Live Patches** atteignent les deux sous forme de source.

Les shells embarquent ces assets dans les builds de debug pour un démarrage hors ligne, avec `app.js` à côté d'eux uniquement pour reconnaître la rediffusion du même build par le serveur de dev. La reconnexion du socket de patches rediffuse le dernier patch de source ; le runtime persistant conserve l'état et les vues compatibles. Les exceptions de compilation de script ou d'exécution sont signalées à l'UI de l'appareil ; un commit dont les appels hôte lèvent une exception est abandonné dans son ensemble.

## Portes de vérification et critères d'abandon

1. **Gradle/NDK :** Android doit compiler/lier le pont JSI contre Hermes et s'installer sur un émulateur. En cas d'échec : corriger les cibles prefab CMake ou la stratégie d'empaquetage/liaison avant d'ajouter des fonctionnalités.
2. **Xcode/SwiftPM :** iOS doit compiler/lier le pont Objective-C++ et démarrer sur un simulateur. En cas d'échec : résoudre les en-têtes du framework épinglé, le package Hermes et la génération du projet ; aucune affirmation sur le runtime tant que ce n'est pas passé.
3. **Fonctionnement sur l'appareil :** Avec le serveur de dev arrêté, un lancement hors ligne affiche `Count: 0`, les appuis mettent à jour le libellé localement, et l'UI locale reste réactive.
4. **Live Patch :** Deux versions de source conservent le compteur, le remplacement du gestionnaire, l'identité des vues sur chaque appareil. Une erreur de syntaxe conserve la dernière UI fonctionnelle. Mesurer la latence médiane/p95.
5. **Isolation :** Les profils de release mobile doivent rejeter le transport de patches et les réglages développeur non sécurisés. Ces shells de debug NE DOIVENT PAS être distribués comme applications de production.

## Limitations connues

- Le code source actuel déplace Hermes sur des files de travail série dédiées, si bien qu'un JavaScript coûteux ne monopolise pas le thread d'UI natif ([ordonnancement natif](native-scheduling.md)). Les mutations hôte sont mises en tampon et livrées de manière asynchrone ; l'UI native et le JS peuvent temporairement observer des états différents.
- Les sources JSI vendorisées d'Android doivent évoluer avec `native/hermes.json` : montez les deux ensemble, sinon `libhermesvm.so` et `libjsi.so` ne s'accordent pas sur l'ABI JSI.
- Le transport de patches vers l'appareil est non authentifié, **loopback uniquement**, et strictement réservé au développement de confiance ; il n'existe aucun mécanisme OTA de production.
- Pas d'AOT de production, de tests de préservation du focus, de remontages structurels déterministes, de benchmarks par plateforme, ni de validation sur appareil physique.
