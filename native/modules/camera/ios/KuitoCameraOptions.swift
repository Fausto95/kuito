import AVFoundation

/// The values CameraView's props take (src/native/camera.ts), and what each
/// means to AVFoundation.
enum KuitoCameraFacing: String, Decodable {
    case back, front

    var position: AVCaptureDevice.Position {
        switch self {
        case .back: .back
        case .front: .front
        }
    }
}

enum KuitoCameraMode: String, Decodable {
    case picture, video
}

enum KuitoCameraFlash: String, Decodable {
    case off, on, auto

    var mode: AVCaptureDevice.FlashMode {
        switch self {
        case .off: .off
        case .on: .on
        case .auto: .auto
        }
    }
}

enum KuitoBarcodeType: String, Codable, CaseIterable {
    case qr, aztec, datamatrix, pdf417, ean13, ean8, upc_e, code39, code93, code128, itf14

    var type: AVMetadataObject.ObjectType {
        switch self {
        case .qr: .qr
        case .aztec: .aztec
        case .datamatrix: .dataMatrix
        case .pdf417: .pdf417
        case .ean13: .ean13
        case .ean8: .ean8
        case .upc_e: .upce
        case .code39: .code39
        case .code93: .code93
        case .code128: .code128
        case .itf14: .itf14
        }
    }

    init?(_ type: AVMetadataObject.ObjectType) {
        guard let match = Self.allCases.first(where: { $0.type == type }) else { return nil }

        self = match
    }
}
