/** Records that a route module ran: the test reads `routeModules` from the app's global. */
export function evaluated(route: string) {
  const host = globalThis as { routeModules?: string[] };

  host.routeModules = [...(host.routeModules ?? []), route];
}
