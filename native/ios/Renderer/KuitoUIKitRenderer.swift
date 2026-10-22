import UIKit

/// UIKit implementation of Kuito's view mutation contract: the view tree.
/// Views come from KuitoViewFactory, props go through KuitoProperties, and
/// KuitoRootView positions every view with the shared flexbox engine.
/// Every node has a layout node; a flattened (layout-only) node has no view,
/// and its children's views join the nearest ancestor that has one
/// (docs/flattening.md). Must run on the main actor.
@MainActor
public final class KuitoUIKitRenderer {
    /// Receives each native event: the view's number (0 for the app), the
    /// event, and its payload's record (docs/events.md#typed-events). The
    /// record is the emitter's own: read it before returning.
    /// True when the UI thread's kernel took the event (KuitoEventEmitter.send).
    var onEvent: ((UInt32, String, KuitoEventRecord) -> Bool)?

    /// Called after a view is created or updated: for update highlighting and
    /// for knowing when the first frame exists.
    public var onUpdate: ((UIView) -> Void)?

    /// What the Components panel draws and picks with on the device
    /// (docs/devtools.md); the shell provides it in development builds.
    public weak var devtools: KuitoDevtoolsOverlay?

    private let root = KuitoRootView()
    /// The tree's views emit through it. clear() detaches it: the next runtime
    /// reuses the tree's ids, so a view it removed, such as an image still
    /// loading, would reach handlers that runtime never registered.
    private lazy var events = emitter()
    /// The keyboard and accessibility monitors outlive every tree.
    private(set) lazy var keyboard = KuitoKeyboard(events: emitter(), root: root)
    private lazy var accessibility = KuitoAccessibilityMonitor(events: emitter())
    /// The user's text size; a change renders and measures every text again.
    private(set) lazy var textScale = KuitoTextScale()
    /// Every view's record by its number: the views in Kuito's tree, and
    /// removed ones still on screen until they have left (`exiting`).
    private(set) var nodes: [UInt32: KuitoViewStyle] = [:]
    /// The batch being applied, folded on the JS thread. A paint-only batch
    /// is false and never marks layout (docs/native-renderer.md#prop-effects).
    var marksLayout = true

    public init(container: UIView) {
        root.frame = container.bounds
        root.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(root)
        // Both observe the system from the start: the keyboard may show before any prop asks.
        _ = keyboard
        _ = accessibility
        textScale.changed = { [weak self] in self?.rescaleText() }
        root.laidOut = { [weak self] in self?.keyboard.laidOut() }
    }

    private func rescaleText() {
        for (id, style) in nodes {
            guard let view = style.view, KuitoTextProperties.scale(view, style, textScale.traits) else { continue }

            style.remeasure()
            setNeedsLayout(around: id)
        }
    }

    /// Client reconnects always rehydrate the complete tree from the host.
    public func clear() {
        for node in nodes.values {
            node.sheet?.dismissFromApp()
            node.view?.removeFromSuperview()
            node.gestures.removeAll()
            node.layout.removeFromParent()
        }

        nodes.removeAll()
        KuitoModuleViews.shared.unmountAll()
        events.send = nil
        events = emitter()
    }

    private func emitter() -> KuitoEventEmitter {
        let emitter = KuitoEventEmitter()

        emitter.send = { [weak self] in self?.onEvent?($0, $1, $2) ?? false }

        return emitter
    }

    /// Applies one record of the host batch. UI, UIScript and UIKernel records are the
    /// UI runtime's: the shell hands those to it.
    public func apply(_ record: KuitoMutationRecord) throws {
        switch record.operation {
        case .create:
            try createView(
                id: record.id, kind: record.textValue, parent: record.parent, label: record.nameValue,
                flattened: record.flattened
            )
        case .remove: try removeView(id: record.id)
        case .move: try moveView(id: record.id, parent: record.parent, index: Int(record.index))
        case .flatten: try setFlattened(id: record.id, flattened: record.flattened)
        case .prop: try setProperty(id: record.id, key: record.key, name: record.propName, value: record.value)
        case .command: try command(id: record.id, name: record.nameValue, argument: record.textValue)
        case .ui, .uiScript, .uiKernel, .uiBundle, nil: throw KuitoRenderError.invalidTree("record \(record.op) is not a view mutation")
        }
    }

