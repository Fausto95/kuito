package dev.kuito.runtime.modules.network

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import dev.kuito.link.NetworkSpec
import dev.kuito.link.NetworkState
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Network` in native/modules/network/network.ts. */
class KuitoNetworkModule(private val context: KuitoModuleContext) : NetworkSpec {
    // ConnectivityManager is a binder proxy and safe on any thread.
    private val connectivity by lazy { context.activity.getSystemService(ConnectivityManager::class.java) }
    private val main = Handler(Looper.getMainLooper())
    // Touched only on the main thread: start, stop and the callback run there.
    private var callback: ConnectivityManager.NetworkCallback? = null

    override fun state() = read()

    override fun refresh() = read()

    // The default network is the one the app's traffic uses. Its callback
    // reports the current network on registration, then every switch and
    // capability change (VALIDATED included); onLost means no network at all.
    // Data classes compare by value, so only changes are sent.
    override fun startState(signal: KuitoSignal<NetworkState>) {
        var last: NetworkState? = null
        val changed = { state: NetworkState ->
            if (state != last) {
                last = state
                signal.set(state)
            }
        }
        val watching = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) =
                changed(KuitoNetworkState.of(capabilities, context.activity))

            override fun onLost(network: Network) = changed(KuitoNetworkState.none)
        }

        callback = watching
        connectivity.registerDefaultNetworkCallback(watching, main)
    }

    override fun stopState() {
        callback?.let(connectivity::unregisterNetworkCallback)
        callback = null
    }

    private fun read() =
        KuitoNetworkState.of(connectivity.activeNetwork?.let(connectivity::getNetworkCapabilities), context.activity)
}
