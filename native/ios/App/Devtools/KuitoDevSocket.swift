import Foundation

/// The dev server connection's state, shown in the devtools.
enum KuitoConnectionState: Equatable {
    case connecting
    case connected
    /// Lost, or never reached; the next attempt starts after `delay` seconds.
    case retrying(delay: TimeInterval, reason: String)
}

/// A WebSocket to the dev server that stays up: it pings to detect a dead
/// link, and reconnects with backoff whenever the connection drops or the
/// server is not up yet. Messages are decoded JSON objects.
@MainActor
final class KuitoDevSocket {
    var onState: ((KuitoConnectionState) -> Void)?
    var onMessage: (([String: Any]) -> Void)?
    /// Called once each time a connection is established.
    var onOpen: (() -> Void)?

    private(set) var state = KuitoConnectionState.connecting {
        didSet { onState?(state) }
    }

    private let url: URL
    private let session: URLSession
    private var socket: URLSessionWebSocketTask?
    private var reader: Task<Void, Never>?
    private var pinger: Task<Void, Never>?
    private var retry: Task<Void, Never>?
    private var attempt = 0
    private var stopped = false

    init(url: URL) {
        self.url = url

        let configuration = URLSessionConfiguration.default

        // A dev socket idles between edits; liveness comes from pings instead.
        configuration.timeoutIntervalForRequest = 3600
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)
    }

    func start() {
        stopped = false
        attempt = 0
        state = .connecting
        open()
    }

    func stop() {
        stopped = true
        teardown()
        session.invalidateAndCancel()
    }

    func send(_ message: [String: Any]) {
        guard let socket, let data = try? JSONSerialization.data(withJSONObject: message) else { return }

        socket.send(.string(String(decoding: data, as: UTF8.self))) { _ in }
    }

    /// A retry stays `.retrying` until the link is up, so `.connected` after
    /// `.retrying` reads as a reconnect.
    private func open() {
        teardown()

        let socket = session.webSocketTask(with: KuitoInspector.devRequest(to: url))

        socket.maximumMessageSize = 64 * 1024 * 1024
        self.socket = socket
        socket.resume()

        // The first ping's reply proves the link before any message arrives.
        socket.sendPing { [weak self] error in
            Task { @MainActor in
                guard let self, self.socket === socket else { return }

                if let error { return self.dropped(socket, reason: error.localizedDescription) }

                self.attempt = 0
                self.state = .connected
                self.onOpen?()
            }
        }

        reader = Task { [weak self] in
            do {
                while !Task.isCancelled {
                    let message = try await socket.receive()
                    let data: Data

                    switch message {
                    case .string(let text): data = Data(text.utf8)
                    case .data(let bytes): data = bytes
                    @unknown default: continue
                    }

                    if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self?.onMessage?(object)
                    }
                }
            } catch {
                self?.dropped(socket, reason: error.localizedDescription)
            }
        }

        pinger = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)

                guard !Task.isCancelled else { return }

                socket.sendPing { error in
                    guard let error else { return }

                    Task { @MainActor in self?.dropped(socket, reason: error.localizedDescription) }
                }
            }
        }
    }

    /// What the devtools show when the server answers 401: the app holds another session's token.
    static let refusedToken = "The dev server refused this app's token. Relaunch it from kuito dev."

    /// Only the current socket's failure schedules a retry.
    private func dropped(_ socket: URLSessionWebSocketTask, reason: String) {
        guard !stopped, self.socket === socket else { return }

        // A 401 is not a dead link: the server is up, and wants the session's token.
        let reason = (socket.response as? HTTPURLResponse)?.statusCode == 401 ? Self.refusedToken : reason

        teardown()

        let delay = min(0.5 * pow(2, Double(attempt)), 5)

        attempt += 1
        state = .retrying(delay: delay, reason: reason)
        retry = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            guard !Task.isCancelled else { return }

            self?.open()
        }
    }

    private func teardown() {
        reader?.cancel()
        pinger?.cancel()
        retry?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        reader = nil
        pinger = nil
        retry = nil
        socket = nil
    }
}