    /// `parent` 0 is the root; `label` names the view in errors and is how a
    /// list adopts the cell it asked the kernel for.
    public func createView(id: UInt32, kind: String, parent: UInt32, label: String, flattened: Bool = false) throws {
        KuitoCost.add(\.recordsApplied)

        if nodes[id] != nil { throw KuitoRenderError.invalidTree("\(describe(id)) exists already") }

        let parentNode = parent == 0 ? nil : try node(parent)

        guard KuitoViewFactory.make(kind) != nil else { throw KuitoRenderError.invalidTree("no view kind is named \(kind)") }

        let layout = try KuitoLayoutNode(kind: kind)

        // A measured leaf sizes itself through its view; a page is its view's layout root.
        if flattened, layout.measured || KuitoViewFactory.pages[kind] != nil {
            throw KuitoRenderError.invalidTree("a \(kind) cannot be flattened")
        }

        // A page belongs to its container; a host decides which children it takes.
        if let container = KuitoViewFactory.pages[kind], parentNode?.kind != container {
            throw KuitoRenderError.invalidTree("\(kind) \(label) cannot go in \(parent == 0 ? "the root" : describe(parent))")
        }

        let style = KuitoViewStyle(kind: kind, label: label, layout: layout, props: KuitoViewFactory.props(kind))

        nodes[id] = style
        style.parent = parent

        // A host shows its children itself: a list's rows, a container's pages.
        if let host = parentNode?.host {
            if flattened { throw KuitoRenderError.invalidTree("\(kind) \(label) cannot be flattened in \(describe(parent))") }

            try layout.inherit(from: parentLayout(parent))

            return try host.adopt(makeView(id, style), label: label, at: nil)
        }

        if !flattened { try makeView(id, style) }

        // A sheet is presented, not placed: it lays out its own subtree.
        if style.layoutRoot != nil { return try layout.inherit(from: parentLayout(parent)) }

        try insertNode(layout, into: parent, at: nil)
        try place(layout, in: host(under: style.parent))
    }

    /// A flattened node gives up its view (true) or gets one (false). Its
    /// children keep their views, order and frames either way.
    public func setFlattened(id: UInt32, flattened: Bool) throws {
        KuitoCost.add(\.recordsApplied)

        let style = try node(id)
        let target = try host(under: style.parent)

        if flattened {
            guard let view = style.view else { throw KuitoRenderError.invalidTree("\(describe(id)) is flattened already") }

            style.view = nil
            style.content = nil
            style.gestures.removeAll()
            style.layout.children.forEach { place($0, in: target) }
            detach(view)
        } else {
            guard style.view == nil else { throw KuitoRenderError.invalidTree("\(describe(id)) is not flattened") }

            let view = try makeView(id, style)

            place(style.layout, in: target)
            style.layout.children.forEach { place($0, in: style.content ?? view) }
        }

        setNeedsLayout(around: id)
    }

