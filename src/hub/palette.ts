import { oklchToRgb, type Rgb } from './color';

/**
 * One color per month, like the original: it changes on the 1st. Colors are OKLCH so the
 * background ramp keeps the same perceived brightness across hues. `l` is the lightness of the
 * brightest background stop; warm hues sit a little higher so they read as gold rather than olive.
 */
export const THEMES = [
  { id: 'silver', name: 'Silver', l: 0.5, c: 0.012, h: 250 },
  { id: 'gold', name: 'Gold', l: 0.5, c: 0.1, h: 90 },
  { id: 'lime', name: 'Lime', l: 0.48, c: 0.12, h: 128 },
  { id: 'pink', name: 'Pink', l: 0.46, c: 0.11, h: 355 },
  { id: 'green', name: 'Green', l: 0.44, c: 0.11, h: 150 },
  { id: 'violet', name: 'Violet', l: 0.44, c: 0.12, h: 295 },
  { id: 'teal', name: 'Teal', l: 0.46, c: 0.09, h: 195 },
  { id: 'blue', name: 'Blue', l: 0.44, c: 0.12, h: 250 },
  { id: 'purple', name: 'Purple', l: 0.42, c: 0.13, h: 320 },
  { id: 'amber', name: 'Amber', l: 0.5, c: 0.11, h: 70 },
  { id: 'bronze', name: 'Bronze', l: 0.44, c: 0.07, h: 55 },
  { id: 'red', name: 'Red', l: 0.42, c: 0.14, h: 25 },
] as const;

export type Theme = (typeof THEMES)[number];
export type ThemeId = Theme['id'];
/** What the user picked in Settings: follow the calendar, or pin one color. */
export type ThemeChoice = 'monthly' | ThemeId;

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** `month` is 0-based, as from `Date#getMonth`. */
export function themeForMonth(month: number): Theme {
  return THEMES[((month % 12) + 12) % 12] ?? THEMES[0];
}

export function resolveTheme(choice: ThemeChoice, month: number): Theme {
  if (choice === 'monthly') return themeForMonth(month);
  return THEMES.find((theme) => theme.id === choice) ?? themeForMonth(month);
}

/** The brightest background stop, as sRGB (for contrast checks and the browser theme color). */
export function backgroundTop(theme: Theme): Rgb {
  return oklchToRgb(theme.l, theme.c, theme.h);
}

/** A near-white tint of the theme for the wave highlights. */
export function waveTint(theme: Theme): Rgb {
  return oklchToRgb(0.9, theme.c * 0.5, theme.h);
}

/** A mid-brightness swatch for pickers. */
export function swatchColor(theme: Theme): string {
  return `oklch(0.62 ${theme.c * 1.2} ${theme.h})`;
}
