import UIKit

/// Tracks the software keyboard: reports its events to JavaScript as the
/// app's `keyboard.<type>` and moves avoiding views inside the keyboard's
/// own animation, so they travel with it frame for frame, with no JavaScript
/// on the way.
@MainActor
final class KuitoKeyboard {
    /// The shown keyboard's frame in screen coordinates; nil while hidden.
    private(set) var frame: CGRect?
    /// The field being edited, while one is.
    private(set) weak var focused: UIView?
    /// Containers with keyboardAvoidance; each is owned by its view's style.
    let avoiders = NSHashTable<KuitoKeyboardAvoider>.weakObjects()

    /// keyboard.height's frames, once the app asks for them.
    let motion: KuitoKeyboardMotion

    private let events: KuitoEventEmitter
    private weak var root: UIView?
    private var observers: [NSObjectProtocol] = []

    /// Notification, and the event it reports.
    private static let notifications: [(Notification.Name, String)] = [
        (UIResponder.keyboardWillShowNotification, "willshow"),
        (UIResponder.keyboardDidShowNotification, "didshow"),
        (UIResponder.keyboardWillHideNotification, "willhide"),
        (UIResponder.keyboardDidHideNotification, "didhide"),
        (UIResponder.keyboardWillChangeFrameNotification, "willchangeframe"),
        (UIResponder.keyboardDidChangeFrameNotification, "didchangeframe"),
    ]

    /// UIView.AnimationCurve raw values, as React Native names them. 7 is the
    /// keyboard's own curve, which UIKit does not name.
    private static let easings: [Int: String] = [0: "easeInEaseOut", 1: "easeIn", 2: "easeOut", 3: "linear", 7: "keyboard"]

    /// How much room an input keeps above the keyboard.
    static let clearance: CGFloat = 8

    init(events: KuitoEventEmitter, root: UIView) {
        self.events = events
        self.root = root
        motion = KuitoKeyboardMotion(events: events, root: root)

        let center = NotificationCenter.default

        observers = Self.notifications.map { name, event in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let info = KeyboardNotification(note)

                MainActor.assumeIsolated { self?.keyboard(event, info) }
            }
        }
        // A single-line field and a multi-line one each post their own.
        for (begin, end) in [
            (UITextField.textDidBeginEditingNotification, UITextField.textDidEndEditingNotification),
            (UITextView.textDidBeginEditingNotification, UITextView.textDidEndEditingNotification),
        ] {
            observers.append(center.addObserver(forName: begin, object: nil, queue: .main) { [weak self] note in
                let field = note.object as? UIView

                MainActor.assumeIsolated { self?.began(field) }
            })
            observers.append(center.addObserver(forName: end, object: nil, queue: .main) { [weak self] note in
                let field = note.object as? UIView

                MainActor.assumeIsolated { if self?.focused === field { self?.focused = nil } }
            })
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    /// Moves the avoiding views and insets the scroll views for the current
    /// keyboard, now: a new avoider or a changed prop takes effect at once.
    func avoid() {
        guard let root else { return }

        // Measured against the layout the user is about to see.
        root.layoutIfNeeded()
        moveAvoiders(in: root)
        // After the layout: an avoiding container may have resized the scroll view.
        root.layoutIfNeeded()
        insetScrollViews(in: root, reveal: true)
    }

    /// After any layout while the keyboard shows: content that moved (a view
    /// added above an input, a sibling that resized) may need a new lift. The
    /// next pass settles it; a view's own lift never changes what it measures.
    func laidOut() {
        guard frame != nil, let root else { return }

        moveAvoiders(in: root)
        insetScrollViews(in: root, reveal: false)
    }

    private func moveAvoiders(in root: UIView) {
        let top = keyboardTop(in: root)

        for avoider in avoiders.allObjects { avoider.apply(keyboardTop: top, focused: focused) }
    }

    private func insetScrollViews(in root: UIView, reveal: Bool) {
        let top = keyboardTop(in: root)

        for scrollable in Self.scrollables(in: root) {
            // keyboardShouldPersistTaps applies to every scroll view and list, set or not.
            _ = KuitoKeyboardTaps.of(scrollable.scroller, keyboard: self)
            scrollable.avoidKeyboard(top: top, focused: focused, reveal: reveal)
        }
    }

    private func keyboard(_ event: String, _ info: KeyboardNotification) {
        let screen = root?.window?.screen.bounds ?? .zero
        let visible = info.end.height > 0 && info.end.intersects(screen)
        let end = visible ? info.end : CGRect(x: info.end.minX, y: screen.maxY, width: info.end.width, height: 0)

        events.emit(0, "keyboard." + event, KuitoKeyboardFramePayload(
            screenX: Double(end.minX), screenY: Double(end.minY), width: Double(end.width), height: Double(end.height),
            duration: (info.duration * 1000).rounded(), easing: Self.easings[info.curve] ?? "keyboard"
        ))

        if event == "willshow" || event == "willchangeframe" { motion.hidden = false }

        if event == "didhide" { motion.hidden = true }

        guard event == "willchangeframe" else { return }

        frame = visible ? end : nil
        animate(duration: info.duration, curve: info.curve)
    }

    /// Focus moving to another field while the keyboard stays up sends no
    /// keyboard notification; the avoiders follow the new field.
    private func began(_ field: UIView?) {
        focused = field

        if frame != nil { animate(duration: 0.25, curve: UIView.AnimationCurve.easeInOut.rawValue) }
    }

    private func animate(duration: TimeInterval, curve: Int) {
        guard duration > 0 else { return avoid() }

        UIView.animate(
            withDuration: duration,
            delay: 0,
            options: [UIView.AnimationOptions(rawValue: UInt(curve) << 16), .beginFromCurrentState, .allowUserInteraction]
        ) { self.avoid() }
    }

    /// The keyboard's top edge in the root's window; infinity while hidden.
    private func keyboardTop(in root: UIView) -> CGFloat {
        guard let frame, let window = root.window else { return .infinity }

        return window.convert(frame, from: window.screen.coordinateSpace).minY
    }

    private static func scrollables(in view: UIView) -> [KuitoScrollable] {
        view.subviews.flatMap { child in
            (child as? KuitoScrollable).map { [$0] + scrollables(in: child) } ?? scrollables(in: child)
        }
    }
}

/// The fields of a keyboard notification, read on the posting thread.
private struct KeyboardNotification: Sendable {
    let end: CGRect
    let duration: TimeInterval
    let curve: Int

    init(_ note: Notification) {
        let info = note.userInfo ?? [:]

        end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
        duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
        curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.intValue ?? 7
    }
}
