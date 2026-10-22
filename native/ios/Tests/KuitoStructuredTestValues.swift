import Foundation

/// Writes a structured prop's record the way C++ lays it out
/// (native/shared/Schema.h): numbers and strings in the schema's order. A
/// boolean is 0 or 1, an enum its index, a color 0xRRGGBBAA; an optional field
/// is a presence flag, then its value; a list or map its count, then its
/// items; a oneOf its variant's index, then the variant.
struct KuitoRecordWriter {
    private var numbers: [Double] = []
    private var strings: [String] = []

    mutating func number(_ number: Double) { numbers.append(number) }

    mutating func flag(_ flag: Bool) { numbers.append(flag ? 1 : 0) }

    mutating func string(_ string: String) { strings.append(string) }

    mutating func optional<Value>(_ value: Value?, _ write: (inout Self, Value) -> Void) {
        flag(value != nil)
        if let value { write(&self, value) }
    }

    mutating func list<Item>(_ items: [Item], _ write: (inout Self, Item) -> Void) {
        number(Double(items.count))
        for item in items { write(&self, item) }
    }

    var record: KuitoStructRecord { KuitoStructRecord(numbers: numbers, strings: strings) }

    var value: KuitoValue { .structure(record) }

    static func write(_ body: (inout Self) -> Void) -> KuitoValue {
        var writer = Self()

        body(&writer)

        return writer.value
    }
}

