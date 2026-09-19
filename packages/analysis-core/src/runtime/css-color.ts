/**
 * CSS color parsing for runtime contrast measurement.
 *
 * `getComputedStyle` serializes colors differently per Chromium build
 * (legacy comma `rgb()` vs space syntax vs `lab()`/`oklab()`/`color()` for
 * `color-mix()` values), and measurement code that only understands legacy
 * syntax silently skips elements on some stacks — identical pages then yield
 * different findings per environment. This parser understands every
 * serialization Chromium emits and normalizes to sRGB so both stacks measure
 * the same values.
 *
 * Pure + self-contained: everything lives INSIDE the exported function so
 * `parseCssColor.toString()` serializes complete (nested declarations travel
 * with the source; module-scope siblings would be dangling references in
 * the page — see browser-src-robustness conventions). Hue-based spaces
 * (`hsl`, `lch`, `oklch`) and wide-gamut `color()` spaces other than sRGB
 * are intentionally unparsed (`null`): `getComputedStyle` never returns
 * them, and guessing would corrupt contrast ratios.
 */

export interface ParsedCssColor {
  rgb: [number, number, number];
  /** 0 (fully transparent) to 1 (opaque). */
  alpha: number;
}

export function parseCssColor(value: string): ParsedCssColor | null {
  function clamp255(n: number): number {
    if (Number.isNaN(n)) return 0;
    if (n <= 0) return 0;
    if (n >= 255) return 255;
    return Math.round(n);
  }

  function clamp01(n: number): number {
    if (Number.isNaN(n)) return 1;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
  }

  /** `0.5` or `50%` → 0..1. */
  function parseAlphaToken(token: string | undefined): number {
    if (token === undefined) return 1;
    const text = token.trim();
    if (text.endsWith("%")) return clamp01(Number(text.slice(0, -1)) / 100);
    return clamp01(Number(text));
  }

  /** `255` or `100%` → 0..255. */
  function parseRgbComponent(token: string): number {
    const text = token.trim();
    if (text.endsWith("%"))
      return clamp255((Number(text.slice(0, -1)) / 100) * 255);
    return clamp255(Number(text));
  }

  function linearToSrgbByte(channel: number): number {
    const clamped = channel <= 0 ? 0 : channel;
    const v =
      clamped <= 0.0031308
        ? clamped * 12.92
        : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return clamp255(v * 255);
  }

  /** CIELAB (D50 white point) → sRGB bytes via Bradford-adapted D65 matrix. */
  function labToRgb(
    lPercent: number,
    a: number,
    b: number,
  ): [number, number, number] {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    const fy = (lPercent + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const fx3 = fx ** 3;
    const fz3 = fz ** 3;
    // D50 white point, 0..100 scale.
    const x = 96.422 * (fx3 > epsilon ? fx3 : (116 * fx - 16) / kappa);
    const y = 100 * (lPercent > kappa * epsilon ? fy ** 3 : lPercent / kappa);
    const z = 82.521 * (fz3 > epsilon ? fz3 : (116 * fz - 16) / kappa);
    // Bradford chromatic adaptation D50 → D65 (linear, scale-invariant),
    // then XYZ → linear sRGB, 0..1 inputs. Matrix verified: maps D50 white
    // (96.422, 100, 82.521) exactly to D65 white (95.047, 100, 108.883).
    const xn = (0.9555767 * x - 0.0230393 * y + 0.0631637 * z) / 100;
    const yn = (-0.0282895 * x + 1.0099416 * y + 0.0210077 * z) / 100;
    const zn = (0.0122982 * x - 0.020483 * y + 1.3299099 * z) / 100;
    const r = 3.2404542 * xn - 1.5371385 * yn - 0.4985314 * zn;
    const g = -0.969266 * xn + 1.8760108 * yn + 0.041556 * zn;
    const bl = 0.0556434 * xn - 0.2040259 * yn + 1.0572252 * zn;
    return [linearToSrgbByte(r), linearToSrgbByte(g), linearToSrgbByte(bl)];
  }

  /** Oklab → linear sRGB (Bottosson) → sRGB bytes. */
  function oklabToRgb(
    l: number,
    a: number,
    b: number,
  ): [number, number, number] {
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ ** 3;
    const m3 = m_ ** 3;
    const s3 = s_ ** 3;
    const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
    return [linearToSrgbByte(r), linearToSrgbByte(g), linearToSrgbByte(bl)];
  }

  function splitAlphaTail(body: string): {
    values: string;
    alpha: string | undefined;
  } {
    const slash = body.lastIndexOf("/");
    if (slash === -1) return { values: body, alpha: undefined };
    return {
      values: body.slice(0, slash),
      alpha: body.slice(slash + 1),
    };
  }

  function splitComponents(values: string): string[] {
    if (values.includes(","))
      return values.split(",").map((part) => part.trim());
    return values
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);
  }

  const text = value.trim().toLowerCase();
  if (text === "") return null;
  if (text === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  if (text === "currentcolor") return null;

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hexMatch) {
    const hex = hexMatch[1] as string;
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : hex;
    return {
      rgb: [
        clamp255(Number.parseInt(full.slice(0, 2), 16)),
        clamp255(Number.parseInt(full.slice(2, 4), 16)),
        clamp255(Number.parseInt(full.slice(4, 6), 16)),
      ],
      alpha: 1,
    };
  }

  const fnMatch = /^([a-z-]+)\((.*)\)$/i.exec(value.trim());
  if (!fnMatch) return null;
  const name = (fnMatch[1] as string).toLowerCase();
  const { values, alpha } = splitAlphaTail(fnMatch[2] as string);
  const parts = splitComponents(values);

  if (name === "rgb" || name === "rgba") {
    if (parts.length < 3) return null;
    return {
      rgb: [
        parseRgbComponent(parts[0] as string),
        parseRgbComponent(parts[1] as string),
        parseRgbComponent(parts[2] as string),
      ],
      alpha: parseAlphaToken(alpha ?? parts[3]),
    };
  }

  if (name === "lab" || name === "oklab") {
    if (parts.length < 3) return null;
    const first = (parts[0] as string).trim();
    const l =
      name === "lab"
        ? first.endsWith("%")
          ? Number(first.slice(0, -1))
          : Number(first)
        : first.endsWith("%")
          ? Number(first.slice(0, -1)) / 100
          : Number(first);
    const a = Number((parts[1] as string).trim());
    const b = Number((parts[2] as string).trim());
    if (Number.isNaN(l) || Number.isNaN(a) || Number.isNaN(b)) return null;
    const rgb = name === "lab" ? labToRgb(l, a, b) : oklabToRgb(l, a, b);
    return { rgb, alpha: parseAlphaToken(alpha ?? parts[3]) };
  }

  if (name === "color") {
    if (parts.length < 4) return null;
    const space = (parts[0] as string).toLowerCase();
    // Only sRGB is directly mappable; wide-gamut spaces stay unparsed.
    if (space !== "srgb") return null;
    const channel = (token: string): number => {
      const t = token.trim();
      if (t.endsWith("%"))
        return clamp255((Number(t.slice(0, -1)) / 100) * 255);
      return clamp255(Number(t) * 255);
    };
    return {
      rgb: [
        channel(parts[1] as string),
        channel(parts[2] as string),
        channel(parts[3] as string),
      ],
      alpha: parseAlphaToken(alpha ?? parts[4]),
    };
  }

  return null;
}
