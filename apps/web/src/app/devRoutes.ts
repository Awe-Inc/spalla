import type { RouteObject } from "react-router";

export function devOnlyRoutes(isDev: boolean): RouteObject[] {
  if (!isDev) return [];
  return [{ path: "componentes", lazy: async () => ({ Component: (await import("@/areas/componentes/ComponentesPage")).ComponentesPage }) }];
}
