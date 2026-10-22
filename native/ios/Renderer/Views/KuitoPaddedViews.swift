import UIKit

/// A view that draws its content inside its padding, as a CSS box does. The
/// layout engine sizes it from its unpadded content and adds the padding.
@MainActor
protocol KuitoPaddedView: AnyObject {
    var padding: UIEdgeInsets { get set }
}

/// Text.
@MainActor
final class KuitoLabel: UILabel, KuitoPaddedView {
    /// Posted with the label when its text changes, for live regions.
    static let textDidChange = Notification.Name("KuitoLabelTextDidChange")

    /// Every layout pass sets it: a label that only moves keeps what it drew.
    var padding = UIEdgeInsets.zero {
        didSet { if padding != oldValue { setNeedsDisplay() } }
    }

    override var attributedText: NSAttributedString? {
        didSet {
            if oldValue?.string != attributedText?.string { NotificationCenter.default.post(name: Self.textDidChange, object: self) }
        }
    }

    #if DEBUG
        /// What the label last drew, which drawing again wastes (KuitoCost).
        private var drawn: (text: NSAttributedString?, size: CGSize, padding: UIEdgeInsets)?
    #endif

    override func drawText(in rect: CGRect) {
        #if DEBUG
            KuitoAblation.slow(.labelRedraw)
            if KuitoAblation.elides(.labelRedraw) { return }

            KuitoCost.add(\.labelRedraws)
            if let drawn, drawn.text == attributedText, drawn.size == bounds.size, drawn.padding == padding {
                KuitoCost.add(\.wastedRedraws)
            }
            drawn = (attributedText, bounds.size, padding)

            let started = KuitoFrameLedger.now

            defer { KuitoFrameLedger.addRedraw(KuitoFrameLedger.now - started) }
        #endif

        super.drawText(in: rect.inset(by: padding))
    }
}

/// A single-line field.
@MainActor
final class KuitoTextField: UITextField, KuitoTextInput, KuitoStyled {
    /// Every layout pass sets it: a field that only moves keeps its layout.
    var padding = UIEdgeInsets.zero {
        didSet { if padding != oldValue { setNeedsLayout() } }
    }

    var placeholderColor: UIColor? {
        didSet { colorPlaceholder() }
    }

    var submitBehavior: String?

    var traits = KuitoInputTraits() {
        didSet { traits.apply(to: self) }
    }

    var maxLength: Int?

    var emit: ((String, (any KuitoEventPayload)?) -> Bool)?

    var emitsSelection = false

    var knownSelection: [Int]?

    var formats = false

    var unformatted = false

    var value: String {
        get { text ?? "" }
        set { text = newValue }
    }

    var disabled: Bool {
        get { !isEnabled }
        set { isEnabled = !newValue }
    }

    private let limit = KuitoMaxLength()
    private var requestLayout: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        delegate = limit
        // Added before the factory's change event, so the event sends the cut text.
        addAction(UIAction { [weak self] _ in
            guard let self else { return }

            limit.changed(self)
            // Typing can widen the field in a row, as Android's and the headless host's do.
            requestLayout?()
        }, for: .editingChanged)
    }

    func style(_ style: KuitoViewStyle, in tree: KuitoTreeLinks) {
        requestLayout = { [weak style] in
            style?.remeasure()
            tree.setNeedsLayout()
        }
    }

    func edited() {
        sendActions(for: .editingChanged)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    var autoFocus = false {
        didSet { focusIfNeeded() }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        focusIfNeeded()
    }

    /// Once on screen, after the batch that placed it has laid out.
    private func focusIfNeeded() {
        guard autoFocus, window != nil else { return }

        autoFocus = false
        DispatchQueue.main.async { [weak self] in self?.becomeFirstResponder() }
    }

    override var placeholder: String? {
        didSet { colorPlaceholder() }
    }

    // A styled field draws its own background; the system's rounded border
    // would add its own inset and outline on top of it.
    override var backgroundColor: UIColor? {
        didSet {
            guard backgroundColor != nil, borderStyle != .none else { return }

            borderStyle = .none
            setNeedsLayout()
        }
    }

    private func colorPlaceholder() {
        guard let placeholderColor, let text = placeholder,
              attributedPlaceholder?.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? UIColor != placeholderColor
        else { return }

        attributedPlaceholder = NSAttributedString(string: text, attributes: [.foregroundColor: placeholderColor])
    }

    // No placeholderRect: UIKit's places the placeholder in textRect, which
    // already holds the padding. Insetting it again moves it off the text.
    override func textRect(forBounds bounds: CGRect) -> CGRect {
        super.textRect(forBounds: bounds.inset(by: padding))
    }

    override func editingRect(forBounds bounds: CGRect) -> CGRect {
        super.editingRect(forBounds: bounds.inset(by: padding))
    }
}
