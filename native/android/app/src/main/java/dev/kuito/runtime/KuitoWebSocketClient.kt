package dev.kuito.runtime

import java.util.concurrent.ConcurrentHashMap
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

/**
 * The WebSocket host on Android (native/shared/Socket.h): OkHttp web sockets.
 * The sink gets open, messages, at most one error and exactly one close per
 * socket, in order, from OkHttp's reader thread.
 */
internal class KuitoWebSocketClient(private val sink: Sink) {
    interface Sink {
        fun open(id: Int, protocol: String)
        fun message(id: Int, binary: Boolean, data: ByteArray)
        fun error(id: Int, message: String)
        fun close(id: Int, code: Int, reason: String, clean: Boolean)
    }

    private val client = OkHttpClient()
    private val sockets = ConcurrentHashMap<Int, WebSocket>()

    fun open(id: Int, url: String, protocols: Array<String>) {
        val request = Request.Builder().url(url)
        if (protocols.isNotEmpty()) request.header("Sec-WebSocket-Protocol", protocols.joinToString(", "))
        sockets[id] = client.newWebSocket(request.build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) =
                sink.open(id, response.header("Sec-WebSocket-Protocol") ?: "")

            override fun onMessage(webSocket: WebSocket, text: String) =
                sink.message(id, false, text.toByteArray(Charsets.UTF_8))

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) = sink.message(id, true, bytes.toByteArray())

            // The server started the close: answer it, as the protocol asks.
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (sockets.remove(id) != null) sink.close(id, code, reason, true)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (sockets.remove(id) == null) return
                sink.error(id, t.message ?: "The connection closed abnormally")
                sink.close(id, ABNORMAL_CLOSURE, "", false)
            }
        })
    }

    fun send(id: Int, binary: Boolean, data: ByteArray) {
        val socket = sockets[id] ?: return
        if (binary) socket.send(data.toByteString()) else socket.send(String(data, Charsets.UTF_8))
    }

    fun close(id: Int, code: Int, reason: String) {
        sockets[id]?.close(code, reason)
    }

    fun close() {
        for (socket in sockets.values) socket.cancel()
        sockets.clear()
        client.dispatcher.executorService.shutdown()
    }

    private companion object {
        const val ABNORMAL_CLOSURE = 1006
    }
}
