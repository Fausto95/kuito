import UIKit
import XCTest

/// Null on the wire unsets a prop, and what that means is the manifest's
/// `unset` rule (docs/native-renderer.md#unset-props), never the setter's own
/// choice: the value the rule names, the view's initial state, or an error.
/// Each prop names a kind that takes it, a value to set before unsetting it,
/// and the native state it changes.
@MainActor
final class KuitoUnsetTests: XCTestCase {
    func testEveryPropTheRendererSetsHasAProbe() {
        // The layout engine resets the rest itself, the same way on both
        // platforms (native/shared/layout/KuitoLayoutStyle.cpp).
        let engine = Set(KuitoLayoutProperties.setters.keys).subtracting(Self.probes.keys)

        XCTAssertEqual(KuitoProps.names.subtracting(engine).subtracting(Self.probes.keys), [])
    }

    /// Structured props arrive as records (docs/native-scheduling.md#structured-props):
    /// each probe's sample is one, so each setter is seen reading one.
    func testEveryStructuredPropIsProbedWithARecord() {
        let structured = [
            "layout", "backgroundGradient", "src", "name", "spanningKeys", "stickyKeys", "scrollTo", "edges",
            "snapPoints", "icon", "actions", "gestures", "lines", "selection", "snapOffsets",
        ]

        let unrecorded = structured.filter { name in
            guard case .structure = Self.probes[name]?.sample else { return true }

            return false
        }

        XCTAssertEqual(unrecorded, [])
    }

    func testUnsetFollowsTheManifest() throws {
        for (name, probe) in Self.probes.sorted(by: { $0.key < $1.key }) {
            let key = try XCTUnwrap(KuitoProps.byKey.firstIndex(of: name), name)

            XCTAssertNotEqual(try state(probe, name, setting: [probe.sample]), try state(probe, name, setting: []),
                              "\(name)'s probe sees its sample")

            switch KuitoProps.unsetByKey[key] {
            case .value(let value):
                XCTAssertEqual(try state(probe, name, setting: [probe.sample, .null]),
                               try state(probe, name, setting: [probe.sample, value]),
                               "\(name) unsets to \(value)")
            case .initial:
                XCTAssertEqual(try state(probe, name, setting: [probe.sample, .null]),
                               try state(probe, name, setting: []),
                               "\(name) unsets to the view's initial state")
            case .required:
                let (renderer, id) = try make(probe)

                XCTAssertThrowsError(try renderer.setProperty(id: id, name: name, value: .null), name) { error in
                    guard case .unsupportedValue(let prop, _, _, _) = error as? KuitoRenderError else {
                        return XCTFail("\(name): \(error)")
                    }

                    XCTAssertEqual(prop, name)
                }
            }
        }
    }

    private func make(_ probe: Probe) throws -> (KuitoUIKitRenderer, UInt32) {
        let renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        let id: UInt32 = 2

        if let parent = probe.parent { try renderer.createView(id: 1, kind: parent, parent: 0, label: parent) }

        try renderer.createView(id: id, kind: probe.kind, parent: probe.parent == nil ? 0 : 1, label: probe.kind)

        for (name, value) in probe.before.sorted(by: { $0.key < $1.key }) { try renderer.setProperty(id: id, name: name, value: value) }

        return (renderer, id)
    }

    /// The probed state of a new view after setting `values` in turn.
    private func state(_ probe: Probe, _ name: String, setting values: [KuitoValue]) throws -> String {
        let (renderer, id) = try make(probe)

        for value in values { try renderer.setProperty(id: id, name: name, value: value) }

        let node = try XCTUnwrap(renderer.nodes[id])

        return probe.read(try XCTUnwrap(node.view), node)
    }

    private struct Probe {
        let kind: String
        let parent: String?
        /// Props the view takes first, for a prop whose state needs them (a selection needs text).
        var before: [String: KuitoValue] = [:]
        let sample: KuitoValue
        let read: @MainActor (UIView, KuitoViewStyle) -> String
    }

    private static func on<View: UIView>(
        _ kind: String,
        in parent: String? = nil,
        before: [String: KuitoValue] = [:],
        _ sample: KuitoValue,
        _ read: @escaping @MainActor (View, KuitoViewStyle) -> Any?
    ) -> Probe {
        Probe(kind: kind, parent: parent, before: before, sample: sample) { view, style in describe(read(view as! View, style)) }
    }

