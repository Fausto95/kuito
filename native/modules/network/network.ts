import { defineModule, fn, live } from '../../../src/native/define-module';

/** The transport of the network the system routes traffic through. */
export type NetworkStateType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export type CellularGeneration = '2g' | '3g' | '4g' | '5g';

export type NetworkDetails = {
  /** Traffic may cost the user: cellular, a hotspot, or a network marked metered. */
  isExpensive: boolean;
  /** The radio's generation on cellular; null elsewhere or when the platform won't say. */
  cellularGeneration: CellularGeneration | null;
};

export type NetworkState = {
  type: NetworkStateType;
  /** A network is up. It may still lack internet access, as behind a captive portal. */
  isConnected: boolean;
  /** The platform judges the network usable for the internet (docs/network.md). */
  isInternetReachable: boolean;
  details: NetworkDetails;
};

// The device's network: NWPathMonitor on iOS, ConnectivityManager on Android
// (docs/network.md).
export default defineModule('Network', {
  /** The network now. Watched, it follows each change; the platform monitors only then. */
  state: live<NetworkState>(),
  /** Re-reads the state off the JS thread, for a check right before a request. */
  refresh: fn.background<() => Promise<NetworkState>>(),
  ios: { class: 'KuitoNetworkModule' },
  android: {
    class: 'dev.kuito.runtime.modules.network.KuitoNetworkModule',
    permissions: ['android.permission.ACCESS_NETWORK_STATE'],
  },
});
