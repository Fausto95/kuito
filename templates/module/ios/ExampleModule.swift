import Foundation

/// The iOS half of `Example` (example.ts). A mismatch with the spec's
/// generated `ExampleSpec` fails the build.
final class ExampleModule: ExampleSpec {
    private var echoed: KuitoEmitter<ExampleEcho>?

    init(context: KuitoModuleContext) {}

    func platform() -> String {
        "iOS \(ProcessInfo.processInfo.operatingSystemVersionString)"
    }

    @MainActor func echo(_ message: String) -> String {
        echoed?.send(ExampleEcho(message: message))
        return message
    }

    @MainActor func startEchoed(_ emitter: KuitoEmitter<ExampleEcho>) {
        echoed = emitter
    }

    @MainActor func stopEchoed() {
        echoed = nil
    }
}
