package dev.kuito.runtime.modules.network

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.NetworkCapabilities
import android.telephony.TelephonyManager
import dev.kuito.link.CellularGeneration
import dev.kuito.link.NetworkDetails
import dev.kuito.link.NetworkState
import dev.kuito.link.NetworkStateType

/** `NetworkState` in native/modules/network/network.ts, read from a network's capabilities. */
internal object KuitoNetworkState {
    val none = state(NetworkStateType.NONE, connected = false, reachable = false, expensive = false, generation = null)

    private val transports = listOf(
        NetworkCapabilities.TRANSPORT_WIFI to NetworkStateType.WIFI,
        NetworkCapabilities.TRANSPORT_CELLULAR to NetworkStateType.CELLULAR,
        NetworkCapabilities.TRANSPORT_ETHERNET to NetworkStateType.ETHERNET,
    )

    private val generations = mapOf(
        TelephonyManager.NETWORK_TYPE_GPRS to CellularGeneration._2G,
        TelephonyManager.NETWORK_TYPE_EDGE to CellularGeneration._2G,
        TelephonyManager.NETWORK_TYPE_CDMA to CellularGeneration._2G,
        TelephonyManager.NETWORK_TYPE_1xRTT to CellularGeneration._2G,
        TelephonyManager.NETWORK_TYPE_IDEN to CellularGeneration._2G,
        TelephonyManager.NETWORK_TYPE_GSM to CellularGeneration._2G,
        TelephonyManager.NETWORK_TYPE_UMTS to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_EVDO_0 to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_EVDO_A to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_EVDO_B to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_HSDPA to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_HSUPA to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_HSPA to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_HSPAP to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_EHRPD to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_TD_SCDMA to CellularGeneration._3G,
        TelephonyManager.NETWORK_TYPE_LTE to CellularGeneration._4G,
        TelephonyManager.NETWORK_TYPE_IWLAN to CellularGeneration._4G,
        TelephonyManager.NETWORK_TYPE_NR to CellularGeneration._5G,
    )

    // VALIDATED is the system's own check that the network reaches the
    // internet (it probes once per network and re-checks on failure), so a
    // captive portal reads as connected but not reachable.
    fun of(capabilities: NetworkCapabilities?, context: Context): NetworkState {
        if (capabilities == null) return none

        val type = transports.firstOrNull { capabilities.hasTransport(it.first) }?.second ?: NetworkStateType.UNKNOWN

        return state(
            type,
            connected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
            reachable = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            expensive = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
            generation = if (type == NetworkStateType.CELLULAR) generation(context) else null,
        )
    }

    // The data network type needs READ_PHONE_STATE, a runtime permission the
    // shell does not ask for; without it the generation is null.
    private fun generation(context: Context): CellularGeneration? {
        if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED)
            return null

        return generations[context.getSystemService(TelephonyManager::class.java).dataNetworkType]
    }

    private fun state(
        type: NetworkStateType, connected: Boolean, reachable: Boolean, expensive: Boolean, generation: CellularGeneration?,
    ) = NetworkState(
        type = type,
        isConnected = connected,
        isInternetReachable = reachable,
        details = NetworkDetails(isExpensive = expensive, cellularGeneration = generation),
    )
}
