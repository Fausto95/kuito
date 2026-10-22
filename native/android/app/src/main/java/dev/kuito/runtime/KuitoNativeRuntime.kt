package dev.kuito.runtime

import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import com.facebook.soloader.nativeloader.NativeLoader
import com.facebook.soloader.nativeloader.SystemDelegate
import dev.kuito.runtime.link.KuitoLinker
import dev.kuito.runtime.renderer.KuitoEventRecord
import dev.kuito.runtime.renderer.KuitoMutations
import dev.kuito.runtime.renderer.KuitoOp

/**
 * One Hermes VM, one dedicated serial thread. UIKit/Android Views never run on
 * the JS thread; the native host delivers one ordered batch after each JS job.
 * Every callback runs on the main thread.
 */
class KuitoNativeRuntime(
    /** Applies record i of a batch; UI, UIScript, UIKernel and UIBundle records stay here, for the UI runtime. */
    private val onMutation: (KuitoMutations, Int) -> Unit,
    private val onError: (String) -> Unit = {},
    /** A script passed to [run] threw: (url, message, stack). */
    private val onScriptError: (String, String, String) -> Unit = { _, message, _ -> onError(message) },
    /** console output, or an error thrown by an event, timer or request callback: (level, message, stack). */
    private val onLog: (String, String, String) -> Unit = { _, _, _ -> },
    /** The module functions the app calls, by id (docs/native-modules.md); called on the JS thread. */
    private val linker: KuitoLinker? = null,
    /** A prop the UI thread drives frame by frame (docs/motion.md): record i of its batch. */
    private val onDrivenProp: (KuitoMutations, Int) -> Unit = { _, _ -> },
    /** A frame applied every batch the app had sent. */
    private val onFramesCommitted: () -> Unit = {},
    /** Debug builds: the inspector's handle, making both runtimes debuggable in Chrome DevTools (docs/devtools.md); 0 for none. */
    private val inspector: Long = 0L,
    /** A chunk of the app by name, null when there is none (docs/navigation.md#route-modules). */
    private val chunks: (String) -> ByteArray? = { null },
    /** The UI kernel the shell ships, `ui.hbc`; empty when it has none, which the UI runtime reports. */
    private val uiKernel: () -> ByteArray = { ByteArray(0) },
    /** A release build's UI bundle the shell ships, `app-ui.hbc`; empty when it has none, which the UI runtime reports. */
    private val uiBundle: () -> ByteArray = { ByteArray(0) },
    /** The display's refresh rate in Hz, for the input drain's clock; 0 without a display. */
    refreshRate: () -> Float = { 0f },
) {
    private external fun create(withLink: Boolean, mirror: Long, handoff: Long, inspector: Long): Long
    private external fun createMirror(): Long
    private external fun destroyMirror(mirror: Long)
    private external fun createHandoff(): Long
    private external fun destroyHandoff(handoff: Long)
    private external fun pending(handoff: Long): Boolean
    private external fun clearHandoff(handoff: Long)
    private external fun frameGauge(handoff: Long, mirror: Long): String
    private external fun expectInput(handoff: Long, event: String): Long
    private external fun inputDone(handoff: Long, job: Long)
    private external fun awaitInput(handoff: Long, job: Long): Boolean
    private external fun uiCreate(mirror: Long, handoff: Long, inspector: Long): Long
    private external fun uiInspect(handle: Long)
    private external fun inspect(handle: Long)
    private external fun uiLoad(handle: Long, bytecode: ByteArray, hash: String)
    private external fun uiEvaluate(handle: Long, source: String, url: String)
    private external fun uiLoadBundle(handle: Long, bytecode: ByteArray, hash: String, url: String)
    private external fun uiReceive(handle: Long, index: Int)
    private external fun uiEvent(
        handle: Long, view: Int, event: String,
        layout: Int, numbers: DoubleArray, count: Int, strings: Array<String>?, json: String?,
    ): Boolean
    private external fun uiPlatform(handle: Long, member: Int, value: Any?)
    private external fun uiDestroy(handle: Long)
    private external fun uiDrain(handle: Long, now: Double, budget: Double)
    private external fun evaluate(handle: Long, script: ByteArray, url: String)
    private external fun dispatch(
        handle: Long, view: Int, event: String,
        layout: Int, numbers: DoubleArray, count: Int, strings: Array<String>?, json: String?,
    )
    private external fun destroy(handle: Long)
    private external fun fireTimer(handle: Long, id: Int)
    private external fun httpHead(handle: Long, id: Int, status: Int, url: String, headers: Array<String>)
    private external fun httpChunk(handle: Long, id: Int, chunk: ByteArray)
    private external fun httpEnd(handle: Long, id: Int, body: ByteArray, error: String)
    private external fun httpProgress(handle: Long, id: Int, bytes: Double, total: Double)
    private external fun socketOpen(handle: Long, id: Int, protocol: String)
    private external fun socketMessage(handle: Long, id: Int, binary: Boolean, data: ByteArray)
    private external fun socketError(handle: Long, id: Int, message: String)
    private external fun socketClose(handle: Long, id: Int, code: Int, reason: String, clean: Boolean)
    private external fun settleLinkCall(handle: Long, call: Int, result: Any?)
    private external fun emitLinkEvent(handle: Long, member: Int, value: Any?)
    private external fun recordingOf(handle: Long): ByteArray
    private external fun dispatchUIMessage(handle: Long, message: Long)

    private val main = Handler(Looper.getMainLooper())
    private var framePending = false
    private var gaugedAtNanos = 0L
    private val clock = KuitoFrameClock(refreshRate)

    /**
     * The one frame callback (docs/native-scheduling.md): the UI runtime
     * drains the JS thread's batches within the budget, then runs its own
     * frame, and asks again while either has work. Main thread only.
     */
    private fun requestFrame() {
        if (framePending || closed) return
        framePending = true
        Choreographer.getInstance().postFrameCallback { frameTimeNanos ->
            framePending = false
            clock.frame(frameTimeNanos)
            uiHandle()?.let { uiDrain(it, frameTimeNanos / 1_000_000.0, FRAME_BUDGET_MS) }
            if (KuitoCommitStats.logging && !closed && frameTimeNanos - gaugedAtNanos >= 1_000_000_000L) {
                gaugedAtNanos = frameTimeNanos
                Log.i("Kuito", "KuitoCommitFrames " + frameGauge(handoff, mirror))
            }
        }
    }
    /** Whether batches the app sent wait for a frame. Main thread only. */
    val hasPendingFrames get() = !closed && pending(handoff)
    private val jsThread = HandlerThread("KuitoHermes").apply { start() }
    private val js = Handler(jsThread.looper)
    private val timers = mutableMapOf<Int, Runnable>()
    private val http = KuitoHttpClient(object : KuitoHttpClient.Sink {
        override fun head(id: Int, status: Int, url: String, headers: Array<String>) =
            onRuntime { httpHead(it, id, status, url, headers) }

        override fun chunk(id: Int, data: ByteArray) = onRuntime { httpChunk(it, id, data) }

        override fun progress(id: Int, bytes: Long, total: Long) =
            onRuntime { httpProgress(it, id, bytes.toDouble(), total.toDouble()) }

        override fun end(id: Int, body: ByteArray, error: String) = onRuntime { httpEnd(it, id, body, error) }
    })
    private val sockets = KuitoWebSocketClient(object : KuitoWebSocketClient.Sink {
        override fun open(id: Int, protocol: String) = onRuntime { socketOpen(it, id, protocol) }

        override fun message(id: Int, binary: Boolean, data: ByteArray) =
            onRuntime { socketMessage(it, id, binary, data) }

        override fun error(id: Int, message: String) = onRuntime { socketError(it, id, message) }

        override fun close(id: Int, code: Int, reason: String, clean: Boolean) =
            onRuntime { socketClose(it, id, code, reason, clean) }
    })
    private var handle: Long = 0
    @Volatile private var closed = false
    /** Motion values as the UI thread last saw them; shared by both runtimes. */
    private val mirror = createMirror()
    /** The JS thread's batches on their way to a frame; shared by both runtimes. */
    private val handoff = createHandoff()
    /** The UI runtime: main thread only, created by the first `ui-script`. */
    private var ui: Long = 0

    init {
        linker?.attachEmitter { member, value ->
            js.post { if (!closed && handle != 0L) safely { emitLinkEvent(handle, member, value) } }
        }
        // A motion value goes straight to the UI runtime, on the main thread.
        linker?.attachMotionWriter { member, value ->
            val write = Runnable { uiHandle()?.let { safely { uiPlatform(it, member, value) } } }

            if (Looper.myLooper() == Looper.getMainLooper()) write.run() else main.post(write)
        }
        js.post {
            safely { handle = create(linker != null, mirror, handoff, inspector) }
        }
    }

    /** Development builds: every batch this runtime committed so far, as a `.krec` file; [done] runs on the main thread. */
    fun recording(done: (recording: ByteArray?, error: String?) -> Unit) {
        js.post {
            if (closed) return@post
            val answer = try {
                recordingOf(handle) to null
            } catch (error: Exception) {
                null to (error.message ?: "Recording failed")
            }

            main.post { if (!closed) done(answer.first, answer.second) }
        }
    }

    /** One record of a batch; UI, UIScript, UIKernel and UIBundle records feed the UI runtime in order. */
    private fun apply(batch: KuitoMutations, index: Int) {
        when (batch.ops[index]) {
            KuitoOp.UI -> uiHandle()?.let { uiReceive(it, index) }
            KuitoOp.UI_KERNEL -> uiHandle()?.let { uiLoad(it, uiKernel(), batch.text(index)) }
            KuitoOp.UI_SCRIPT -> uiHandle()?.let { uiEvaluate(it, batch.text(index), batch.name(index)) }
            KuitoOp.UI_BUNDLE -> uiHandle()?.let { uiLoadBundle(it, uiBundle(), batch.text(index), batch.name(index)) }
            else -> onMutation(batch, index)
        }
    }

    private fun uiHandle(): Long? {
        if (closed) return null
        if (ui == 0L) ui = uiCreate(mirror, handoff, inspector)
        return ui.takeIf { it != 0L }
    }

    @Suppress("unused")
    private fun onUIProps(
        ops: IntArray, kinds: IntArray, keys: IntArray, ids: IntArray, parents: IntArray, ints: IntArray,
        numbers: DoubleArray, texts: Array<String?>, names: Array<String?>,
        edits: Array<IntArray?>, editKeys: Array<Array<String>?>,
        recordNumbers: Array<DoubleArray?>, recordStrings: Array<Array<String>?>,
        @Suppress("UNUSED_PARAMETER") hostCalls: Int, @Suppress("UNUSED_PARAMETER") sentAt: Double,
    ) {
        val props = KuitoMutations(
            ops, kinds, keys, ids, parents, ints, numbers, texts, names, edits, editKeys, recordNumbers, recordStrings,
        )

        for (index in 0 until props.size) onDrivenProp(props, index)
    }

    /** The UI runtime has batches to drain or a frame to run. */
    @Suppress("unused")
    private fun onUIRequestFrame() = requestFrame()

    /** A drain left no batch waiting. */
    @Suppress("unused")
    private fun onUIFramesCommitted() = onFramesCommitted()

    /** The UI thread caught up with the batches it was behind on: re-plans that waited run. */
    @Suppress("unused")
    private fun onHostIdle() {
        js.post { if (!closed && handle != 0L) safely { dispatch(handle, 0, "host.idle", NO_PAYLOAD) } }
    }

    /** An attached debugger queued work for the JS runtime; called from any thread. */
    @Suppress("unused")
    private fun onInspectorWake() {
        js.post { if (!closed && handle != 0L) safely { inspect(handle) } }
    }

    /** As [onInspectorWake], for the UI runtime. */
    @Suppress("unused")
    private fun onUIInspectorWake() {
        main.post { if (!closed && ui != 0L) uiInspect(ui) }
    }

    /**
     * A call or signal write from UI-thread code: the app's `ui` event, for
     * the JS thread. [message] is the address of its plain data, which
     * dispatchUIMessage frees; with no runtime left it only frees it.
     */
    @Suppress("unused")
    private fun onUIEvent(message: Long) {
        // dispatchUIMessage owns the message: with handle 0 it only frees it. A
        // JS looper that has quit runs nothing it is given, so free it here.
        if (!js.post { safely { dispatchUIMessage(if (closed) 0L else handle, message) } }) dispatchUIMessage(0L, message)
    }

    private fun dispatch(handle: Long, view: Int, event: String, record: KuitoEventRecord) =
        dispatch(handle, view, event, record.layout, record.numbers, record.count, record.stringArray(), record.json)

    private fun safely(block: () -> Unit) {
        try { block() }
        catch (error: Exception) {
            val message = error.message ?: error.javaClass.simpleName
            main.post { if (!closed) onError(message) }
        }
    }

    /** On the JS thread: the first batch of an idle handoff wants a frame. */
    @Suppress("unused")
    private fun onFrameWanted() {
        main.post { requestFrame() }
    }

    // One JNI upcall per JS job, inside the frame that applies it: the batch's
    // typed records as parallel arrays (KuitoMutations), not a string per
    // field or a Java call per property.
    @Suppress("unused")
    private fun onNativeBatch(
        ops: IntArray, kinds: IntArray, keys: IntArray, ids: IntArray, parents: IntArray, ints: IntArray,
        numbers: DoubleArray, texts: Array<String?>, names: Array<String?>,
        edits: Array<IntArray?>, editKeys: Array<Array<String>?>,
        recordNumbers: Array<DoubleArray?>, recordStrings: Array<Array<String>?>, hostCalls: Int, sentAt: Double,
    ) {
        val batch = KuitoMutations(
            ops, kinds, keys, ids, parents, ints, numbers, texts, names, edits, editKeys, recordNumbers, recordStrings,
        )

        traced({ "Kuito commit ${batch.size}" }) {
            KuitoCommitStats.commit(sentAt.toLong(), batch.size, hostCalls) {
                for (index in 0 until batch.size) apply(batch, index)
            }
        }
    }

    @Suppress("unused")
    private fun onNativeLog(level: String, message: String, stack: String) {
        main.post { if (!closed) onLog(level, message, stack) }
    }

    /** A chunk of the app the kernel required for the first time, or null when the app has none. On the JS thread. */
    @Suppress("unused")
    private fun onNativeLoadChunk(name: String): ByteArray? = chunks(name)

    // Link upcalls run on the JS thread; the linker answers with a value or a failure, never a throw.
    @Suppress("unused")
    private fun onLinkCall(id: Int, arguments: Array<Any?>): Any? = checkNotNull(linker).call(id, arguments)

    // The UI runtime's upcall, on the main thread: a main-thread function it calls directly.
    @Suppress("unused")
    private fun onLinkCallOnMain(id: Int, arguments: Array<Any?>): Any? = checkNotNull(linker).callOnMain(id, arguments)

    // Both runtimes' upcall, on their thread: the C++ converts a member's values by its signature.
    @Suppress("unused")
    private fun onLinkSignature(id: Int): String? = linker?.signature(id)

    @Suppress("unused")
    private fun onLinkObserve(id: Int, observing: Boolean) = checkNotNull(linker).observe(id, observing)

    @Suppress("unused")
    private fun onLinkCallAsync(id: Int, call: Int, arguments: Array<Any?>) {
        checkNotNull(linker).callAsync(id, arguments) { result ->
            js.post { if (!closed && handle != 0L) safely { settleLinkCall(handle, call, result) } }
        }
    }

    @Suppress("unused")
    private fun onNativeTimerSchedule(id: Int, ms: Double) {
        check(Looper.myLooper() == jsThread.looper) { "Timer scheduling must be on Hermes thread" }
        val callback = Runnable {
            timers.remove(id)
            if (!closed && handle != 0L) safely { traced("Kuito timer") { fireTimer(handle, id) } }
        }
        timers[id] = callback
        js.postDelayed(callback, ms.coerceIn(0.0, 2_147_000_000.0).toLong())
    }

    @Suppress("unused")
    private fun onNativeTimerCancel(id: Int) {
        timers.remove(id)?.let(js::removeCallbacks)
    }

    @Suppress("unused")
    private fun onNativeHttpStart(
        id: Int,
        url: String,
        method: String,
        headers: Array<String>,
        body: ByteArray,
        bodyFile: String,
        suffix: ByteArray,
        saveTo: String,
        progress: Int,
    ) = http.start(
        id, url, method, headers, body,
        KuitoHttpClient.Files(KuitoHttpClient.file(bodyFile), suffix, KuitoHttpClient.file(saveTo), progress),
    )

    @Suppress("unused")
    private fun onNativeHttpStream(id: Int) = http.stream(id)

    @Suppress("unused")
    private fun onNativeHttpCancel(id: Int) = http.cancel(id)

    @Suppress("unused")
    private fun onNativeSocketOpen(id: Int, url: String, protocols: Array<String>) = sockets.open(id, url, protocols)

    @Suppress("unused")
    private fun onNativeSocketSend(id: Int, binary: Boolean, data: ByteArray) = sockets.send(id, binary, data)

    @Suppress("unused")
    private fun onNativeSocketClose(id: Int, code: Int, reason: String) = sockets.close(id, code, reason)

    /** Runs [work] on the JS thread with the runtime's handle, while it has one. */
    private fun onRuntime(work: (Long) -> Unit) {
        js.post { if (!closed && handle != 0L) safely { work(handle) } }
    }

    /** Runs a script: UTF-8 source, or Hermes bytecode compiled for this Hermes; [done] gets the error a script threw, or null, on the main thread. */
    fun run(script: ByteArray, url: String = "kuito://app", done: (error: String?) -> Unit = {}) {
        check(!closed) { "Kuito runtime closed" }
        js.post {
            if (!closed) safely {
                val failure = try {
                    traced("Kuito evaluate") { evaluate(handle, script, url) }
                    null
                } catch (error: KuitoScriptError) {
                    main.post { if (!closed) onScriptError(url, error.message.orEmpty(), error.stack) }
                    error.message.orEmpty()
                }

                main.post { if (!closed) done(failure) }
            }
        }
    }

    /**
     * A native event: a UI-thread handler runs it before the frame, or the JS
     * thread does. For a press or a change this thread waits a few
     * milliseconds for that job, and a job that ends in time has its batch
     * applied now, in the frame the touch landed in (docs/native-scheduling.md#input).
     * True when the UI thread's kernel took it: what it changed is applied already.
     */
    internal fun event(id: Int, event: String, record: KuitoEventRecord): Boolean {
        if (closed) return false
        if (ui != 0L && uiEvent(ui, id, event, record.layout, record.numbers, record.count, record.stringArray(), record.json)) return true

        // The emitter reuses its record once this returns, before the JS thread runs.
        val own = record.copy()
        val job = if (Looper.myLooper() == Looper.getMainLooper()) expectInput(handoff, event) else 0L

        js.post {
            if (!closed && handle != 0L) safely { traced("Kuito dispatch") { dispatch(handle, id, event, own) } }
            if (job != 0L) inputDone(handoff, job)
        }

        if (job != 0L && awaitInput(handoff, job))
            uiHandle()?.let { uiDrain(it, clock.latest(System.nanoTime()), FRAME_BUDGET_MS) }

        return false
    }

    fun close() {
        if (closed) return
        closed = true
        main.post {
            clearHandoff(handoff)
            if (ui != 0L) { uiDestroy(ui); ui = 0L }
        }
        js.post {
            for (timer in timers.values) js.removeCallbacks(timer)
            timers.clear()
            http.close()
            sockets.close()
            linker?.invalidate()
            if (handle != 0L) { destroy(handle); handle = 0L }
            // Each runtime holds its own reference to the mirror; this drops the shell's,
            // on the main thread so no UI runtime can be created from it afterwards.
            main.post {
                destroyMirror(mirror)
                destroyHandoff(handoff)
            }
            jsThread.quitSafely()
        }
    }

    companion object {
        /** The UI thread's share of a display frame for the JS thread's batches: at least one runs whatever it costs. */
        private const val FRAME_BUDGET_MS = 4.0

        /** An event without a payload; never written. */
        private val NO_PAYLOAD = KuitoEventRecord()

        init {
            // Hermes's Android Intl (toLocaleString, Intl.DateTimeFormat, ...) is
            // Java behind fbjni, whose classes load their libraries through
            // NativeLoader. Uninitialized, the first Intl call fails inside
            // Hermes, where no catch reaches it, and the process aborts.
            NativeLoader.initIfUninitialized(SystemDelegate())
            System.loadLibrary("kuito_mobile")
        }
    }
}
