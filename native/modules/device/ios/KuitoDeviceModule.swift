import Foundation

/// `Device` in native/modules/device/device.ts. Everything here is read
/// without UIKit, so `info` can answer synchronously on the JS thread.
final class KuitoDeviceModule: DeviceSpec {
    /// expo-device's `DeviceType` numbers, by the identifier's family.
    private static let families: [(prefix: String, type: Int)] = [
        ("iPhone", 1), ("iPod", 1), ("iPad", 2), ("AppleTV", 4),
    ]
    private static let desktop = 3

    init(context: KuitoModuleContext) {}

    func info() -> DeviceInfo {
        let process = ProcessInfo.processInfo
        let model = Self.modelId()
        let type = process.isiOSAppOnMac || process.isMacCatalystApp
            ? Self.desktop
            : Self.families.first { model.hasPrefix($0.prefix) }?.type ?? 0
        let os = process.operatingSystemVersion

        return DeviceInfo(
            isDevice: !Self.isSimulator,
            brand: "Apple",
            manufacturer: "Apple",
            modelName: KuitoDeviceModels.names[model],
            modelId: model,
            deviceType: Double(type),
            totalMemory: Double(process.physicalMemory),
            osName: type == 2 ? "iPadOS" : "iOS",
            osVersion: [os.majorVersion, os.minorVersion].map(String.init).joined(separator: ".")
                + (os.patchVersion > 0 ? ".\(os.patchVersion)" : ""),
            osBuildId: Self.sysctl("kern.osversion"),
            platformApiLevel: nil)
    }

    private static var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    /// A simulator reports the Mac's machine; the model it simulates is in its environment.
    private static func modelId() -> String {
        if isSimulator, let model = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return model
        }

        return sysctl("hw.machine") ?? "unknown"
    }

    private static func sysctl(_ name: String) -> String? {
        var size = 0

        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return nil }

        var value = [CChar](repeating: 0, count: size)

        guard sysctlbyname(name, &value, &size, nil, 0) == 0 else { return nil }

        return String(cString: value)
    }
}
