import UIKit

/// A field's `lines`: a fixed count, or a range the field grows in as its
/// text wraps. nil `max` is no limit.
struct KuitoLines: Equatable {
    var min = 1
    var max: Int? = nil

    var grows: Bool { max != min }
}

/// A multi-line field: a UITextView as tall as its lines, with the
/// placeholder UITextView lacks. More text than its lines scrolls inside it.
@MainActor
final class KuitoTextView: UITextView, KuitoTextInput, KuitoModeMeasured, KuitoStyled {
    /// Sends the field's events: change, focus, blur and submit.
    var emit: ((String, (any KuitoEventPayload)?) -> Bool)?

    var lines = KuitoLines() {
        didSet { if lines != oldValue { requestLayout?() } }
    }

    /// Every layout pass sets it: a field that only moves keeps its layout.
    var padding = UIEdgeInsets.zero {
        didSet {
            guard padding != oldValue else { return }

            textContainerInset = padding
            setNeedsLayout()
        }
    }

    var placeholder: String? {
        get { placeholderLabel.text }
        set {
            placeholderLabel.text = newValue
            setNeedsLayout()
        }
    }

    var placeholderColor: UIColor? {
        didSet { placeholderLabel.textColor = placeholderColor ?? .placeholderText }
    }

    var showsPlaceholder: Bool { !placeholderLabel.isHidden }

    var submitBehavior: String?

    var autoFocus = false {
        didSet { focusIfNeeded() }
    }

    var traits = KuitoInputTraits() {
        didSet { traits.apply(to: self) }
    }

    var maxLength: Int?

    var emitsSelection = false

    var knownSelection: [Int]?

    var formats = false

    var unformatted = false

    var value: String {
        get { text }
        set {
            text = newValue
            textDidChange()
        }
    }

    var disabled: Bool {
        get { !isEditable }
        set {
            // UIKit resets the font and color when selection turns off: they stay the field's.
            let (font, color) = (self.font, textColor)

            isEditable = !newValue
            isSelectable = !newValue
            self.font = font
            textColor = color
        }
    }

    override var font: UIFont? {
        didSet { placeholderLabel.font = font }
    }

    override var textAlignment: NSTextAlignment {
        didSet { placeholderLabel.textAlignment = textAlignment }
    }

    private let placeholderLabel = UILabel()
    private let events = KuitoTextViewEvents()
    private var requestLayout: (() -> Void)?

    init() {
        super.init(frame: .zero, textContainer: nil)
        // UITextField's look without a border: 17 pt, no insets beyond the padding, no background.
        font = .systemFont(ofSize: 17)
        backgroundColor = nil
        textContainerInset = .zero
        textContainer.lineFragmentPadding = 0
        // A field is no scroll view of the screen's: the status bar's tap and the safe area are theirs.
        scrollsToTop = false
        contentInsetAdjustmentBehavior = .never
        placeholderLabel.numberOfLines = 0
        placeholderLabel.textColor = .placeholderText
        placeholderLabel.font = font
        addSubview(placeholderLabel)
        delegate = events
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func style(_ style: KuitoViewStyle, in tree: KuitoTreeLinks) {
        requestLayout = { [weak style] in
            style?.remeasure()
            tree.setNeedsLayout()
        }
    }

    func edited() {
        events.textViewDidChange(self)
    }

    /// The user changed the text: it may wrap onto another line, or widen the field in a row.
    fileprivate func userChanged() {
        textDidChange()
        userEdited()
        requestLayout?()
    }

    private func textDidChange() {
        placeholderLabel.isHidden = !text.isEmpty
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        let area = bounds.inset(by: padding)
        let height = placeholderLabel.sizeThatFits(CGSize(width: area.width, height: .greatestFiniteMagnitude)).height

        placeholderLabel.frame = CGRect(x: area.minX, y: area.minY, width: area.width, height: min(height, area.height))

        // Typing a new line scrolls the caret into view before the field grows to show it.
        if contentSize.height <= bounds.height, contentOffset != .zero { contentOffset = .zero }
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

    /// Its text's height within `lines` of its font, without the padding the
    /// engine adds. The text's own height counts, not a count of lines: an
    /// emoji or a fallback script's line is taller than the font's.
    func size(width: CGFloat, widthMode: KuitoMeasureMode, height _: CGFloat, heightMode _: KuitoMeasureMode) -> CGSize {
        let line = (font ?? .systemFont(ofSize: 17)).lineHeight
        let available = widthMode == .undefined || widthMode == .minContent ? CGFloat.greatestFiniteMagnitude : width
        // An empty text's extra line takes no font of the field's: one of its lines it is.
        let used = text.isEmpty ? CGSize(width: 0, height: line) : Self.used(attributedText, width: available)
        let lowest = CGFloat(lines.min) * line
        let highest = lines.max.map { CGFloat($0) * line } ?? .greatestFiniteMagnitude
        let placeholderWidth = text.isEmpty ? placeholderLabel.sizeThatFits(CGSize(width: available, height: line)).width : 0
        let fitted = widthMode == .exactly ? width : Swift.min(available, ceil(Swift.max(used.width, placeholderWidth)))

        return CGSize(width: fitted, height: ceil(Swift.min(Swift.max(used.height, lowest), highest)))
    }

    /// The text laid out at `width` as a text view lays it out, a trailing new line included.
    private static func used(_ text: NSAttributedString, width: CGFloat) -> CGSize {
        let storage = NSTextStorage(attributedString: text)
        let layout = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))

        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        layout.ensureLayout(for: container)

        return layout.usedRect(for: container).size
    }
}

/// The text view's delegate: its events, the return key, and maxLength.
@MainActor
private final class KuitoTextViewEvents: NSObject, UITextViewDelegate {
    private let limit = KuitoMaxLength()

    func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
        guard let field = textView as? KuitoTextView else { return true }

        // The return key submits instead of adding a line, as submitBehavior says.
        if text == "\n", (field.submitBehavior ?? "newline") != "newline" {
            _ = field.emit?("submit", KuitoTextPayload(text: field.value))
            field.submitted()

            return false
        }

        return limit.allows(field, replacing: range, with: text)
    }

    func textViewDidChange(_ textView: UITextView) {
        guard let field = textView as? KuitoTextView else { return }

        limit.changed(field)
        field.userChanged()
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
        (textView as? KuitoTextView)?.selectionChanged()
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
        _ = (textView as? KuitoTextView)?.emit?("focus", nil)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
        guard let field = textView as? KuitoTextView else { return }

        field.compositionEnded()
        _ = field.emit?("blur", nil)
    }
}
