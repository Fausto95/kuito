import Foundation

/// `Localization` in native/modules/localization/localization.ts. Foundation
/// only, so the reads answer synchronously on the JS thread.
final class KuitoLocalizationModule: LocalizationSpec {
    /// CLDR names, which Android and expo-localization use, for Foundation's identifiers.
    private static let calendarNames: [Calendar.Identifier: String] = [
        .gregorian: "gregory", .buddhist: "buddhist", .chinese: "chinese", .coptic: "coptic",
        .ethiopicAmeteMihret: "ethiopic", .ethiopicAmeteAlem: "ethioaa", .hebrew: "hebrew",
        .iso8601: "iso8601", .indian: "indian", .islamic: "islamic", .islamicCivil: "islamic-civil",
        .islamicTabular: "islamic-tbla", .islamicUmmAlQura: "islamic-umalqura", .japanese: "japanese",
        .persian: "persian", .republicOfChina: "roc",
    ]
    private static let directions: [Locale.LanguageDirection: TextDirection] = [.leftToRight: .ltr, .rightToLeft: .rtl]
    private static let measurementSystems: [Locale.MeasurementSystem: MeasurementSystem] = [
        .metric: .metric, .us: .us, .uk: .uk,
    ]

    private var observers: [String: [NSObjectProtocol]] = [:]
    /// What each live value last sent, to send a change once.
    private var last: [String: NSArray] = [:]

    init(context: KuitoModuleContext) {}

    /// The user's languages, most preferred first. Separators, units and
    /// measurement follow the user's region settings, which may differ from
    /// the language's own region.
    func locales() -> [LocaleInfo] {
        let settings = Locale.autoupdatingCurrent
        let tags = Locale.preferredLanguages.isEmpty ? [settings.identifier] : Locale.preferredLanguages

        return tags.map { tag in
            let locale = Locale(identifier: tag)

            return LocaleInfo(
                languageTag: tag,
                languageCode: locale.language.languageCode?.identifier,
                languageScriptCode: locale.language.script?.identifier,
                regionCode: locale.region?.identifier ?? settings.region?.identifier,
                textDirection: Self.directions[locale.language.characterDirection],
                decimalSeparator: settings.decimalSeparator,
                digitGroupingSeparator: settings.groupingSeparator,
                measurementSystem: Self.measurementSystems[settings.measurementSystem],
                currencyCode: settings.currency?.identifier,
                currencySymbol: settings.currencySymbol,
                temperatureUnit: UnitTemperature(forLocale: settings) == .fahrenheit ? .fahrenheit : .celsius)
        }
    }

    func calendars() -> [CalendarInfo] {
        let calendar = Calendar.autoupdatingCurrent
        // The `j` skeleton is the locale's preferred hour, with the user's 24-hour override.
        let hour = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: Locale.autoupdatingCurrent) ?? ""

        return [CalendarInfo(
            calendar: Self.calendarNames[calendar.identifier] ?? "\(calendar.identifier)",
            timeZone: TimeZone.autoupdatingCurrent.identifier,
            uses24hourClock: hour.contains("H") || hour.contains("k"),
            firstWeekday: Double(calendar.firstWeekday))]
    }

    @MainActor func startLocales(_ signal: KuitoSignal<[LocaleInfo]>) {
        observe("locales", { $0.locales().map { $0.kuitoEncoded() } }) { signal.set($0.locales()) }
    }

    @MainActor func stopLocales() {
        stop("locales")
    }

    @MainActor func startCalendars(_ signal: KuitoSignal<[CalendarInfo]>) {
        observe("calendars", { $0.calendars().map { $0.kuitoEncoded() } }) { signal.set($0.calendars()) }
    }

    @MainActor func stopCalendars() {
        stop("calendars")
    }

    // Toggling the 24-hour clock posts the locale notification too. One
    // change can post both notifications, or one twice: send it once.
    @MainActor private func observe(
        _ key: String,
        _ snapshot: @escaping (KuitoLocalizationModule) -> [Any],
        _ send: @escaping (KuitoLocalizationModule) -> Void
    ) {
        let center = NotificationCenter.default

        last[key] = snapshot(self) as NSArray
        observers[key] = [NSLocale.currentLocaleDidChangeNotification, .NSSystemTimeZoneDidChange].map {
            center.addObserver(forName: $0, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }

                let next = snapshot(self) as NSArray

                guard !next.isEqual(self.last[key]) else { return }

                self.last[key] = next
                send(self)
            }
        }
    }

    @MainActor private func stop(_ key: String) {
        observers.removeValue(forKey: key)?.forEach(NotificationCenter.default.removeObserver)
        last[key] = nil
    }
}
