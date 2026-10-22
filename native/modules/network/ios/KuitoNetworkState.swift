import CoreTelephony
import Network

/// `NetworkState` in native/modules/network/network.ts, read from an `NWPath`.
/// Equatable, unlike the generated struct, so the monitor sends only changes.
struct KuitoNetworkState: Equatable {
    let type: NetworkStateType
    let isConnected: Bool
    let isInternetReachable: Bool
    let isExpensive: Bool
    let cellularGeneration: CellularGeneration?

    static let unknown = KuitoNetworkState(
        type: .unknown, isConnected: false, isInternetReachable: false, isExpensive: false, cellularGeneration: nil
    )

    private static let interfaces: [(NWInterface.InterfaceType, NetworkStateType)] = [
        (.wifi, .wifi), (.cellular, .cellular), (.wiredEthernet, .ethernet),
    ]

    private static let generations: [String: CellularGeneration] = [
        CTRadioAccessTechnologyGPRS: ._2g,
        CTRadioAccessTechnologyEdge: ._2g,
        CTRadioAccessTechnologyCDMA1x: ._2g,
        CTRadioAccessTechnologyWCDMA: ._3g,
        CTRadioAccessTechnologyHSDPA: ._3g,
        CTRadioAccessTechnologyHSUPA: ._3g,
        CTRadioAccessTechnologyCDMAEVDORev0: ._3g,
        CTRadioAccessTechnologyCDMAEVDORevA: ._3g,
        CTRadioAccessTechnologyCDMAEVDORevB: ._3g,
        CTRadioAccessTechnologyeHRPD: ._3g,
        CTRadioAccessTechnologyLTE: ._4g,
        CTRadioAccessTechnologyNRNSA: ._5g,
        CTRadioAccessTechnologyNR: ._5g,
    ]

    /// As it crosses to JavaScript.
    var linked: NetworkState {
        NetworkState(
            type: type,
            isConnected: isConnected,
            isInternetReachable: isInternetReachable,
            details: NetworkDetails(isExpensive: isExpensive, cellularGeneration: cellularGeneration)
        )
    }

    // `requiresConnection` is a path that comes up on demand (a VPN on demand,
    // a cellular link that is asleep): connected, not yet usable.
    init(_ path: NWPath, telephony: CTTelephonyNetworkInfo) {
        let type: NetworkStateType = path.status == .unsatisfied
            ? .none
            : Self.interfaces.first { path.usesInterfaceType($0.0) }?.1 ?? .unknown

        self.init(
            type: type,
            isConnected: path.status != .unsatisfied,
            isInternetReachable: path.status == .satisfied,
            isExpensive: path.isExpensive,
            cellularGeneration: type == .cellular ? Self.generation(telephony) : nil
        )
    }

    private init(
        type: NetworkStateType, isConnected: Bool, isInternetReachable: Bool, isExpensive: Bool,
        cellularGeneration: CellularGeneration?
    ) {
        self.type = type
        self.isConnected = isConnected
        self.isInternetReachable = isInternetReachable
        self.isExpensive = isExpensive
        self.cellularGeneration = cellularGeneration
    }

    private static func generation(_ telephony: CTTelephonyNetworkInfo) -> CellularGeneration? {
        guard let service = telephony.dataServiceIdentifier,
              let technology = telephony.serviceCurrentRadioAccessTechnology?[service]
        else { return nil }

        return generations[technology]
    }
}
