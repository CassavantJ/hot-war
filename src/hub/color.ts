export type Rgb = readonly [number, number, number];

/** OKLCH (l 0–1, c ≥ 0, h in degrees) to gamma-encoded sRGB channels in 0–1, clamped to gamut. */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;

  return [
    encode(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    encode(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    encode(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  ];
}

export function toHex(rgb: Rgb): string {
  const byte = (channel: number) => Math.round(channel * 255).toString(16);
  return `#${rgb.map((channel) => byte(channel).padStart(2, '0')).join('')}`;
}

/** WCAG contrast ratio between two sRGB colors. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function encode(linear: number): number {
  const gamma = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.min(Math.max(gamma, 0), 1);
}
