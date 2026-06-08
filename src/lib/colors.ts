/**
 * Curated palette for categories — neutrals + low-saturation pastels.
 * Stays cohesive with the app's clean Linear/Things-style aesthetic.
 */
export interface CategoryColor {
  key: string;
  label: string;
  dot: string;     // mid-saturation, used for the small color dot
  soft: string;    // pastel background for category chips
  border: string;  // slightly stronger than dot, for outlines
}

export const CATEGORY_COLORS: CategoryColor[] = [
  { key: "stone",  label: "Stone",  dot: "oklch(65% 0.02 60)",   soft: "oklch(96% 0.01 60)",   border: "oklch(78% 0.02 60)"   },
  { key: "sand",   label: "Sand",   dot: "oklch(74% 0.08 80)",   soft: "oklch(96% 0.04 80)",   border: "oklch(82% 0.08 80)"   },
  { key: "sage",   label: "Sage",   dot: "oklch(68% 0.07 150)",  soft: "oklch(95% 0.04 150)",  border: "oklch(78% 0.07 150)"  },
  { key: "sky",    label: "Sky",    dot: "oklch(68% 0.09 235)",  soft: "oklch(95% 0.04 235)",  border: "oklch(78% 0.09 235)"  },
  { key: "rose",   label: "Rose",   dot: "oklch(72% 0.09 15)",   soft: "oklch(96% 0.04 15)",   border: "oklch(80% 0.09 15)"   },
  { key: "violet", label: "Violet", dot: "oklch(68% 0.10 295)",  soft: "oklch(95% 0.05 295)",  border: "oklch(78% 0.10 295)"  },
  { key: "coral",  label: "Coral",  dot: "oklch(72% 0.10 35)",   soft: "oklch(96% 0.05 35)",   border: "oklch(80% 0.10 35)"   },
  { key: "mist",   label: "Mist",   dot: "oklch(68% 0.04 250)",  soft: "oklch(95% 0.02 250)",  border: "oklch(78% 0.04 250)"  },
];

const BY_KEY: Record<string, CategoryColor> = Object.fromEntries(
  CATEGORY_COLORS.map((c) => [c.key, c]),
);

export function colorByKey(key: string | null | undefined): CategoryColor | null {
  if (!key) return null;
  return BY_KEY[key] ?? null;
}

export function defaultColorKey(): string {
  return CATEGORY_COLORS[0].key;
}