    private static func box(_ sample: KuitoValue, _ read: @escaping @MainActor (UIView, KuitoViewStyle) -> Any?) -> Probe {
        on("Box", sample, read)
    }

    private static func describe(_ value: Any?) -> String {
        switch value {
        case nil: "nil"
        case let color as UIColor: rgba(color)
        case let value?: String(describing: value)
        }
    }

    private static func rgba(_ color: UIColor?) -> String {
        guard let color else { return "nil" }

        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0

        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)

        return String(format: "rgba(%.3f %.3f %.3f %.3f)", red, green, blue, alpha)
    }

    private static func rgba(_ color: CGColor?) -> String { rgba(color.map(UIColor.init(cgColor:))) }

    /// A stored property the view keeps private, described.
    private static func field(_ object: Any, _ name: String) -> String {
        Mirror(reflecting: object).children.first { $0.label == name }.map { describe($0.value) } ?? "no \(name)"
    }

    private static let red: KuitoValue = .color(0xff0000ff)

    private static let probes: [String: Probe] = [
        // Animation
        "opacity": box(.number(0.5)) { view, _ in view.alpha },
        "backgroundColor": box(red) { view, _ in view.backgroundColor },
        "translateX": box(.number(5)) { view, _ in view.transform },
        "translateY": box(.number(5)) { view, _ in view.transform },
        "scale": box(.number(2)) { view, _ in view.transform },
        "scaleX": box(.number(2)) { view, _ in view.transform },
        "scaleY": box(.number(2)) { view, _ in view.transform },
        "rotate": box(.number(30)) { view, _ in view.transform },
        "exit": box(.bool(true)) { _, style in style.exit },
        "exited": box(.bool(true)) { _, style in style.exited },
        "layout": box(Structured.timing(duration: 200)) { _, style in style.layout.frameAnimation != nil },
        // Layout props UIKit draws too
        "hidden": box(.bool(true)) { view, _ in view.isHidden },
        "gap": on("List", .number(8)) { (list: KuitoListView, _) in "\(list.rowGap) \(list.columnGap)" },
        "rowGap": on("List", .number(8)) { (list: KuitoListView, _) in list.rowGap },
        "columnGap": on("List", .number(8)) { (list: KuitoListView, _) in list.columnGap },
        // Decoration
        "borderRadius": box(.number(8)) { view, style in "\(style.cornerRadius) \(view.layer.cornerRadius) \(view.layer.masksToBounds)" },
        "overflow": box(.enumValue(1, "hidden")) { view, _ in view.layer.masksToBounds },
        "borderWidth": box(.number(2)) { view, _ in view.layer.borderWidth },
        "borderColor": box(red) { view, _ in rgba(view.layer.borderColor) },
        "shadowColor": box(red) { view, _ in "\(rgba(view.layer.shadowColor)) \(view.layer.shadowOpacity)" },
        "shadowRadius": box(.number(6)) { view, _ in view.layer.shadowRadius },
        "shadowOffsetX": box(.number(3)) { view, _ in view.layer.shadowOffset },
        "shadowOffsetY": box(.number(3)) { view, _ in view.layer.shadowOffset },
        "backgroundGradient": box(Structured.gradient(angle: 90, colors: [0xff0000ff, 0x0000ffff])) { _, style in style.gradient != nil },
        // Text
        "text": on("Text", .text("Hello")) { (label: UILabel, _) in label.attributedText?.string },
        "color": on("Text", red) { (_: UILabel, style) in style.text.color },
        "fontSize": on("Text", .number(30)) { (_: UILabel, style) in style.text.fontSize },
        "fontWeight": on("Text", .enumValue(1, "bold")) { (_: UILabel, style) in style.text.weight },
        "fontFamily": on("Text", .text("Helvetica")) { (_: UILabel, style) in style.text.family },
        "fontStyle": on("Text", .enumValue(1, "italic")) { (_: UILabel, style) in style.text.italic },
        "lineHeight": on("Text", .number(30)) { (_: UILabel, style) in style.text.lineHeight },
        "letterSpacing": on("Text", .number(2)) { (_: UILabel, style) in style.text.letterSpacing },
        "textAlign": on("Text", .enumValue(1, "center")) { (_: UILabel, style) in style.text.alignment.rawValue },
        "textTransform": on("Text", .enumValue(1, "uppercase")) { (_: UILabel, style) in style.text.textTransform },
        "lineClamp": on("Text", .number(2)) { (label: UILabel, _) in label.numberOfLines },
        "maxFontScale": on("Text", .number(2)) { (_: UILabel, style) in style.text.maxFontScale },
        // Control
        "disabled": on("Pressable", .bool(true)) { (pressable: KuitoPressableView, _) in pressable.isDisabled },
        "placeholder": on("TextField", .text("Name")) { (field: UITextField, _) in field.placeholder },
        "placeholderTextColor": on("TextField", red) { (field: KuitoTextField, _) in field.placeholderColor },
        "selectionColor": on("TextField", red) { (field: UITextField, _) in field.tintColor },
        "checked": on("Toggle", .bool(true)) { (toggle: UISwitch, _) in toggle.isOn },
        "animating": on("Spinner", .bool(false)) { (spinner: UIActivityIndicatorView, _) in spinner.isAnimating },
        // Press
        "pressedOpacity": on("Pressable", .number(0.5)) { (pressable: KuitoPressableView, _) in pressable.activeOpacity },
        "pressedScale": on("Pressable", .number(0.9)) { (pressable: KuitoPressableView, _) in pressable.pressedScale },
        "longPressDuration": on("Pressable", .number(900)) { (pressable: KuitoPressableView, _) in pressable.longPressDuration },
        "hitArea": on("Pressable", .number(10)) { (pressable: KuitoPressableView, _) in pressable.hitSlop },
        "haptic": on("Pressable", .enumValue(0, "light")) { (pressable: KuitoPressableView, _) in pressable.haptic },
        // Image
        "src": on("Image", Structured.image(url: "https://example.com/a.png")) { (image: KuitoImageView, _) in field(image, "source") },
        "objectFit": on("Image", .enumValue(1, "contain")) { (image: KuitoImageView, _) in image.contentMode.rawValue },
        "placeholderColor": on("Image", red) { (image: KuitoImageView, _) in image.placeholderColor },
        "fadeDuration": on("Image", .number(300)) { (image: KuitoImageView, _) in image.transitionDuration },
        "tintColor": on("Image", red) { (image: KuitoImageView, _) in image.tint },
        "cache": on("Image", .enumValue(3, "none")) { (image: KuitoImageView, _) in image.cachePolicy },
        "thumbhash": on("Image", .text("4AcKNZqAh4dwd3d4eHh3h3CAB/eI")) { (image: KuitoImageView, _) in field(image, "thumbHash") },
        // Symbol
        "name": on("Symbol", Structured.symbol("star")) { (symbol: KuitoSymbolView, _) in field(symbol, "name") },
        "size": on("Symbol", .number(40)) { (symbol: KuitoSymbolView, _) in field(symbol, "pointSize") },
        "weight": on("Symbol", .enumValue(6, "bold")) { (symbol: KuitoSymbolView, _) in
            (Mirror(reflecting: symbol).children.first { $0.label == "weight" }?.value as? UIImage.SymbolWeight)?.rawValue
        },
        // Scroll
        "emitsScroll": on("Scroll", .bool(true)) { (scroll: KuitoScrollView, _) in scroll.emitsScroll },
        "emitsMotion": on("Scroll", .bool(true)) { (scroll: KuitoScrollView, _) in scroll.motion.on },
        "scrollInterval": on("Scroll", .number(16)) { (scroll: KuitoScrollView, _) in scroll.scrollEventThrottle },
        "reachEndThreshold": on("Scroll", .number(2)) { (scroll: KuitoScrollView, _) in scroll.endReachedThreshold },
        "refreshable": on("Scroll", .bool(true)) { (scroll: KuitoScrollView, _) in scroll.refreshable },
        "refreshing": on("Scroll", .bool(true)) { (scroll: KuitoScrollView, _) in scroll.refreshing },
        "scrollbar": on("Scroll", .bool(false)) { (scroll: KuitoScrollView, _) in
            "\(scroll.showsVerticalScrollIndicator) \(scroll.showsHorizontalScrollIndicator)"
        },
        "paging": on("Scroll", .bool(true)) { (scroll: KuitoScrollView, _) in scroll.isPagingEnabled },
        "snapOffsets": on("Scroll", Structured.snapOffsets([100])) { (scroll: KuitoScrollView, _) in scroll.snapOffsets },
        // List
        "keys": on("List", .keys([KuitoKeyEdit(.insert, "a", at: 0)])) { (list: KuitoListView, _) in list.layout.keys },
        "spanningKeys": on("List", Structured.keys(["a"])) { (list: KuitoListView, _) in list.layout.spanningKeys },
        "stickyKeys": on("List", Structured.keys(["a"])) { (list: KuitoListView, _) in list.layout.stickyKeys },
        "numColumns": on("List", .number(3)) { (list: KuitoListView, _) in list.layout.numColumns },
        "inverted": on("List", .bool(true)) { (list: KuitoListView, _) in list.inverted },
        "estimatedItemSize": on("List", .number(80)) { (list: KuitoListView, _) in list.layout.estimatedLength },
        "initialScrollKey": on("List", .text("a")) { (list: KuitoListView, _) in list.initialScrollKey },
        "scrollTo": on("List", Structured.scroll(toKey: "a")) { (list: KuitoListView, _) in field(list, "scrollTarget") },
        "emitsViewable": on("List", .bool(true)) { (list: KuitoListView, _) in list.emitsViewable },
        "viewableThreshold": on("List", .number(0.5)) { (list: KuitoListView, _) in list.viewableThreshold },
        "cellKey": on("ListCell", .text("a")) { (cell: KuitoListCell, _) in cell.renderedKey },
        // Safe area, sheet, navigation
        "edges": on("SafeArea", Structured.edges([.top])) { (area: KuitoSafeAreaView, _) in area.edges.map(\.rawValue).sorted() },
        "open": on("Sheet", .bool(true)) { (sheet: KuitoSheetView, _) in sheet.open },
        "snapPoints": on("Sheet", Structured.snapPoints([.height(200)])) { (sheet: KuitoSheetView, _) in sheet.snapPoints },
        "grabber": on("Sheet", .bool(false)) { (sheet: KuitoSheetView, _) in sheet.grabber },
        "dismissible": on("Sheet", .bool(false)) { (sheet: KuitoSheetView, _) in sheet.dismissible },
        "sheetCornerRadius": on("Sheet", .number(12)) { (sheet: KuitoSheetView, _) in sheet.cornerRadius },
        "presentation": on("Sheet", .enumValue(1, "modal")) { (sheet: KuitoSheetView, _) in sheet.presentation },
        "title": on("NavigationScreen", in: "NavigationStack", .text("Home")) { (screen: KuitoNavigationScreenView, _) in screen.title },
        "header": on("NavigationScreen", in: "NavigationStack", .bool(false)) { (screen: KuitoNavigationScreenView, _) in screen.headerShown },
        "headerItems": on("NavigationScreen", in: "NavigationStack", Structured.headerItems([.init(label: "Add")])) {
            (screen: KuitoNavigationScreenView, _) in screen.headerItems.map(\.label)
        },
        "largeTitle": on("NavigationScreen", in: "NavigationStack", .bool(true)) { (screen: KuitoNavigationScreenView, _) in screen.largeTitle },
        "search": on("NavigationScreen", in: "NavigationStack", Structured.search(placeholder: "Shows")) {
            (screen: KuitoNavigationScreenView, _) in screen.search?.placeholder
        },
        "icon": on("NavigationTab", in: "NavigationTabs", Structured.icon(symbol: "star")) { (tab: KuitoNavigationTabView, _) in tab.icon != nil },
        "selectedIndex": on("NavigationTabs", .number(1)) { (tabs: KuitoNavigationTabsView, _) in tabs.selectedIndex },
        "sharedId": box(.text("hero")) { _, style in style.sharedId },
        // Accessibility
        "accessible": box(.bool(true)) { view, style in "\(describe(style.accessibility.accessible)) \(view.isAccessibilityElement)" },
        "label": box(.text("Close")) { view, _ in view.accessibilityLabel },
        "hint": box(.text("Closes it")) { view, _ in view.accessibilityHint },
        "role": box(.enumValue(3, "button")) { view, _ in view.accessibilityTraits.rawValue },
        "aria-hidden": box(.bool(true)) { view, _ in view.accessibilityElementsHidden },
        "actions": box(Structured.actions([("activate", nil)])) { _, style in style.accessibility.actions.map(\.name) },
        "live": box(.enumValue(1, "polite")) { _, style in style.accessibility.live != nil },
        "aria-disabled": box(.bool(true)) { view, _ in view.accessibilityTraits.rawValue },
        "aria-selected": box(.bool(true)) { view, _ in view.accessibilityTraits.rawValue },
        "aria-checked": box(.bool(true)) { view, _ in view.accessibilityValue },
        "aria-busy": box(.bool(true)) { view, _ in "\(view.accessibilityValue ?? "") \(view.accessibilityTraits.rawValue)" },
        "aria-expanded": box(.bool(true)) { view, _ in view.accessibilityValue },
        "aria-valuemin": box(.number(0)) { _, style in describe(style.accessibility.facts["aria-valuemin"]) },
        "aria-valuemax": box(.number(10)) { _, style in describe(style.accessibility.facts["aria-valuemax"]) },
        "aria-valuenow": box(.number(5)) { _, style in describe(style.accessibility.facts["aria-valuenow"]) },
        "aria-valuetext": box(.text("half")) { view, _ in view.accessibilityValue },
        // Keyboard
        "enterKeyHint": on("TextField", .enumValue(4, "search")) { (field: UITextField, _) in field.returnKeyType.rawValue },
        "submitBehavior": on("TextField", .enumValue(0, "submit")) { (field: KuitoTextField, _) in field.submitBehavior },
        "autoFocus": on("TextField", .bool(true)) { (field: KuitoTextField, _) in field.autoFocus },
        "keyboardDismissMode": on("Scroll", .enumValue(1, "on-drag")) { (scroll: UIScrollView, _) in scroll.keyboardDismissMode.rawValue },
        "keyboardShouldPersistTaps": on("Scroll", .enumValue(1, "always")) { (scroll: UIScrollView, _) in
            scroll.gestureRecognizers?.compactMap { ($0 as? KuitoKeyboardTaps)?.mode } ?? []
        },
        "automaticallyAdjustKeyboardInsets": on("Scroll", .bool(false)) { (scroll: KuitoScrollView, _) in
            scroll.automaticallyAdjustsKeyboardInsets
        },
        "keyboardAvoidance": box(.enumValue(1, "padding")) { _, style in style.keyboardAvoider?.mode },
        // Input
        "type": on("TextField", .enumValue(1, "password")) { (field: UITextField, _) in field.isSecureTextEntry },
        "inputMode": on("TextField", .enumValue(3, "numeric")) { (field: UITextField, _) in field.keyboardType.rawValue },
        "autoComplete": on("TextField", .enumValue(1, "username")) { (field: UITextField, _) in field.textContentType?.rawValue },
        "autoCapitalize": on("TextField", .enumValue(0, "none")) { (field: UITextField, _) in field.autocapitalizationType.rawValue },
        "maxLength": on("TextField", .number(2)) { (field: KuitoTextField, _) in field.maxLength },
        "spellCheck": on("TextField", .bool(false)) { (field: UITextField, _) in field.spellCheckingType.rawValue },
        "lines": on("MultilineTextField", Structured.lines(3)) { (field: KuitoTextView, _) in field.lines },
        "selection": on("TextField", before: ["text": .text("hello")], Structured.selection(start: 1, end: 3)) { (field: UITextField, _) in
            field.selectedTextRange.map { [$0.start, $0.end].map { field.offset(from: field.beginningOfDocument, to: $0) } }
        },
        "emitsSelection": on("TextField", .bool(true)) { (field: KuitoTextField, _) in field.emitsSelection },
        "formats": on("TextField", .bool(true)) { (field: KuitoTextField, _) in field.formats },
        // Gestures
        "gestures": box(Structured.gesture(1, .tap)) { view, _ in view.gestureRecognizers?.count ?? 0 },
    ]
}
