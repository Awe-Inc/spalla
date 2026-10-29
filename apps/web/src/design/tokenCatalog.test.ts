import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ANIMATIONS, colorTokenNames, DURATIONS, EASINGS, FONTS, RADII, SHADOWS, TEXT_SCALE } from "./tokenCatalog";

const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");
const theme = css.slice(css.indexOf("@theme inline"), css.indexOf("@layer base"));

function themeTokens(prefix: string): string[] {
  const pattern = new RegExp(`--${prefix}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, "g");
  return [...new Set([...theme.matchAll(pattern)].map((match) => match[1] ?? ""))];
}

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((match) => [match[1] ?? "", match[2] ?? ""]));
}

const light = block(":root");
const dark = { ...light, ...block('[data-theme="dark"]') };
const ebanoLight = { ...light, ...block('[data-accent="sepia"]') };
const ebanoDark = { ...dark, ...block('[data-accent="sepia"][data-theme="dark"]') };
const PALETTES = { "abeto claro": light, "abeto escuro": dark, "ébano claro": ebanoLight, "ébano escuro": ebanoDark };

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a) + 0.05, luminance(b) + 0.05].sort((x, y) => y - x);
  return (high ?? 1) / (low ?? 1);
}

function color(palette: Record<string, string>, name: string): string {
  const value = palette[name];
  if (!value) throw new Error(`token --${name} sem valor`);
  return value;
}

describe("tokenCatalog", () => {
  it("lists every colour token declared in tokens.css, and nothing else", () => {
    expect(colorTokenNames().sort()).toEqual(themeTokens("color").sort());
  });

  it("lists every font, text size, radius, shadow, duration, easing and animation", () => {
    expect(FONTS.map((font) => font.name).sort()).toEqual(themeTokens("font").sort());
    expect(TEXT_SCALE.map((size) => size.name).sort()).toEqual(themeTokens("text").sort());
    expect(RADII.map((radius) => radius.name).sort()).toEqual(themeTokens("radius").sort());
    expect(SHADOWS.map((shadow) => shadow.name).sort()).toEqual(themeTokens("shadow").sort());
    expect(DURATIONS.map((duration) => duration.name).sort()).toEqual(themeTokens("duration").sort());
    expect(EASINGS.map((easing) => easing.name).sort()).toEqual(themeTokens("ease").sort());
    expect(ANIMATIONS.map((animation) => animation.name).sort()).toEqual(themeTokens("animate").sort());
  });

  it("never carries a raw colour value: the swatch is a class, the value lives in the CSS", () => {
    const names = colorTokenNames();
    expect(names.every((name) => !/#|rgb|oklch/.test(name))).toBe(true);
  });
});

describe.each(Object.entries(PALETTES))("contraste do tema %s", (_, palette) => {
  const surfaces = ["canvas", "surface", "surface-soft"].map((name) => color(palette, name));

  it("keeps body text at 7:1 and secondary text at 4.5:1 on every surface", () => {
    for (const surface of surfaces) {
      expect(contrast(color(palette, "ink"), surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(color(palette, "ink-muted"), surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color(palette, "ink-subtle"), surface)).toBeGreaterThanOrEqual(4.4);
    }
  });

  it("lets the primary work as text and carry its own label", () => {
    for (const surface of surfaces) expect(contrast(color(palette, "primary"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color(palette, "on-primary"), color(palette, "primary"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps tuning colours and strings visible at 3:1 on the card", () => {
    for (const name of ["in-tune", "close", "off", "info", "string-g", "string-d", "string-a", "string-e"]) {
      expect(contrast(color(palette, name), color(palette, "surface"))).toBeGreaterThanOrEqual(3);
    }
  });

  it("separates the four strings by lightness, not only by hue", () => {
    const levels = ["string-g", "string-d", "string-a", "string-e"].map((name) => luminance(color(palette, name)) + 0.05).sort((a, b) => a - b);
    for (let index = 1; index < levels.length; index += 1) {
      expect((levels[index] ?? 0) / (levels[index - 1] ?? 1)).toBeGreaterThanOrEqual(1.2);
    }
  });
});
