package dev.kuito.runtime.modules.location

import android.location.Address
import android.location.Location
import android.os.Build
import dev.kuito.link.GeocodedAddress
import dev.kuito.link.GeocodedLocation
import dev.kuito.link.LocationCoords
import dev.kuito.link.LocationObject

fun Location.fix() = LocationObject(
    coords = LocationCoords(
        latitude = latitude,
        longitude = longitude,
        altitude = if (hasAltitude()) altitude else null,
        accuracy = if (hasAccuracy()) accuracy.toDouble() else null,
        altitudeAccuracy = if (hasVerticalAccuracy()) verticalAccuracyMeters.toDouble() else null,
        heading = if (hasBearing()) bearing.toDouble() else null,
        speed = if (hasSpeed()) speed.toDouble() else null,
    ),
    timestamp = time.toDouble(),
    mocked = mocked(),
)

@Suppress("DEPRECATION")
private fun Location.mocked() = if (Build.VERSION.SDK_INT >= 31) isMock else isFromMockProvider

/** Android's geocoder gives no altitude or accuracy. */
fun Address.position() = GeocodedLocation(latitude = latitude, longitude = longitude, altitude = null, accuracy = null)

/** Android's geocoder gives no time zone. */
fun Address.place() = GeocodedAddress(
    name = featureName,
    streetNumber = subThoroughfare,
    street = thoroughfare,
    district = subLocality,
    city = locality,
    subregion = subAdminArea,
    region = adminArea,
    postalCode = postalCode,
    country = countryName,
    isoCountryCode = countryCode,
    timezone = null,
    formattedAddress = if (maxAddressLineIndex >= 0) getAddressLine(0) else null,
)
