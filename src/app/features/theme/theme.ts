export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** A stored theme, or null when none was picked (the device's then) or it is not one of ours */
export const parseTheme = (value: string | null): Theme | null =>
  value === "light" || value === "dark" ? value : null;

export const other = (theme: Theme): Theme => (theme === "light" ? "dark" : "light");

/**
 * How far a circle centred at (x, y) must grow to cover a `width` × `height` screen: to its
 * farthest corner
 */
export const coverRadius = (x: number, y: number, width: number, height: number) =>
  Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
