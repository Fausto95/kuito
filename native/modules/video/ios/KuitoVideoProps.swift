import AVFoundation

/// The Video view's prop values (src/native/video.tsx). Each validates while
/// it decodes, so a value out of range fails as the prop's `unsupportedValue`.
enum KuitoVideoProps {
    struct Source: Decodable {
        let url: URL

        private enum Keys: String, CodingKey { case uri }

        init(from decoder: Decoder) throws {
            let uri = try decoder.container(keyedBy: Keys.self).decode(String.self, forKey: .uri)

            guard let url = URL(string: uri), url.isFileURL || ["http", "https"].contains(url.scheme?.lowercased()) else {
                throw KuitoVideoProps.invalid(decoder, "source.uri must be an http(s) or file:// URL, got \(uri)")
            }

            self.url = url
        }
    }

    /// 0 to 1.
    struct Volume: Decodable {
        let value: Float

        init(from decoder: Decoder) throws {
            value = try decoder.singleValueContainer().decode(Float.self)

            guard (0...1).contains(value) else { throw KuitoVideoProps.invalid(decoder, "volume must be between 0 and 1, got \(value)") }
        }
    }

    /// Above 0.
    struct Rate: Decodable {
        let value: Float

        init(from decoder: Decoder) throws {
            value = try decoder.singleValueContainer().decode(Float.self)

            guard value > 0 else { throw KuitoVideoProps.invalid(decoder, "rate must be above 0, got \(value)") }
        }
    }

    /// Milliseconds; 0 reports no progress.
    struct Interval: Decodable {
        let seconds: Double

        init(from decoder: Decoder) throws {
            let milliseconds = try decoder.singleValueContainer().decode(Double.self)

            guard milliseconds >= 0 else {
                throw KuitoVideoProps.invalid(decoder, "progressUpdateInterval must be 0 or more, got \(milliseconds)")
            }

            seconds = milliseconds / 1000
        }
    }

    enum ResizeMode: String, Decodable {
        case contain, cover, fill

        var gravity: AVLayerVideoGravity {
            switch self {
            case .contain: .resizeAspect
            case .cover: .resizeAspectFill
            case .fill: .resize
            }
        }
    }

    private static func invalid(_ decoder: Decoder, _ message: String) -> Error {
        DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: message))
    }
}
