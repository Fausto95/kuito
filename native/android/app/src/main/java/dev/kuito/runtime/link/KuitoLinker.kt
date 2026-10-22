package dev.kuito.runtime.link

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoThread
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * A runtime's linked modules: each made on the first call that needs it,
 * from whichever thread that call runs on, and a serial background thread
 * per module, made on its first background call.
 */
class KuitoLinkContext(private val context: Context, private val activity: Activity?) {
    private val instances = mutableMapOf<String, KuitoLinkedModule>()
    private val executors = mutableMapOf<String, ExecutorService>()

    // A module's constructor may call a module it requires: the monitor is reentrant.
    @Synchronized
    fun <M : KuitoLinkedModule> module(name: String, make: (KuitoModuleContext) -> M): M {
        @Suppress("UNCHECKED_CAST")
        instances[name]?.let { return it as M }

        return make(KuitoModuleContext(name, context.applicationContext, activity)).also { instances[name] = it }
    }

    @Synchronized
    fun background(module: String): ExecutorService =
        executors.getOrPut(module) { Executors.newSingleThreadExecutor { Thread(it, "KuitoModule-$module") } }

    /** Gives back every module made, on [main], and stops the background threads. */
    @Synchronized
    fun shutdown(main: Handler) {
        val made = instances.values.toList()

        instances.clear()
        main.post { made.forEach { it.destroy() } }
        executors.values.forEach { it.shutdown() }
        executors.clear()
    }
}

/**
 * The link table as the JS thread calls it: functions by id from the
 * generated `KuitoLink.function`, each run on its thread. Calls arrive on
 * the JS thread, so the table of found functions needs no lock.
 */
class KuitoLinker(
    context: Context,
    /** Null in a background task's runtime. */
    activity: Activity?,
    private val table: (Int) -> KuitoFunction?,
    private val observers: (Int) -> KuitoObserver?,
) {
    private val link = KuitoLinkContext(context, activity)
    private val main = Handler(Looper.getMainLooper())
    private val found = mutableMapOf<Int, KuitoFunction>()
    private val observing = mutableMapOf<Int, KuitoObserver>()
    @Volatile private var emitter: ((Int, Any?) -> Unit)? = null
    @Volatile private var motionWriter: ((Int, Any?) -> Unit)? = null

    /** Before any other member. The emitter may be called from any thread. */
    fun attachEmitter(emit: (member: Int, value: Any?) -> Unit) {
        emitter = emit
    }

    /** Before observing. A motion value's change, for the UI runtime; called from any thread, before the emitter. */
    fun attachMotionWriter(write: (member: Int, value: Any?) -> Unit) {
        motionWriter = write
    }

    /** Starts or stops an event or a live value sending what it observes, on the main thread. */
    fun observe(id: Int, active: Boolean) {
        val observer = observing[id] ?: observers(id) ?: return

        if (active) {
            observing[id] = observer
            main.post {
                observer.start(link) { value ->
                    val crossing = KuitoCrossing.result(value)

                    if (observer.motion) motionWriter?.invoke(id, crossing)
                    emitter?.invoke(id, crossing)
                }
            }
        } else if (observing.remove(id) != null) {
            main.post { observer.stop(link) }
        }
    }

    /** A member's signature, null for one this shell does not link. Any thread: the generated tables are pure. */
    fun signature(id: Int): String? = table(id)?.signature ?: observers(id)?.signature

    /** Runs a `js` function and returns its result, or a [KuitoLinkFailure]. */
    fun call(id: Int, arguments: Array<Any?>): Any? {
        var result: Any? = null
        var settled = false

        return try {
            val function = function(id)

            if (function.thread != KuitoThread.JS)
                throw KuitoModuleError(KuitoErrorCode.THREAD, "${function.name} is asynchronous")

            function.run(link, values(function, arguments), KuitoReply { result = it; settled = true })

            if (settled) result else KuitoLinkFailure(KuitoErrorCode.NATIVE, "${function.name} returned without a result")
        } catch (error: Exception) {
            KuitoLinkFailure.of(error)
        }
    }

    /** UI thread, for UI-thread code: runs a `main` function that answers at once and returns its result, or a [KuitoLinkFailure]. */
    fun callOnMain(id: Int, arguments: Array<Any?>): Any? {
        var result: Any? = null
        var settled = false

        return try {
            // Not the JS thread's cache: this runs on the UI thread.
            val function = table(id)
                ?.takeIf { it.thread == KuitoThread.MAIN }
                ?: throw KuitoModuleError(KuitoErrorCode.THREAD, "Function $id does not run on the main thread")

            function.run(link, values(function, arguments), KuitoReply { result = it; settled = true })

            if (settled) result else KuitoLinkFailure(KuitoErrorCode.THREAD, "${function.name} answers later: call it from the JS thread")
        } catch (error: Exception) {
            KuitoLinkFailure.of(error)
        }
    }

    /** Starts a `main` or `background` function; [settle] may run on any thread, once. */
    fun callAsync(id: Int, arguments: Array<Any?>, settle: (Any?) -> Unit) {
        val reply = KuitoReply(settle)

        try {
            val function = function(id)
            val values = values(function, arguments)
            val run = Runnable {
                try {
                    function.run(link, values, reply)
                } catch (error: Exception) {
                    reply.reject(error)
                }
            }

            when (function.thread) {
                KuitoThread.JS -> run.run()
                KuitoThread.MAIN -> main.post(run)
                KuitoThread.BACKGROUND -> link.background(function.module).execute(run)
            }
        } catch (error: Exception) {
            reply.reject(error)
        }
    }

    /** The runtime is shutting down: stop what is observed and the background threads. */
    fun invalidate() {
        for (observer in observing.values) main.post { observer.stop(link) }
        observing.clear()
        emitter = null
        link.shutdown(main)
    }

    private fun function(id: Int): KuitoFunction = found.getOrPut(id) {
        table(id) ?: throw KuitoModuleError(
            KuitoErrorCode.FUNCTION_NOT_FOUND,
            "Function $id is not linked into this Android shell, which has the functions the app calls: rebuild it (docs/native-modules.md).",
        )
    }

    /** One value per parameter; a missing trailing argument is null. */
    private fun values(function: KuitoFunction, arguments: Array<Any?>): List<KuitoArgument> {
        if (arguments.size > function.arity)
            throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "${function.name} takes ${function.arity} arguments, not ${arguments.size}")

        return (0 until function.arity).map { index ->
            KuitoArgument(arguments.getOrNull(index), "${function.name} argument ${index + 1}")
        }
    }
}
