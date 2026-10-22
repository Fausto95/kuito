import UIKit

extension UIColor {
    /// A color the host batch parsed: 0xRRGGBBAA.
    convenience init(kuitoRGBA rgba: UInt32) {
        let channel = { (shift: UInt32) in CGFloat(rgba >> shift & 0xff) / 255 }

        self.init(red: channel(24), green: channel(16), blue: channel(8), alpha: channel(0))
    }

    /// A native module view's color text, counted as a parse.
    convenience init(kuitoHex hex: String) {
        self.init(cssHex: KuitoParses.of(hex))
    }

    /// CSS hex (#rgb, #rgba, #rrggbb, #rrggbbaa), as a JSON prop's colors
    /// arrive; black for anything else.
    convenience init(cssHex hex: String) {
        let (red, green, blue, alpha) = UIColor.cssHexChannels(hex) ?? (0, 0, 0, 1)

        self.init(red: red, green: green, blue: blue, alpha: alpha)
    }

    /// CSS hex (#rgb, #rgba, #rrggbb, #rrggbbaa); nil for anything else.
    convenience init?(strictCSSHex hex: String) {
        guard let (red, green, blue, alpha) = UIColor.cssHexChannels(hex) else { return nil }

        self.init(red: red, green: green, blue: blue, alpha: alpha)
    }

    private static func cssHexChannels(_ hex: String) -> (CGFloat, CGFloat, CGFloat, CGFloat)? {
        let value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = String(value.dropFirst())
        guard value.hasPrefix("#"), [3, 4, 6, 8].contains(digits.count), digits.allSatisfy(\.isHexDigit),
              let number = UInt64(digits, radix: 16) else { return nil }
        let channel = { (shift: UInt64, bits: UInt64) -> CGFloat in
            let raw = (number >> shift) & ((1 << bits) - 1)
            return bits == 4 ? CGFloat(raw * 17) / 255 : CGFloat(raw) / 255
        }
        switch digits.count {
        case 3: return (channel(8, 4), channel(4, 4), channel(0, 4), 1)
        case 4: return (channel(12, 4), channel(8, 4), channel(4, 4), channel(0, 4))
        case 6: return (channel(16, 8), channel(8, 8), channel(0, 8), 1)
        default: return (channel(24, 8), channel(16, 8), channel(8, 8), channel(0, 8))
        }
    }
}
