plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}

// `kuito dev` builds an app's shell into that app's .kuito/android (docs/apps.md).
providers.gradleProperty("kuito.buildDir").orNull?.let { dir ->
    allprojects { layout.buildDirectory.set(file("$dir/$name")) }
}
