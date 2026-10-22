import Foundation

/// `BackgroundTasks` in native/modules/background-tasks/background-tasks.ts;
/// the kernel's half is src/runtime/background-tasks.ts, which listens for
/// `run` and calls `finish`.
final class KuitoBackgroundTasksModule: BackgroundTasksSpec {
    private var token: UUID?

    init(context: KuitoModuleContext) {}

    // A run that arrives with no runtime listening starts a headless one, which stops once idle.
    @MainActor static func launch() {
        let tasks = KuitoBackgroundTasks.shared

        KuitoHeadlessRuntime.failed = { tasks.abandonWaiting(because: $0) }
        tasks.onIdle = KuitoHeadlessRuntime.stop
        tasks.registerLaunchHandlers(startRuntime: KuitoHeadlessRuntime.start)
    }

    @MainActor func register(_ name: String, _ schedule: BackgroundTaskSchedule) throws {
        try KuitoBackgroundTasks.shared.register(name, KuitoBackgroundTasks.Options(
            minimumInterval: schedule.minimumInterval,
            requiresNetwork: schedule.requiresNetwork,
            requiresCharging: schedule.requiresCharging
        ))
    }

    @MainActor func unregister(_ name: String) throws {
        KuitoBackgroundTasks.shared.unregister(name)
    }

    @MainActor func status() throws -> BackgroundTaskStatus {
        KuitoBackgroundTasks.shared.status
    }

    @MainActor func finish(_ id: String, _ succeeded: Bool) throws {
        KuitoBackgroundTasks.shared.finish(id, succeeded: succeeded)
    }

    @MainActor func startRun(_ emitter: KuitoEmitter<BackgroundTaskDelivery>) {
        token = KuitoBackgroundTasks.shared.observe { emitter.send($0) }
    }

    @MainActor func stopRun() {
        token.map(KuitoBackgroundTasks.shared.cancel)
        token = nil
    }
}
