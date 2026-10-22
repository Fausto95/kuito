package dev.kuito.runtime.modules.location

import android.location.LocationManager
import android.location.LocationManager.GPS_PROVIDER
import android.location.LocationManager.NETWORK_PROVIDER
import dev.kuito.link.LocationAccuracy
import dev.kuito.runtime.modules.KuitoModuleError

/**
 * Each accuracy's providers, in order of preference.
 *
 * The platform's `fused` provider is left out: asked through
 * `requestLocationUpdates`, it registers a balanced-power request, which
 * Google's fused service answers from network location alone, so without
 * Wi-Fi or cell data it never delivers.
 */
private val PROVIDERS = mapOf(
    LocationAccuracy.LOWEST to listOf(NETWORK_PROVIDER, GPS_PROVIDER),
    LocationAccuracy.LOW to listOf(NETWORK_PROVIDER, GPS_PROVIDER),
    LocationAccuracy.BALANCED to listOf(NETWORK_PROVIDER, GPS_PROVIDER),
    LocationAccuracy.HIGH to listOf(GPS_PROVIDER, NETWORK_PROVIDER),
    LocationAccuracy.HIGHEST to listOf(GPS_PROVIDER, NETWORK_PROVIDER),
    LocationAccuracy.BEST_FOR_NAVIGATION to listOf(GPS_PROVIDER, NETWORK_PROVIDER),
)

/** What a watch asks: the first provider this device has on. */
fun LocationAccuracy.watching(manager: LocationManager): List<String> = enabled(manager).take(1)

/**
 * What a single fix asks: the providers on, in order, up to GPS; the
 * first fix wins. The network provider can be on with nothing to report
 * (no Wi-Fi, no cell data), and a GPS fix is fine enough for any request.
 */
fun LocationAccuracy.once(manager: LocationManager): List<String> = enabled(manager).let { on ->
    on.take(on.indexOf(GPS_PROVIDER).let { if (it < 0) on.size else it + 1 })
}

private fun LocationAccuracy.enabled(manager: LocationManager) =
    manager.getProviders(true).let { on -> PROVIDERS.getValue(this).filter(on::contains) }

/** The accuracy a stored location task names. */
fun locationAccuracy(wire: String) = LocationAccuracy.values().firstOrNull { it.wire == wire }
    ?: throw KuitoModuleError("ERR_ARGUMENT", "expected ${LocationAccuracy.values().joinToString(" or ") { "\"${it.wire}\"" }}, got $wire")
