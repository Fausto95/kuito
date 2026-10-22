plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
// An app's kuito.config.ts reaches the shell as these properties (src/cli/shells.ts);
// without them this builds the framework's own shell.
fun kuitoProperty(name: String, default: String) =
    providers.gradleProperty(name).getOrElse(default)

// The native modules the app includes (src/cli/modules.ts): their sources and
// generated link table, and their Gradle dependencies.
fun kuitoList(name: String, separator: String) =
    kuitoProperty(name, "").split(separator).filter { it.isNotBlank() }

// The Hermes V1 release both platforms link and compile bytecode for (src/cli/hermesc.ts).
val hermesVersion = (groovy.json.JsonSlurper().parse(file("../../hermes.json")) as Map<*, *>)["version"]
    ?: throw GradleException("native/hermes.json names no Hermes version")

android {
    namespace = "dev.kuito.runtime"
    compileSdk = 35
    defaultConfig {
        applicationId = kuitoProperty("kuito.applicationId", "dev.kuito.shell")
        manifestPlaceholders["appName"] = kuitoProperty("kuito.appName", "Kuito")
        // Enables the bare activity renderer tests present dialogs in (AndroidManifest.xml).
        manifestPlaceholders["rendererTests"] = kuitoProperty("kuito.rendererTests", "false")
        // The launcher icon generated with the app's resources, or the system default.
        manifestPlaceholders["appIcon"] = providers.gradleProperty("kuito.res")
            .map { "@mipmap/ic_launcher" }.getOrElse("@android:drawable/sym_def_app_icon")
        minSdk = kuitoProperty("kuito.minSdk", "26").toInt()
        targetSdk = 35
        versionCode = kuitoProperty("kuito.versionCode", "1").toInt()
        versionName = kuitoProperty("kuito.versionName", "1.0.0")
        // Renderer tests on a device (src/androidTest): views need the JNI layout engine.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    // The app's upload key (docs/cli.md#signing): its keystore and alias from the
    // CLI, its passwords from the environment, so they never reach a command line.
    providers.gradleProperty("kuito.signing.keystore").orNull?.let { keystore ->
        signingConfigs.create("upload") {
            storeFile = file(keystore)
            keyAlias = kuitoProperty("kuito.signing.keyAlias", "")
            storePassword = providers.environmentVariable("KUITO_ANDROID_KEYSTORE_PASSWORD").orNull
            keyPassword = providers.environmentVariable("KUITO_ANDROID_KEY_PASSWORD").orNull
        }
    }
    // Only the development shell loads over plain http, for the dev server and
    // what an app under development fetches. Release shells shrink with R8 in
    // full mode: what no link table entry reaches, a module's unused functions
    // or whole module, is removed. Each build type compiles its own activity
    // (src/debug, src/release): the dev server, devtools and LogBox are debug's.
    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // BuildConfig.DEBUG tells module code which build type it runs in, as the
    // WebView module's remote debugging does.
    buildFeatures {
        prefab = true
        buildConfig = true
    }
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            providers.gradleProperty("kuito.buildDir").orNull?.let {
                buildStagingDirectory = file("$it/cxx")
            }
        }
    }
    // Updates the CLI signed, which the shell's update tests verify (test/fixtures/updates).
    sourceSets["androidTest"].assets.srcDir("../../../test/fixtures/updates")
    // Recordings the cost replay applies (docs/devtools.md#cost-replay).
    sourceSets["androidTest"].assets.srcDir("../../../test/fixtures/recordings/android")
    // Reel's images those recordings show, under the names the compiler bundles
    // them as (src/cli/bundled-images.ts): the renderer tests' shell has no app's.
    if (kuitoProperty("kuito.rendererTests", "false") == "true") sourceSets["debug"].res.srcDir("src/rendererTests/res")
    // The bundled kernel and app JS (assets/kuito/) belong to the app being built.
    sourceSets["main"].assets.setSrcDirs(listOf(kuitoProperty("kuito.assets", "src/main/assets")))
    // The permissions the app and its native modules declare (docs/permissions.md,
    // docs/native-modules.md) merge over the main manifest;
    // build-type manifests are the ones Gradle merges, so each build type takes it.
    providers.gradleProperty("kuito.manifest").orNull?.let { manifest ->
        buildTypes.all { sourceSets.maybeCreate(name).manifest.srcFile(manifest) }
    }
    providers.gradleProperty("kuito.res").orNull?.let { sourceSets["main"].res.srcDir(it) }
    // The app's AppTheme (src/cli/app-settings.ts), replacing res/values/themes.xml's:
    // build-type resources override main's, where a second main directory would clash.
    providers.gradleProperty("kuito.settingsRes").orNull?.let { res ->
        buildTypes.all { sourceSets.maybeCreate(name).res.srcDir(res) }
    }
    kuitoList("kuito.sources", File.pathSeparator).forEach { sourceSets["main"].java.srcDir(it) }
    // Resources the modules' manifest entries name, like a FileProvider's paths.
    kuitoList("kuito.moduleRes", File.pathSeparator).forEach { sourceSets["main"].res.srcDir(it) }
    // The images the app imports (docs/assets.md), under the names the compiler gave them.
    providers.gradleProperty("kuito.imagesRes").orNull?.let { sourceSets["main"].res.srcDir(it) }
    // The splash theme the app's activity starts in, and its drawables (docs/splash.md).
    providers.gradleProperty("kuito.splashRes").orNull?.let { sourceSets["main"].res.srcDir(it) }
    defaultConfig {
        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++17"
                // libhermesvm.so links libc++_shared; mixing in the static STL is rejected (CXX1212).
                arguments += "-DANDROID_STL=c++_shared"
                // The frame path's C++ at the build type's level (src/main/cpp/CMakeLists.txt).
                if (providers.gradleProperty("kuito.nativeDebug").orNull == "true") {
                    arguments += "-DKUITO_NATIVE_DEBUG=ON"
                }
            }
        }
    }
}
dependencies {
    kuitoList("kuito.dependencies", ",").forEach { implementation(it) }
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Physics springs for spring() props and CSS spring() transitions.
    implementation("androidx.dynamicanimation:dynamicanimation:1.0.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    // FlatList's native list.
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("com.google.android.material:material:1.12.0")
    // Hermes prefab; brings fbjni, which libhermesvm.so links. libhermesvm.so also
    // links libjsi.so, which CMake builds from JSI sources of the same release.
    implementation("com.facebook.hermes:hermes-android:$hermesVersion")
    // fbjni's own loader, already in the app at runtime: KuitoNativeRuntime
    // initializes it before Hermes's Intl reaches fbjni. Keep it at fbjni's version.
    implementation("com.facebook.soloader:nativeloader:0.10.5")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
