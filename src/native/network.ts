import Network, {
  type CellularGeneration as Generation,
  type NetworkDetails as Details,
  type NetworkState as State,
  type NetworkStateType as StateType,
} from '../../native/modules/network/network';

/** The transport of the network the system routes traffic through. */
export type NetworkStateType = StateType;

export type CellularGeneration = Generation;

export type NetworkDetails = Details;

export type NetworkState = State;

// The device's network: NWPathMonitor on iOS, ConnectivityManager on Android
// (docs/network.md).

/** The network now. Watched, it follows each change; the platform monitors only then. */
export const state = Network.state;

/** Re-reads the state off the JS thread, for a check right before a request. */
export const refresh = Network.refresh;
