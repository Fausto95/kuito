package dev.kuito.runtime.devtools

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.provider.Settings
import android.net.Uri
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * The device side of `kuito dev`'s debugger proxy (docs/devtools.md): a
 * socket of its own, off the main thread, so a runtime paused at a
 * breakpoint, even the UI thread's, still hears DevTools. The runtimes attach
 * to [handle]; it outlives reloads and reconnects. Debug builds only.
 */
class KuitoInspector(private val client: OkHttpClient, context: Context) {
    val handle: Long = nativeCreate()
    private val thread = HandlerThread("KuitoInspector").apply { start() }
    /** Connection state lives on this thread; frames go straight to native. */
    private val worker = Handler(thread.looper)
    private val retry = Runnable { open() }
    @Volatile private var socket: WebSocket? = null
    private var url: String? = null
    private var attempt = 0
    private var stopped = false
    private val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "android"
    private val deviceName = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) ?: Build.MODEL
    private val app = context.packageName

    /** Connects to the dev server at [server] (the Live Patch URL); again to move to another. */
    fun connect(server: String) {
        val address = Uri.parse(server).buildUpon()
            .path("/inspector/device")
            .clearQuery()
            .appendQueryParameter("device", deviceId)
            .appendQueryParameter("name", deviceName)
            .appendQueryParameter("app", app)
            .build()
            .toString()

        worker.post {
            url = address
            stopped = false
            attempt = 0
            open()
        }
    }

    fun stop() {
        worker.post {
            stopped = true
            worker.removeCallbacks(retry)
            socket?.close(1000, "stopped")
            socket = null
            nativeClosed(handle)
            // Runtimes still closing keep the device; only this handle goes.
            nativeDestroy(handle)
            thread.quitSafely()
        }
    }

    @Suppress("unused") // Called from native, on any thread.
    private fun onFrame(frame: ByteArray) {
        socket?.send(frame.decodeToString())
    }

    private fun open() {
        worker.removeCallbacks(retry)
        socket?.cancel()

        val request = try {
            KuitoDevLink.request(url ?: return)
        } catch (error: IllegalArgumentException) {
            return
        }

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                worker.post {
                    if (socket !== webSocket) return@post
                    attempt = 0
                    nativeOpened(handle)
                }
            }

            // OkHttp reads each socket on one thread, so frames arrive in order.
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (socket === webSocket) nativeReceive(handle, text.encodeToByteArray())
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                worker.post { dropped(webSocket) }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                worker.post { dropped(webSocket) }
            }
        })
    }

    /** Only the current socket's failure schedules a retry: 0.5 s, doubling up to 5 s, as the dev link does. */
    private fun dropped(webSocket: WebSocket) {
        if (stopped || webSocket !== socket) return

        socket = null
        nativeClosed(handle)
        worker.postDelayed(retry, minOf(500L shl minOf(attempt, 4), 5000L))
        attempt++
    }

    private external fun nativeCreate(): Long
    private external fun nativeReceive(handle: Long, frame: ByteArray)
    private external fun nativeOpened(handle: Long)
    private external fun nativeClosed(handle: Long)
    private external fun nativeDestroy(handle: Long)
}