/// Each structured prop's values as the kernel sends them, laid out by
/// KuitoRecordWriter in its schema's order (src/protocol/schemas.ts).
enum Structured {
    // layout
    static func timing(duration: Double, easing: [Double] = [0.42, 0, 0.58, 1], delay: Double = 0) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(0)
            record.string("timing")
            record.number(duration)
            record.list(easing) { $0.number($1) }
            record.number(delay)
        }
    }

    static func spring(damping: Double, stiffness: Double, mass: Double, delay: Double = 0) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(1)
            record.string("spring")
            for number in [damping, stiffness, mass, delay] { record.number(number) }
        }
    }

    // backgroundGradient
    static func gradient(angle: Double, colors: [UInt32]) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(angle)
            record.list(colors) { $0.number(Double($1)) }
        }
    }

    // src
    static func image(url: String) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(0)
            record.string(url)
        }
    }

    static func image(asset: String, width: Double, height: Double) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(1)
            record.string(asset)
            record.number(width)
            record.number(height)
        }
    }

    static func image(uri: String, headers: [String: String]? = nil) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(2)
            record.string(uri)
            record.optional(headers) { record, headers in
                record.list(headers.sorted { $0.key < $1.key }) {
                    $0.string($1.key)
                    $0.string($1.value)
                }
            }
        }
    }

    // name
    static func symbol(_ name: String) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(0)
            record.string(name)
        }
    }

    static func symbol(ios: String, android: String) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(1)
            record.string(ios)
            record.string(android)
        }
    }

    // spanningKeys, stickyKeys
    static func keys(_ keys: [String]) -> KuitoValue {
        KuitoRecordWriter.write { record in record.list(keys) { $0.string($1) } }
    }

    // scrollTo
    static func scroll(toKey key: String, animated: Bool? = nil, align: Double? = nil, margin: Double? = nil, request: Int = 1) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(0)
            record.string(key)
            record.optional(animated) { $0.flag($1) }
            record.optional(align) { $0.number($1) }
            record.optional(margin) { $0.number($1) }
            record.number(Double(request))
        }
    }

    static func scrollToEnd(animated: Bool? = nil, request: Int = 1) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(1)
            record.flag(true)
            record.optional(animated) { $0.flag($1) }
            record.number(Double(request))
        }
    }

    static func scroll(toPage page: Int, animated: Bool? = nil, request: Int = 1) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(3)
            record.number(Double(page))
            record.optional(animated) { $0.flag($1) }
            record.number(Double(request))
        }
    }

    static func scroll(toOffset offset: Double, animated: Bool? = nil, request: Int = 1) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(2)
            record.number(offset)
            record.optional(animated) { $0.flag($1) }
            record.number(Double(request))
        }
    }

    // edges
    static func edges(_ edges: [KuitoEdgeValue]) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.list(edges) { record, edge in
                record.number(Double(KuitoEdgeValue.allCases.firstIndex(of: edge) ?? 0))
            }
        }
    }

    // snapPoints
    static func snapPoints(_ points: [KuitoSnapPointValue]) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.list(points) { record, point in
                switch point {
                case .height(let height):
                    record.number(0)
                    record.number(height)
                case .named(let name):
                    record.number(1)
                    record.string(name)
                }
            }
        }
    }

    // icon
    static func icon(symbol name: String) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(0)
            record.string(name)
        }
    }

    static func icon(uri: String) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(1)
            record.string(uri)
        }
    }

    static func icon(ios: String?, android: String?) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(2)
            record.optional(ios) { $0.string($1) }
            record.optional(android) { $0.string($1) }
        }
    }

    // headerItems and search

    enum HeaderIcon {
        case symbol(String)
        case platforms(ios: String?, android: String?)
    }

    struct HeaderItem {
        var label: String
        var icon: HeaderIcon? = nil
        var disabled: Bool? = nil
        var leading = false
    }

    static func headerItems(_ items: [HeaderItem]) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.list(items) { record, item in
                record.string(item.label)
                record.optional(item.icon) { record, icon in
                    switch icon {
                    case .symbol(let name):
                        record.number(0)
                        record.string(name)
                    case .platforms(let ios, let android):
                        record.number(1)
                        record.optional(ios) { $0.string($1) }
                        record.optional(android) { $0.string($1) }
                    }
                }
                record.optional(item.disabled) { $0.flag($1) }
                // HeaderPlacement: leading 0, trailing 1.
                record.number(item.leading ? 0 : 1)
            }
        }
    }

    static func search(placeholder: String?) -> KuitoValue {
        KuitoRecordWriter.write { record in record.optional(placeholder) { $0.string($1) } }
    }

    // actions
    static func actions(_ actions: [(name: String, label: String?)]) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.list(actions) { record, action in
                record.string(action.name)
                record.optional(action.label) { $0.string($1) }
            }
        }
    }

    // gestures
    enum ConfigEntry {
        case number(Double)
        case flag(Bool)
        /// A hit area's edges by name: left, top, right, bottom, width, height, horizontal, vertical.
        case edges([String: Double])
    }

    struct Gesture {
        var tag: Int
        var type: KuitoGestureTypeValue
        var config: [String: ConfigEntry]?
        var waitFor: [Int]?
        var simultaneousHandlers: [Int]?
        var blocksHandlers: [Int]?
    }

    private static let hitSlopEdges = ["left", "top", "right", "bottom", "width", "height", "horizontal", "vertical"]

    /// One gesture config entry, as C++ lays it out inside the gestures' record.
    static func write(_ entry: ConfigEntry, to record: inout KuitoRecordWriter) {
        switch entry {
        case .number(let number):
            record.number(0)
            record.number(number)
        case .flag(let flag):
            record.number(1)
            record.flag(flag)
        case .edges(let edges):
            record.number(2)
            for edge in hitSlopEdges { record.optional(edges[edge]) { $0.number($1) } }
        }
    }

    static func gestures(_ gestures: [Gesture]) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.list(gestures) { record, gesture in
                record.number(Double(gesture.tag))
                record.number(Double(KuitoGestureTypeValue.allCases.firstIndex(of: gesture.type) ?? 0))
                record.optional(gesture.config) { record, config in
                    record.list(config.sorted { $0.key < $1.key }) { record, entry in
                        record.string(entry.key)
                        write(entry.value, to: &record)
                    }
                }
                for tags in [gesture.waitFor, gesture.simultaneousHandlers, gesture.blocksHandlers] {
                    record.optional(tags) { record, tags in record.list(tags) { $0.number(Double($1)) } }
                }
            }
        }
    }

    static func gesture(_ tag: Int, _ type: KuitoGestureTypeValue, config: [String: ConfigEntry]? = nil) -> KuitoValue {
        gestures([Gesture(tag: tag, type: type, config: config)])
    }

    // lines
    static func lines(_ count: Int) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(0)
            record.number(Double(count))
        }
    }

    static func lines(min: Int?, max: Int?) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(1)
            record.optional(min) { $0.number(Double($1)) }
            record.optional(max) { $0.number(Double($1)) }
        }
    }

    // selection
    static func selection(start: Int, end: Int) -> KuitoValue {
        KuitoRecordWriter.write { record in
            record.number(Double(start))
            record.number(Double(end))
        }
    }

    // snapOffsets
    static func snapOffsets(_ offsets: [Double]) -> KuitoValue {
        KuitoRecordWriter.write { record in record.list(offsets) { $0.number($1) } }
    }
}
