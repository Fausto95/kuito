import CoreLocation

/// `Location` in native/modules/location/location.ts. Core Location runs
/// only while a request is waiting, a watch is subscribed, `heading` has a
/// listener or a location task is started (`KuitoLocationTasks`). Access
/// comes from `KuitoPermissions`: this module never prompts.
final class KuitoLocationModule: LocationSpec {
    static let denied = KuitoModuleError(
        "ERR_PERMISSION", "Location access is not granted; ask with Permissions.request('location')"
    )

    // Touched only on the main thread, where `.main` functions and events run.
    private var pending: [Int: KuitoLocationUpdates] = [:]
    private var requests = 0
    private var watches: [Int: KuitoLocationUpdates] = [:]
    private var positions: KuitoEmitter<LocationUpdate>?
    private var compass: KuitoLocationCompass?

    init(context: KuitoModuleContext) {}

    // A terminated app relaunched for a location event: its location tasks resume once the app defines them.
    @MainActor static func launch() {
        if KuitoLaunchOptions.current[.location] != nil { KuitoHeadlessRuntime.start() }
    }

    @MainActor func getCurrentPosition(_ request: LocationRequest, _ promise: KuitoPromise<LocationObject>) {
        Self.granted(promise) { [weak self] in
            guard let self else { return }

            let key = requests

            requests += 1
            pending[key] = KuitoLocationUpdates(
                accuracy: request.accuracy, once: true,
                onFix: { [weak self] in
                    self?.pending[key] = nil
                    promise.resolve(LocationObject($0))
                },
                onError: { [weak self] in
                    self?.pending[key] = nil
                    promise.reject($0)
                }
            )
        }
    }

    @MainActor func getLastKnownPosition(_ promise: KuitoPromise<LocationObject?>) {
        Self.granted(promise) { promise.resolve(CLLocationManager().location.map(LocationObject.init)) }
    }

    @MainActor func watchPosition(_ request: LocationWatchRequest, _ promise: KuitoPromise<Void>) {
        Self.granted(promise) { [weak self] in
            guard let self else { return }

            let id = Int(request.id)
            let emit = { [weak self] (update: LocationUpdate) in
                self?.positions?.send(update)
            }

            watches[id]?.stop()
            watches[id] = KuitoLocationUpdates(
                accuracy: request.accuracy, distance: request.distanceInterval, once: false,
                onFix: { emit(LocationUpdate(id: request.id, location: LocationObject($0), error: nil)) },
                onError: { [weak self] error in
                    self?.watches.removeValue(forKey: id)
                    emit(LocationUpdate(id: request.id, location: nil, error: LocationError(code: error.code, message: error.message)))
                }
            )
            promise.resolve()
        }
    }

    @MainActor func clearWatch(_ id: Double) {
        watches.removeValue(forKey: Int(id))?.stop()
    }

    func hasHeading() -> Bool {
        CLLocationManager.headingAvailable()
    }

    func geocode(_ address: String, _ promise: KuitoPromise<[GeocodedLocation]>) {
        Self.geocode(promise) { geocoder, done in
            geocoder.geocodeAddressString(address, completionHandler: done)
        } map: { $0.location.map(GeocodedLocation.init) }
    }

    func reverseGeocode(_ coordinates: LocationCoordinates, _ promise: KuitoPromise<[GeocodedAddress]>) {
        let point = CLLocation(latitude: coordinates.latitude, longitude: coordinates.longitude)

        Self.geocode(promise) { geocoder, done in
            geocoder.reverseGeocodeLocation(point, completionHandler: done)
        } map: { GeocodedAddress($0) }
    }

    func hasServicesEnabled() -> Bool {
        CLLocationManager.locationServicesEnabled()
    }

    @MainActor func startLocationUpdates(_ request: LocationUpdatesRequest, _ promise: KuitoPromise<Void>) {
        Self.granted(promise) {
            do {
                try KuitoLocationTasks.shared.start(KuitoLocationTasks.Options(request))
                promise.resolve()
            } catch {
                promise.reject(error)
            }
        }
    }

    @MainActor func stopLocationUpdates(_ name: String) {
        KuitoLocationTasks.shared.stop(name)
    }

    @MainActor func hasStartedLocationUpdates(_ name: String) -> Bool {
        KuitoLocationTasks.shared.hasStarted(name)
    }

    @MainActor func resumeLocationUpdates(_ name: String) {
        KuitoLocationTasks.shared.resume(name)
    }

    @MainActor func startPosition(_ emitter: KuitoEmitter<LocationUpdate>) {
        positions = emitter
    }

    /// The last listener left: no watch outlives it.
    @MainActor func stopPosition() {
        watches.values.forEach { $0.stop() }
        watches = [:]
        positions = nil
    }

    @MainActor func startHeading(_ emitter: KuitoEmitter<LocationHeading>) {
        compass = KuitoLocationCompass { emitter.send(LocationHeading($0)) }
    }

    @MainActor func stopHeading() {
        compass?.stop()
        compass = nil
    }

    /// The runtime is shutting down, its watches and compass stopped: no request outlives it.
    func destroy() {
        MainActor.assumeIsolated {
            pending.values.forEach { $0.stop() }
            pending = [:]
        }
    }

    @MainActor
    private static func granted<Value>(_ promise: KuitoPromise<Value>, _ then: @escaping () -> Void) {
        KuitoPermissions.check(.location) { response in
            response.status == .granted ? then() : promise.reject(denied)
        }
    }

    /// Runs one geocoder request; a place it can't find resolves `[]`.
    private static func geocode<Value>(
        _ promise: KuitoPromise<[Value]>,
        start: (CLGeocoder, @escaping CLGeocodeCompletionHandler) -> Void,
        map: @escaping (CLPlacemark) -> Value?
    ) {
        let geocoder = CLGeocoder()

        start(geocoder) { placemarks, error in
            withExtendedLifetime(geocoder) {}

            if let error, (error as? CLError)?.code != .geocodeFoundNoResult {
                return promise.reject("ERR_GEOCODE", error.localizedDescription)
            }

            promise.resolve((placemarks ?? []).compactMap(map))
        }
    }
}
