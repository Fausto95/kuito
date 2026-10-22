import Foundation

/// `IntlFormats` in native/modules/intl/intl.ts: Foundation's locale data
/// behind Intl.RelativeTimeFormat, ListFormat and DisplayNames.
final class KuitoIntlFormatsModule: IntlFormatsSpec {
    init(context: KuitoModuleContext) {}

    /// RelativeDateTimeFormatter takes whole units and has no quarter: a
    /// fraction rounds, and a quarter is three months.
    func relativeTime(
        _ locale: String, _ style: RelativeTimeStyle, _ numeric: RelativeTimeNumeric, _ value: Double, _ unit: RelativeTimeUnit
    ) throws -> String {
        let (field, scale) = Self.fields[unit] ?? (\.second, 1)
        let amount = (value * scale).rounded()

        // DateComponents holds an Int: beyond it the conversion would trap.
        guard abs(amount) < Double(Int.max) else {
            throw KuitoModuleError("ERR_UNSUPPORTED", "\(value) \(unit.rawValue)s is too large to format on iOS")
        }

        let formatter = RelativeDateTimeFormatter()

        formatter.locale = Locale(identifier: locale)
        formatter.unitsStyle = Self.unitsStyles[style] ?? .full
        formatter.dateTimeStyle = numeric == .auto ? .named : .numeric

        var components = DateComponents()

        components[keyPath: field] = Int(amount)

        return formatter.localizedString(from: components)
    }

    func list(_ locale: String, _ type: ListType, _ style: ListStyle, _ items: [String]) throws -> String {
        guard type == .conjunction else {
            throw KuitoModuleError("ERR_UNSUPPORTED", "iOS's ListFormatter joins with \"and\" only; type \"\(type.rawValue)\" has no formatter")
        }

        // The format asks with no items whether the type exists.
        if items.isEmpty { return "" }

        let formatter = ListFormatter()

        formatter.locale = Locale(identifier: locale)

        guard let joined = formatter.string(from: items) else {
            throw KuitoModuleError("ERR_FORMAT", "ListFormatter could not join \(items.count) strings")
        }

        return joined
    }

    /// Foundation names each type in one style, the standard one: `style`
    /// and `languageDisplay` don't change the name.
    func displayName(
        _ locale: String, _ type: DisplayNameType, _ style: DisplayNameStyle, _ languageDisplay: LanguageDisplay, _ code: String
    ) -> String? {
        let names = Locale(identifier: locale)
        let name: String? = switch type {
        case .language: names.localizedString(forIdentifier: code)
        case .region: names.localizedString(forRegionCode: code)
        case .script: names.localizedString(forScriptCode: code)
        case .currency: names.localizedString(forCurrencyCode: code)
        case .calendar: Self.calendars[code].flatMap { names.localizedString(for: $0) }
        }

        // An unknown code may come back as itself: that is no name.
        return name.flatMap { $0.isEmpty || $0.caseInsensitiveCompare(code) == .orderedSame ? nil : $0 }
    }

    /// Each unit's field, and how many of it one unit is.
    private static let fields: [RelativeTimeUnit: (WritableKeyPath<DateComponents, Int?>, Double)] = [
        .year: (\.year, 1), .quarter: (\.month, 3), .month: (\.month, 1), .week: (\.weekOfMonth, 1),
        .day: (\.day, 1), .hour: (\.hour, 1), .minute: (\.minute, 1), .second: (\.second, 1),
    ]

    private static let unitsStyles: [RelativeTimeStyle: RelativeDateTimeFormatter.UnitsStyle] = [
        .long: .full, .short: .short, .narrow: .abbreviated,
    ]

    /// CLDR's calendar names, as Intl takes them, to Foundation's.
    private static let calendars: [String: Calendar.Identifier] = [
        "buddhist": .buddhist, "chinese": .chinese, "coptic": .coptic,
        "ethioaa": .ethiopicAmeteAlem, "ethiopic": .ethiopicAmeteMihret, "gregory": .gregorian,
        "hebrew": .hebrew, "indian": .indian, "islamic": .islamic, "islamic-civil": .islamicCivil,
        "islamic-tbla": .islamicTabular, "islamic-umalqura": .islamicUmmAlQura, "iso8601": .iso8601,
        "japanese": .japanese, "persian": .persian, "roc": .republicOfChina,
    ]
}
