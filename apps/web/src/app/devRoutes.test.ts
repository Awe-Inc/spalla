import { describe, expect, it } from "vitest";

import { devOnlyRoutes } from "./devRoutes";

describe("devOnlyRoutes", () => {
  it("leaves the design system out of the production build", () => {
    expect(devOnlyRoutes(false)).toEqual([]);
  });

  it("serves the design system only while developing", () => {
    expect(devOnlyRoutes(true).map((route) => route.path)).toEqual(["componentes"]);
  });
});
