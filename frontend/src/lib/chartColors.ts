/**
 * Chart color tokens, following the categorical/sequential/diverging/status
 * separation from the design system's data-viz guidelines. Hues and ordering
 * are taken from the validated reference palette (fixed adjacent order —
 * never cycled arbitrarily) and re-surfaced for this app's white/slate
 * light-mode chart backgrounds. Dark-mode chart theming is a documented
 * follow-up (see README) — the app itself only ships a light theme for now.
 */

// Categorical — fixed order, one series = one slot. Never reassigned by rank/filter.
export const CATEGORICAL = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

// Sequential — single hue, light -> dark, for magnitude (heatmaps, intensity).
export const SEQUENTIAL_BLUE = [
  '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b',
] as const;

// Diverging — blue (negative) <-> red (positive), neutral gray midpoint.
export const DIVERGING = { negative: '#2a78d6', neutral: '#f0efec', positive: '#e34948' };

// Status — fixed roles, never reused as a categorical series. Always paired with icon + label.
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

// Sentiment pulse — a dedicated valence pair (green=positive/red=negative morale),
// distinct from DIVERGING above: DIVERGING encodes numeric *direction*
// (negative=blue/positive=red, e.g. a compensation delta), not good/bad valence,
// so reusing it here would color positive morale red. Reuses STATUS.good/critical's
// hex values to stay in the app's existing status vocabulary.
export const SENTIMENT_PULSE = { negative: STATUS.critical, neutral: '#94a3b8', positive: STATUS.good };

export const CHROME = {
  surface: '#ffffff',
  page: '#f8fafc', // tailwind slate-50, close to page plane
  primaryInk: '#0b0b0b',
  secondaryInk: '#52514e',
  mutedInk: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
};

export function categoricalColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length]!;
}