    /// Unsupported props are explicit errors: the host batch was typed and
    /// checked against the manifest before it got here (native/shared/Wire.h).
    public func setProperty(id: UInt32, key: UInt16, name: String, value typed: KuitoValue) throws {
        let style = try animatable(id)

        count(write: typed, of: name, on: style)

        // The kernel sends a flattened node layout props only.
        guard let view = style.view else {
            try KuitoLayoutProperties.change(style, key, typed)

            return style.driven ? relayOut(around: id, style.layout) : setNeedsLayout(around: id)
        }

        let context = KuitoPropertyContext(
            id: id, key: key, name: name, view: view, style: style,
            events: events, keyboard: keyboard, accessibility: accessibility, textScale: textScale
        )

        guard let set = setter(style, key, name) else { throw context.unsupportedProp() }

        do {
            try set(context, typed)
        } catch let rejection as KuitoRenderError.Rejection {
            throw context.unsupportedValue(typed, rejection.reason)
        }

        // A driven prop changes every frame: a layout prop lays out at once
        // only the subtree it can move, any other prop only when it changed
        // what the view measures (a label the UI thread writes), and neither
        // highlights the update. The node lays out before an exited view goes.
        if style.driven, key != kuitoNamedProp, KuitoProperties.layoutByKey[Int(key)] {
            relayOut(around: id, style.layout)
        }

        if style.exited, style.exiting == .animated {
            nodes[id] = nil

            return detach(view)
        }

        if marksLayout, effect(of: key) != .paint, (!style.driven || style.layout.dirty) {
            // A measure contained by a fixed-size box lays that box out. The
            // screen root's cache hit would never visit the dirty descendant.
            if effect(of: key) == .measure, !insideLayoutRoot(id), !root.node.dirty {
                layOutContained(id)
            } else {
                setNeedsLayout(around: id)
            }
        }

        if !style.driven { onUpdate?(view) }
    }

    /// A record applied, and whether it writes the value the view has (KuitoCost).
    private func count(write value: KuitoValue, of name: String, on style: KuitoViewStyle) {
        KuitoCost.add(\.recordsApplied)
        KuitoCost.add(\.propWrites)

        #if DEBUG
            // A list's keys are edits, never a value to compare.
            if case .keys = value { return }

            if style.written[name] == value { KuitoCost.add(\.wastedPropWrites) }

            style.written[name] = value
        #endif
    }

    /// A module view's own prop first, then the shared tables by key.
    private func setter(_ style: KuitoViewStyle, _ key: UInt16, _ name: String) -> KuitoPropertySetter? {
        if !style.props.isEmpty, let own = style.props[name] { return own }

        return key == kuitoNamedProp ? nil : KuitoProperties.byKey[Int(key)]
    }

    /// A prop the UI thread drives frame by frame (docs/motion.md), without
    /// layout unless it is a layout prop, or update highlighting.
    public func setDrivenProperty(id: UInt32, key: UInt16, name: String, value: KuitoValue) throws {
        let style = try animatable(id)

        style.driven = true
        defer { style.driven = false }

        try setProperty(id: id, key: key, name: name, value: value)
    }

    /// A Prop record the UI thread wrote.
    public func applyDriven(_ record: KuitoMutationRecord) throws {
        try setDrivenProperty(id: record.id, key: record.key, name: record.propName, value: record.value)
    }

    /// A one-shot instruction: focus, dismiss the keyboard, announce. Id 0
    /// addresses the app rather than one view.
    public func command(id: UInt32, name: String, argument: String) throws {
        KuitoCost.add(\.recordsApplied)

        let target = id == 0 ? "the app" : describe(id)

        guard let run = KuitoCommands.all[name] else { throw KuitoRenderError.unsupportedProp(prop: name, view: target) }

        let view = id == 0 ? nil : try node(id).view

        if id != 0, view == nil { throw KuitoRenderError.missingView(target) }

        do {
            try run(KuitoCommandContext(
                name: name, view: view, target: target, argument: argument, root: root, keyboard: keyboard,
                accessibility: accessibility,
                devtools: devtools, lookup: { [nodes] id in nodes[id]?.view }
            ))
        } catch let rejection as KuitoRenderError.Rejection {
            throw KuitoRenderError.unsupportedValue(
                prop: name, value: KuitoValue.text(argument).quoted, view: target, reason: rejection.reason
            )
        }
    }

    /// The views inside `root` with a sharedId, by it; of two with one id, the first created.
    func sharedElements(in root: UIView) -> [String: UIView] {
        var shared: [String: UIView] = [:]

        for (_, node) in nodes.sorted(by: { $0.key < $1.key }) {
            guard node.exiting == nil, let sharedId = node.sharedId, shared[sharedId] == nil, let view = node.view,
                  view.isDescendant(of: root)
            else { continue }

            shared[sharedId] = view
        }

        return shared
    }

