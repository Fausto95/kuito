package dev.kuito.runtime.modules.location

import android.annotation.SuppressLint
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import dev.kuito.link.GeocodedAddress
import dev.kuito.link.GeocodedLocation
import dev.kuito.link.LocationAccuracy
import dev.kuito.link.LocationCoordinates
import dev.kuito.link.LocationHeading
import dev.kuito.link.LocationObject
import dev.kuito.link.LocationRequest
import dev.kuito.link.LocationSpec
import dev.kuito.link.LocationUpdate
import dev.kuito.link.LocationUpdatesRequest
import dev.kuito.link.LocationWatchRequest
import dev.kuito.runtime.link.KuitoEmitter
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.permissions.KuitoPermission
import dev.kuito.runtime.modules.permissions.KuitoPermissions
import java.io.IOException

// Expo's limit: the geocoder's nearest few are what apps show.
private const val MAX_RESULTS = 5

/**
 * `Location` in native/modules/location/location.ts, on the platform
 * `LocationManager` (no Play Services). Providers run only while a request
 * is waiting, a watch is subscribed or a location task is started
 * ([KuitoLocationTasks]), the compass only while `heading` has a listener.
 * Access comes from [KuitoPermissions]: this module never prompts.
 *
 * Every function that touches [watches] or [pending] runs on the main thread.
 */
@SuppressLint("MissingPermission") // Each request is behind granted().
class KuitoLocationModule(private val context: KuitoModuleContext) : LocationSpec {
    private val app get() = context.applicationContext
    private val manager by lazy { app.getSystemService(LocationManager::class.java) }
    private val geocoder by lazy { Geocoder(app) }
    private val watches = mutableMapOf<Int, KuitoLocationListener>()
    private val pending = mutableSetOf<KuitoLocationListener>()
    private var positions: KuitoEmitter<LocationUpdate>? = null
    private var headings: KuitoEmitter<LocationHeading>? = null
    private val compass by lazy { KuitoLocationCompass(app, ::lastKnown) { headings?.send(it) } }

    override fun getCurrentPosition(request: LocationRequest, promise: KuitoPromise<LocationObject>) =
        granted(promise) { locate(request.accuracy, promise) }

    override fun getLastKnownPosition(promise: KuitoPromise<LocationObject?>) =
        granted(promise) { promise.resolve(lastKnown()?.fix()) }

    override fun watchPosition(request: LocationWatchRequest, promise: KuitoPromise<Unit>) =
        granted(promise) { watch(request, promise) }

    override fun clearWatch(id: Double) {
        watches.remove(id.toInt())?.let(manager::removeUpdates)
    }

    override fun hasHeading(): Boolean = compass.available

    override fun geocode(address: String, promise: KuitoPromise<List<GeocodedLocation>>) =
        geocode(promise, Address::position) { found ->
            if (Build.VERSION.SDK_INT >= 33) geocoder.getFromLocationName(address, MAX_RESULTS, listener(found, promise))
            else @Suppress("DEPRECATION") found(geocoder.getFromLocationName(address, MAX_RESULTS).orEmpty())
        }

    override fun reverseGeocode(coordinates: LocationCoordinates, promise: KuitoPromise<List<GeocodedAddress>>) {
        val (latitude, longitude) = coordinates

        geocode(promise, Address::place) { found ->
            if (Build.VERSION.SDK_INT >= 33) geocoder.getFromLocation(latitude, longitude, MAX_RESULTS, listener(found, promise))
            else @Suppress("DEPRECATION") found(geocoder.getFromLocation(latitude, longitude, MAX_RESULTS).orEmpty())
        }
    }

    override fun hasServicesEnabled(): Boolean =
        if (Build.VERSION.SDK_INT >= 28) manager.isLocationEnabled
        else manager.getProviders(true).any { it != LocationManager.PASSIVE_PROVIDER }

    override fun startLocationUpdates(request: LocationUpdatesRequest, promise: KuitoPromise<Unit>) =
        granted(promise) {
            KuitoLocationTasks.start(app, KuitoLocationTasks.Options.of(request))
            promise.resolve()
        }

