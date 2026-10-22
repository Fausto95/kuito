import CoreLocation

/// Location tasks store their accuracy with their options.
extension LocationAccuracy: Codable {
    /// What Core Location is asked for; Expo's table.
    var desired: CLLocationAccuracy {
        switch self {
        case .lowest: return kCLLocationAccuracyThreeKilometers
        case .low: return kCLLocationAccuracyKilometer
        case .balanced: return kCLLocationAccuracyHundredMeters
        case .high: return kCLLocationAccuracyNearestTenMeters
        case .highest: return kCLLocationAccuracyBest
        case .bestForNavigation: return kCLLocationAccuracyBestForNavigation
        }
    }
}