    /// Every view the batches built, one line each in id order: its kind, its
    /// parent, the frame the layout engine gave it, and a label's text. A list
    /// row's frame is left out: the platform lays a row out when its list shows
    /// it, which follows the list's own scrolling, not the batches. A headless
    /// replay of the recording prints the same lines
    /// (docs/devtools.md#recording-and-replay).
    public func describeTree() -> String {
        let point = { (value: CGFloat) in String(format: "%.1f", value) }
        let inRow = { (id: UInt32) -> Bool in
            var current = self.nodes[id]

            while let node = current {
                if node.kind == "ListCell" { return true }

                current = self.nodes[node.parent]
            }

            return false
        }

        return nodes.keys.sorted().compactMap { id -> String? in
            guard let style = nodes[id], style.exiting == nil else { return nil }

            let frame = style.layout.frame
            var line = "\(id) \(style.kind) in \(style.parent)"

            if inRow(id) {
                line += " in a list row"
            } else {
                line += " \(point(frame.minX)),\(point(frame.minY)) \(point(frame.width))x\(point(frame.height))"
            }
            if style.view == nil { line += " layout-only" }
            if let label = style.view as? UILabel, let text = label.text { line += " \"\(text)\"" }

            return line
        }.joined(separator: "\n")
    }

    /// The number of the Kuito view that is `view` or contains it.
    public func id(containing view: UIView) -> UInt32? {
        var candidate: UIView? = view

        while let current = candidate {
            if let id = nodes.first(where: { $0.value.exiting == nil && $0.value.view === current })?.key { return id }

            candidate = current.superview
        }

        return nil
    }

    /// The Kuito view under `point`, in the container's coordinates: the deepest visible one, whether or
    /// not it takes touches, so a label picks as well as a button (the devtools' Select on device). Views
    /// UIKit adds are looked through: on iOS 26, a navigation stack's floating bar container covers its screens.
    public func id(at point: CGPoint) -> UInt32? {
        var drawn: [ObjectIdentifier: UInt32] = [:]

        for (id, node) in nodes where node.exiting == nil {
            if let view = node.view { drawn[ObjectIdentifier(view)] = id }
        }

        func deepest(_ view: UIView, _ point: CGPoint) -> UInt32? {
            guard !view.isHidden, view.alpha > 0.01, view.bounds.contains(point) else { return nil }

            for child in view.subviews.reversed() {
                if let hit = deepest(child, view.convert(point, to: child)) { return hit }
            }

            return drawn[ObjectIdentifier(view)]
        }

        return deepest(root, root.convert(point, from: root.superview))
    }

    public func moveView(id: UInt32, parent: UInt32, index: Int) throws {
        KuitoCost.add(\.recordsApplied)

        let style = try node(id)

        // A host's child changes place among its host's children only.
        if let host = nodes[style.parent]?.host, let view = style.view {
            guard style.parent == parent else {
                throw KuitoRenderError.invalidTree("\(describe(id)) cannot leave \(describe(style.parent))")
            }

            return try host.move(view, to: index)
        }

        // A sheet stays presented; only the parent in Kuito's tree changes.
        if style.layoutRoot != nil {
            style.parent = parent
            try style.layout.inherit(from: parentLayout(parent))

            return
        }

        style.layout.removeFromParent()
        try insertNode(style.layout, into: parent, at: index)
        style.parent = parent
        try place(style.layout, in: host(under: parent))
    }

