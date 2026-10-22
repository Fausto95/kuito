package dev.kuito.runtime.modules.location

import android.location.Location
import android.location.LocationListener
import android.os.Bundle

/**
 * A `LocationListener` for every API level: before Android 11 the provider
 * callbacks have no default, and a listener without them crashes when the
 * user turns a provider off.
 */
class KuitoLocationListener(private val onFix: (Location) -> Unit) : LocationListener {
    override fun onLocationChanged(location: Location) = onFix(location)

    override fun onProviderEnabled(provider: String) {}

    override fun onProviderDisabled(provider: String) {}

    @Deprecated("Called only before Android 10")
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
}
