package dev.kuito.runtime.link

import dev.kuito.runtime.modules.KuitoErrorCode
import java.nio.Buffer
import java.nio.ByteBuffer

/**
 * Plain data as it crosses the host boundary (JavaLink.h reads it): null,
 * Double, Boolean, String, a direct ByteBuffer, `Array<Any?>` for a list or a struct's fields and
 * [KuitoEntries] for a map; anything else fails with `ERR_ENCODE`.
 */
internal object KuitoCrossing {
    fun result(value: Any?): Any? = if (value is KuitoLinkFailure) value else try {
        crossing(value)
    } catch (_: IllegalArgumentException) {
        KuitoLinkFailure(KuitoErrorCode.ENCODE, "the result is not plain data")
    }

    private fun copied(value: ByteBuffer): ByteBuffer =
        ByteBuffer.allocateDirect(value.remaining()).put(value.duplicate()).also { (it as Buffer).flip() }

    private fun crossing(value: Any?): Any? = when (value) {
        null, Unit -> null
        is String, is Boolean -> value
        // Not NaN or infinity: what crosses is plain data, as JSON would hold it.
        is Number -> value.toDouble().also { require(it.isFinite()) }
        // A writable direct buffer's bytes become the ArrayBuffer's, which JavaScript may write; a
        // heap or read-only one (a mapped file's) is copied once.
        is ByteBuffer -> if (value.isDirect && !value.isReadOnly) value else copied(value)
        is List<*> -> Array(value.size) { crossing(value[it]) }
        is Map<*, *> -> KuitoEntries(
            value.keys.map { requireNotNull(it as? String) }.toTypedArray(),
            value.values.map(::crossing).toTypedArray(),
        )
        else -> throw IllegalArgumentException("${value.javaClass.simpleName} is not plain data")
    }
}