    /// The view leaves Kuito's tree immediately; an `exit` keeps it on screen
    /// until the UI thread has animated it out.
    public func removeView(id: UInt32) throws {
        KuitoCost.add(\.recordsApplied)

        let style = try node(id)

        KuitoModuleViews.shared.unmount(id)

        let parent = style.parent
        let exitingAncestor = ancestorWithExiting(under: parent)

        style.gestures.removeAll()

        // A flattened node's children were removed before it.
        guard let view = style.view else {
            nodes[id] = nil
            style.layout.removeFromParent()

            return setNeedsLayout(around: parent)
        }

        // The host owns the view from here, through any transition out, and
        // its subtree stays with it until it is off screen.
        if let host = nodes[parent]?.host {
            style.exiting = .transition

            do {
                try host.release(view) { [weak self] in self?.drop(id, style) }
            } catch {
                drop(id, style)

                throw error
            }

            return
        }

        // The dismissal animation owns the sheet's view from here.
        if let sheet = style.sheet {
            nodes[id] = nil
            sheet.dismissFromApp()
            style.layout.removeFromParent()

            return
        }

        style.layout.removeFromParent()
        setNeedsLayout(around: parent)

        // The UI thread animates its exit and says when it may go.
        if style.exit {
            style.exiting = .animated
            view.isUserInteractionEnabled = false

            return
        }

        nodes[id] = nil

        // Children are removed before their parent. Under an exiting ancestor
        // or a page, wait for the rest of this batch: if the ancestor is
        // removed too, the child leaves with it when its animation or its
        // container's transition ends.
        guard let exitingAncestor else { return detach(view) }

        DispatchQueue.main.async { [weak self] in
            if self?.nodes[exitingAncestor]?.exiting == nil { self?.detach(view) }
        }
    }

    // MARK: - Tree

    /// A view in Kuito's tree; a removed one still leaving is not.
    private func node(_ id: UInt32) throws -> KuitoViewStyle {
        guard let node = nodes[id], node.exiting == nil else { throw KuitoRenderError.missingView(describe(id)) }

        return node
    }

    /// A view that takes props: one in the tree, or one the UI thread is
    /// animating out.
    private func animatable(_ id: UInt32) throws -> KuitoViewStyle {
        guard let node = nodes[id], node.exiting != .transition else { throw KuitoRenderError.missingView(describe(id)) }

        return node
    }

    /// A leaving view has gone; after clear() its number may name another view.
    private func drop(_ id: UInt32, _ style: KuitoViewStyle) {
        if nodes[id] === style { nodes[id] = nil }
    }

    /// Makes the node's view and records it; the caller places it.
    @discardableResult
    private func makeView(_ id: UInt32, _ style: KuitoViewStyle) throws -> UIView {
        guard let make = KuitoViewFactory.make(style.kind) else { throw KuitoRenderError.invalidTree("no view kind is named \(style.kind)") }

        let created = make(id, events)

        KuitoCost.add(\.viewsCreated)
        let view = created.view
        let layout = style.layout

        style.view = view
        style.content = created.content
        style.host = created.host

        // Buttons and fields show text before any font prop: at the user's
        // size, from the platform's own default size.
        if let button = view as? UIButton, let size = button.titleLabel?.font.pointSize { style.text.fontSize = size }

        KuitoTextProperties.scale(view, style, textScale.traits)

        if layout.measured { layout.measure(view, minContent: style.minContent) }

        onUpdate?(view)
        created.styled?.style(style, in: KuitoTreeLinks(
            setNeedsLayout: { [weak self] in self?.setNeedsLayout(around: id) },
            sharedElements: { [weak self] root in self?.sharedElements(in: root) ?? [:] },
            presenter: { [weak root] in root?.window?.rootViewController },
            style: { [weak self] node in self?.nodes.values.first { $0.layout === node } }
        ))

        return view
    }

    /// The node joins its parent's layout at `index`.
    private func insertNode(_ layout: KuitoLayoutNode, into parent: UInt32, at index: Int?) throws {
        let parentLayout = try parentLayout(parent)
        let count = parentLayout.children.count

        parentLayout.insertChild(layout, at: min(max(index ?? count, 0), count))
        setNeedsLayout(around: parent)
    }

    private func parentLayout(_ parent: UInt32) throws -> KuitoLayoutNode {
        parent == 0 ? root.node : try node(parent).layout
    }

