import CoreLocation

extension LocationObject {
    // Core Location marks an unknown value with a negative accuracy, course or speed.
    init(_ location: CLLocation) {
        let known = { (value: Double, valid: Bool) in valid ? value : nil }

        self.init(
            coords: LocationCoords(
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                altitude: known(location.altitude, location.verticalAccuracy >= 0),
                accuracy: known(location.horizontalAccuracy, location.horizontalAccuracy >= 0),
                altitudeAccuracy: known(location.verticalAccuracy, location.verticalAccuracy >= 0),
                heading: known(location.course, location.course >= 0),
                speed: known(location.speed, location.speed >= 0)
            ),
            timestamp: location.timestamp.timeIntervalSince1970 * 1000,
            mocked: location.sourceInformation?.isSimulatedBySoftware ?? false
        )
    }
}

extension LocationHeading {
    // A negative true heading means Core Location doesn't know where the device is.
    init(_ heading: CLHeading) {
        self.init(
            trueHeading: heading.trueHeading >= 0 ? heading.trueHeading : nil,
            magHeading: heading.magneticHeading,
            accuracy: heading.headingAccuracy
        )
    }
}

extension GeocodedLocation {
    init(_ location: CLLocation) {
        self.init(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitude: location.verticalAccuracy >= 0 ? location.altitude : nil,
            accuracy: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil
        )
    }
}

/// Core Location has no one-line address, so `formattedAddress` is always null.
extension GeocodedAddress {
    init(_ placemark: CLPlacemark) {
        self.init(
            name: placemark.name,
            streetNumber: placemark.subThoroughfare,
            street: placemark.thoroughfare,
            district: placemark.subLocality,
            city: placemark.locality,
            subregion: placemark.subAdministrativeArea,
            region: placemark.administrativeArea,
            postalCode: placemark.postalCode,
            country: placemark.country,
            isoCountryCode: placemark.isoCountryCode,
            timezone: placemark.timeZone?.identifier,
            formattedAddress: nil
        )
    }
}