    override fun stopLocationUpdates(name: String) = KuitoLocationTasks.stop(app, name)

    override fun hasStartedLocationUpdates(name: String): Boolean = KuitoLocationTasks.hasStarted(app, name)

    override fun resumeLocationUpdates(name: String) = KuitoLocationTasks.resume(app, name)

    override fun startPosition(emitter: KuitoEmitter<LocationUpdate>) {
        positions = emitter
    }

    /** The last listener left: no watch outlives it. */
    override fun stopPosition() {
        watches.values.forEach(manager::removeUpdates)
        watches.clear()
        positions = null
    }

    override fun startHeading(emitter: KuitoEmitter<LocationHeading>) {
        headings = emitter
        compass.start()
    }

    override fun stopHeading() {
        compass.stop()
        headings = null
    }

    /** The runtime is shutting down, its watches and compass stopped: no request outlives it. */
    override fun destroy() {
        pending.forEach(manager::removeUpdates)
        pending.clear()
    }

    private fun <T> granted(promise: KuitoPromise<T>, then: () -> Unit) {
        if (KuitoPermissions.granted(app, KuitoPermission.LOCATION)) then()
        else promise.reject("ERR_PERMISSION", "Location access is not granted; ask with Permissions.request('location')")
    }

    private fun providers(asked: List<String>) = asked.ifEmpty {
        throw KuitoModuleError("ERR_SERVICES_DISABLED", "Location services are off on this device")
    }

    /**
     * The first fix any of the accuracy's providers delivers. One listener per
     * provider: registering a listener again replaces its first request.
     */
    private fun locate(accuracy: LocationAccuracy, promise: KuitoPromise<LocationObject>) {
        lateinit var listeners: List<KuitoLocationListener>
        val settle = { location: Location ->
            listeners.forEach(manager::removeUpdates)
            pending.removeAll(listeners)
            promise.resolve(location.fix())
        }

        listeners = providers(accuracy.once(manager)).map { provider ->
            KuitoLocationListener(settle).also {
                manager.requestLocationUpdates(provider, 0L, 0f, it, Looper.getMainLooper())
            }
        }
        pending.addAll(listeners)
    }

    private fun watch(request: LocationWatchRequest, promise: KuitoPromise<Unit>) {
        val id = request.id.toInt()
        val provider = providers(request.accuracy.watching(manager)).first()
        val listener = KuitoLocationListener { location ->
            positions?.send(LocationUpdate(id = request.id, location = location.fix(), error = null))
        }

        watches.remove(id)?.let(manager::removeUpdates)
        manager.requestLocationUpdates(
            provider,
            request.timeInterval.toLong(),
            request.distanceInterval.toFloat(),
            listener,
            Looper.getMainLooper(),
        )
        watches[id] = listener
        promise.resolve()
    }

    /** The newest fix any provider has. */
    private fun lastKnown(): Location? =
        manager.getProviders(true).mapNotNull(manager::getLastKnownLocation).maxByOrNull { it.time }

    /** Runs one geocoder request off the main thread; a device without a geocoder rejects. */
    private fun <T> geocode(
        promise: KuitoPromise<List<T>>,
        shape: (Address) -> T,
        start: (found: (List<Address>) -> Unit) -> Unit,
    ) {
        if (!Geocoder.isPresent())
            return promise.reject("ERR_UNAVAILABLE", "This device has no geocoder (Android's is part of Google's system services)")

        try {
            start { addresses -> promise.resolve(addresses.map(shape)) }
        } catch (error: IOException) {
            // Before Android 13 the geocoder blocks and throws when its service can't be reached.
            promise.reject("ERR_GEOCODE", error.message ?: "The geocoder failed")
        }
    }

    @androidx.annotation.RequiresApi(33)
    private fun listener(found: (List<Address>) -> Unit, promise: KuitoPromise<*>) = object : Geocoder.GeocodeListener {
        override fun onGeocode(addresses: MutableList<Address>) = found(addresses)

        override fun onError(message: String?) = promise.reject("ERR_GEOCODE", message ?: "The geocoder failed")
    }
}
