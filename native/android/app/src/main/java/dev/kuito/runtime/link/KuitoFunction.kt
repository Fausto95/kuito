package dev.kuito.runtime.link

import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoThread
import java.util.concurrent.atomic.AtomicReference

/** A module the link table makes: one instance per runtime, created on the first call that needs it. Each spec's generated `<Name>Spec` extends it. */
interface KuitoLinkedModule {
    /**
     * Runs on the main thread when the runtime shuts down (a reload, or the
     * activity closing), after its observers stop: give back what the module
     * holds outside the runtime, as the keep-screen-on flag.
     */
    fun destroy() {}
}

/**
 * One function of the link table, which the CLI generates from the specs
 * (docs/native-modules.md): its name for errors, where it runs, how many
 * arguments it takes, the signature the C++ converts its values by
 * (src/cli/link-signature.ts), and the call, which settles `reply` once.
 */
class KuitoFunction(
    val name: String,
    val thread: KuitoThread,
    val arity: Int,
    val signature: String,
    val run: (link: KuitoLinkContext, args: List<KuitoArgument>, reply: KuitoReply) -> Unit,
) {
    /** The module the function belongs to: `Battery` for `Battery.level`. */
    val module: String get() = name.substringBefore('.')
}

/**
 * An event, a live value or a motion value of the link table: its
 * signature, `()T` with T what it sends, how it starts sending what it
 * observes, on the main thread, and how it stops. What a [motion] value
 * sends is written into the UI runtime too.
 */
class KuitoObserver(
    val name: String,
    val signature: String,
    val start: (link: KuitoLinkContext, emit: (Any?) -> Unit) -> Unit,
    val stop: (link: KuitoLinkContext) -> Unit,
    val motion: Boolean = false,
)

/** Sends an event's payloads to JavaScript, from any thread, from `start<Name>` until `stop<Name>`. */
class KuitoEmitter<T>(private val emit: (Any?) -> Unit, private val encode: (T) -> Any?) {
    fun send(payload: T) = emit(encode(payload))
}

fun KuitoEmitter<Unit>.send() = send(Unit)

/** Sets a live value's signal in JavaScript, from any thread, from `start<Name>` until `stop<Name>`. */
class KuitoSignal<T>(private val emit: (Any?) -> Unit, private val encode: (T) -> Any?) {
    fun set(value: T) = emit(encode(value))
}

/**
 * Sets a motion value, from `start<Name>` until `stop<Name>`: the UI runtime
 * applies it on the main thread, so views bound to it move without
 * JavaScript, which hears of it after.
 */
class KuitoMotion<T>(private val emit: (Any?) -> Unit, private val encode: (T) -> Any?) {
    fun set(value: T) = emit(encode(value))
}

/** Settles a call with its result as plain data, once and from any thread; later settlements are ignored. */
class KuitoReply(settle: (result: Any?) -> Unit) {
    private val settle = AtomicReference(settle)

    fun resolve(value: Any?) = finish(KuitoCrossing.result(value))

    fun reject(error: Throwable) = finish(KuitoLinkFailure.of(error))

    private fun finish(result: Any?) {
        settle.getAndSet(null)?.invoke(result)
    }
}

/**
 * The result of a callback function, such as a permission prompt: settle it
 * once, from any thread; later calls are ignored. A promise never settled
 * leaves JavaScript waiting.
 */
class KuitoPromise<T>(private val reply: KuitoReply, private val encode: (T) -> Any?) {
    fun resolve(value: T) = reply.resolve(encode(value))

    fun reject(error: Throwable) = reply.reject(error)

    fun reject(code: String, message: String) = reply.reject(KuitoModuleError(code, message))
}

fun KuitoPromise<Unit>.resolve() = resolve(Unit)

/** A spec's string enum: the value that crosses for each constant. Generated for each. */
interface KuitoEnum {
    val wire: String
}

/**
 * A spec's record, generated for each: as JSON data, for a module to keep or
 * send as `Json`, and as its fields in declared order, to cross back.
 */
interface KuitoEncodable {
    fun kuitoEncoded(): Map<String, Any?>

    fun kuitoFields(): List<Any?>
}

/** String-keyed entries as they cross, a record's or JSON data's: keys and values side by side. */
class KuitoEntries(@JvmField val keys: Array<String>, @JvmField val values: Array<Any?>)

/** A call that failed: its error's code and message. */
class KuitoLinkFailure(@JvmField val code: String, @JvmField val message: String) {
    companion object {
        /** A [KuitoModuleError] keeps its code; any other is `ERR_NATIVE`. */
        fun of(error: Throwable): KuitoLinkFailure {
            val coded = error as? KuitoModuleError

            return KuitoLinkFailure(coded?.code ?: KuitoErrorCode.NATIVE, coded?.message ?: error.message ?: error.javaClass.simpleName)
        }
    }
}