    /// The view that holds a node's view: its nearest ancestor with one (a
    /// ScrollView's content), or the root.
    private func host(under parent: UInt32) throws -> UIView {
        var current = parent

        while current != 0 {
            let ancestor = try node(current)

            if let view = ancestor.content ?? ancestor.view { return view }

            current = ancestor.parent
        }

        return root
    }

    /// Puts the node's view into `target` in tree order, above non-Kuito
    /// subviews such as a gradient; a flattened node puts its children's views.
    private func place(_ node: KuitoLayoutNode, in target: UIView) {
        guard let view = node.view else { return node.children.forEach { place($0, in: target) } }

        if let next = nextView(after: node, in: target) {
            target.insertSubview(view, belowSubview: next)
        } else {
            target.addSubview(view)
        }
    }

    /// The first view in `target` that follows the node in tree order, looking
    /// through flattened ancestors up to the one that owns `target`.
    private func nextView(after node: KuitoLayoutNode, in target: UIView) -> UIView? {
        var current = node

        while let parent = current.parent {
            let siblings = parent.children

            if let index = siblings.firstIndex(where: { $0 === current }) {
                for sibling in siblings[(index + 1)...] {
                    if let view = firstView(in: sibling, target) { return view }
                }
            }

            if parent.view != nil { return nil }

            current = parent
        }

        return nil
    }

    private func firstView(in node: KuitoLayoutNode, _ target: UIView) -> UIView? {
        if let view = node.view { return view.superview === target ? view : nil }

        for child in node.children {
            if let view = firstView(in: child, target) { return view }
        }

        return nil
    }

    /// After a driven layout prop: the frames it moves, at once and without
    /// the screen, when an ancestor's frame stops it (docs/motion.md).
    private func relayOut(around id: UInt32, _ node: KuitoLayoutNode) {
        guard let changed = node.relayout() else { return setNeedsLayout(around: id) }

        var host = changed

        while host.view == nil, let parent = host.parent { host = parent }

        host.applyFramesToChildren()
        root.laidOut?()
    }

    /// What a write of `key` can disturb. A module view's own prop lays out.
    private func effect(of key: UInt16) -> KuitoPropEffect {
        key == kuitoNamedProp ? .layout : KuitoProps.effectByKey[Int(key)]
    }

    /// A list row lays out on its own: a change inside one re-measures that
    /// row, not the screen. Anything else lays out the screen, and the sheet
    /// or page it is in, which lays out its own subtree.
    private func setNeedsLayout(around id: UInt32) {
        var current = id

        while current != 0, let node = nodes[current] {
            if let layoutRoot = node.layoutRoot {
                guard layoutRoot.subtreeChanged() else { return }

                break
            }

            current = node.parent
        }

        root.setNeedsLayout()
    }

    /// A sheet, page or list row lays its own subtree out.
    private func insideLayoutRoot(_ id: UInt32) -> Bool {
        var current = id

        while current != 0, let node = nodes[current] {
            if node.layoutRoot != nil { return true }

            current = node.parent
        }

        return false
    }

    /// Lays out the highest dirty node under `id` at the size it already has.
    private func layOutContained(_ id: UInt32) {
        guard var node = nodes[id]?.layout else { return }

        while let parent = node.parent, parent.dirty { node = parent }

        guard node.parent != nil else { return }

        guard node.frame.width != 0 || node.frame.height != 0 else { return }

        node.calculate(withWidth: node.frame.width, height: node.frame.height, scale: root.traitCollection.displayScale)
        node.applyFramesToChildren()
    }

    /// A view as errors name it: its label and number.
    /// The view as errors and frame receipts name it: its kind, label and number.
    func describe(_ id: UInt32) -> String {
        nodes[id]?.described(id) ?? "\(id)"
    }

    private func detach(_ view: UIView) {
        view.removeFromSuperview()
    }

    private func ancestorWithExiting(under parent: UInt32) -> UInt32? {
        var current = parent

        while current != 0, let style = nodes[current] {
            if style.exit { return current }

            if let view = style.view, nodes[style.parent]?.host?.animatesRemoval(view) == true { return current }

            current = style.parent
        }

        return nil
    }
}
