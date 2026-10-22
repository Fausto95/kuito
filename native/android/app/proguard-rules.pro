# What native code reaches by name (src/main/cpp): R8 keeps nothing else, so a
# module function no link table entry reaches is removed (docs/native-modules.md).
-keepclasseswithmembernames,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class dev.kuito.runtime.KuitoNativeRuntime { *** on*(...); }
-keepclassmembers class dev.kuito.runtime.renderer.layout.KuitoLayoutNode { *** measureLeaf(...); }
-keepclassmembers class dev.kuito.runtime.renderer.gestures.GestureArbiter { *** on*(...); }
-keepclassmembers class dev.kuito.runtime.devtools.KuitoInspector { *** onFrame(...); }
-keep class dev.kuito.runtime.KuitoScriptError { <init>(java.lang.String, java.lang.String); }
-keep class dev.kuito.runtime.link.KuitoEntries { <init>(...); <fields>; }
-keep class dev.kuito.runtime.link.KuitoLinkFailure { <fields>; }
# fbjni and Hermes (its Intl) find their own Java classes by name from native
# code; a release shell without them crashes as the first native library loads.
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }
