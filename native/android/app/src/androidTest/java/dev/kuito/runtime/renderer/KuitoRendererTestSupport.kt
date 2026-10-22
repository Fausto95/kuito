package dev.kuito.runtime.renderer

// Tests name props as app code does; the renderer takes them keyed, as a
// host batch's records carry them.

fun KuitoAndroidRenderer.setProperty(id: Int, name: String, typed: KuitoValue) =
    setProperty(id, kuitoKey(name), name, typed)

fun KuitoAndroidRenderer.setDrivenProperty(id: Int, name: String, value: KuitoValue) =
    setDrivenProperty(id, kuitoKey(name), name, value)

/** The prop's key on the wire, or the named-prop key for a module view's own. */
fun kuitoKey(name: String): Int =
    KuitoProps.byKey.indexOf(name).takeIf { it >= 0 } ?: KuitoMutations.NAMED_PROP

/** An event as tests read it: its name, then its payload's numbers and strings, or its JSON. */
internal fun KuitoEventRecord.describe(event: String): String =
    (listOf(event) + (json?.let(::listOf) ?: (numbers.take(count).map(Double::toString) + strings))).joinToString(" ")
