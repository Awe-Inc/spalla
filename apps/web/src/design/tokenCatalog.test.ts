import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { colorTokenNames, DURATIONS, EASINGS, FONTS, RADII, SHADOWS, TEXT_SCALE } from "./tokenCatalog";

const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");
const theme = css.slice(css.indexOf("@theme inline"), css.indexOf("@layer base"));

function themeTokens(prefix: string): string[] {
  const pattern = new RegExp(`--${prefix}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, "g");
  return [...new Set([...theme.matchAll(pattern)].map((match) => match[1] ?? ""))];
}

describe("tokenCatalog", () => {
  it("lists every colour token declared in tokens.css, and nothing else", () => {
    expect(colorTokenNames().sort()).toEqual(themeTokens("color").sort());
  });

  it("lists every font, text size, radius, shadow, duration and easing", () => {
    expect(FONTS.map((font) => font.name).sort()).toEqual(themeTokens("font").sort());
    expect(TEXT_SCALE.map((size) => size.name).sort()).toEqual(themeTokens("text").sort());
    expect(RADII.map((radius) => radius.name).sort()).toEqual(themeTokens("radius").sort());
    expect(SHADOWS.map((shadow) => shadow.name).sort()).toEqual(themeTokens("shadow").sort());
    expect(DURATIONS.map((duration) => duration.name).sort()).toEqual(themeTokens("duration").sort());
    expect(EASINGS.map((easing) => easing.name).sort()).toEqual(themeTokens("ease").sort());
  });

  it("never carries a raw colour value: the swatch is a class, the value lives in the CSS", () => {
    const names = colorTokenNames();
    expect(names.every((name) => !/#|rgb|oklch/.test(name))).toBe(true);
  });
});
