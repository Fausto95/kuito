package dev.kuito.runtime.devtools

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/** The dev server connection's state, shown in the devtools. */
sealed class ConnectionState {
    data object Connecting : ConnectionState()
    data object Connected : ConnectionState()

    /** Lost, or never reached; the next attempt starts after [delayMs]. */
    data class Retrying(val delayMs: Long, val reason: String) : ConnectionState()
}

/**
 * A WebSocket to the dev server that stays up: OkHttp pings detect a dead
 * link, and it reconnects with backoff whenever the connection drops or the
 * server is not up yet. Callbacks run on the main thread.
 */
class KuitoDevSocket(
    private val client: OkHttpClient,
    private val url: String,
    private val onState: (ConnectionState) -> Unit,
    private val onMessage: (JSONObject) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private val retry = Runnable { open() }
    private var socket: WebSocket? = null
    private var attempt = 0
    private var stopped = false

    fun start() {
        stopped = false
        attempt = 0
        onState(ConnectionState.Connecting)
        open()
    }

    fun stop() {
        stopped = true
        main.removeCallbacks(retry)
        socket?.close(1000, "stopped")
        socket = null
    }

    fun send(message: JSONObject) {
        socket?.send(message.toString())
    }

    /** A retry stays [ConnectionState.Retrying] until the link is up, so Connected after it reads as a reconnect. */
    private fun open() {
        val request = try {
            KuitoDevLink.request(url)
        } catch (error: IllegalArgumentException) {
            return dropped(null, "Invalid address: ${error.message}")
        }

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                main.post {
                    if (socket !== webSocket) return@post

                    attempt = 0
                    onState(ConnectionState.Connected)
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                main.post {
                    if (socket !== webSocket) return@post

                    runCatching { JSONObject(text) }.getOrNull()?.let(onMessage)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                // A 401 is not a dead link: the server is up, and wants the session's token.
                val reason = if (response?.code == 401) REFUSED_TOKEN else t.message ?: t.toString()

                main.post { dropped(webSocket, reason) }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                main.post { dropped(webSocket, "Closed ($code)") }
            }
        })
    }

    /** Only the current socket's failure schedules a retry. */
    private fun dropped(webSocket: WebSocket?, reason: String) {
        if (stopped || (webSocket != null && webSocket !== socket)) return

        socket = null

        val delay = minOf(500L shl minOf(attempt, 4), 5000L)

        attempt++
        onState(ConnectionState.Retrying(delay, reason))
        main.postDelayed(retry, delay)
    }
}

/** What the devtools show when the server answers 401: the app holds another session's token. */
const val REFUSED_TOKEN = "The dev server refused this app's token. Relaunch it from kuito dev."
