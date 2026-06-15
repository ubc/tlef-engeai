/**
 * struggle-chart-palette.ts
 * @description Chart-only colors for struggle-topic stacked bars and legends.
 * Keep in sync with {@link public/scripts/ui/charts.ts} PALETTE_FALLBACK.
 */

/** Distinct hues — avoids EngE brand CSS vars (--color-chbe-green, --color-ubc-blue, --color-eng-red, --color-navy-blue). */
export const STRUGGLE_CHART_PALETTE = [
    '#E87B35',
    '#5B8DEF',
    '#7B5EA7',
    '#3D9970',
    '#D4536E',
    '#4A9EAE',
    '#C9A227',
    '#6B8E23',
    '#9B59B6',
    '#2ECC71',
    '#E84393',
    '#3498DB',
    '#F39C12',
    '#1ABC9C',
    '#8E44AD',
    '#D35400'
] as const;

/** Max distinct series stacked per chapter before additional labels bucket into Other. */
export const STRUGGLE_CHAPTER_SERIES_CAP = 8;

export const STRUGGLE_OTHER_LABEL = 'Other';
export const STRUGGLE_OTHER_COLOR = '#9CA3AF';

/**
 * Returns a distinct chart color for a label at global catalog index.
 * Primary palette for low indices; deterministic HSL for larger catalogs.
 */
export function getStruggleLabelColor(index: number): string {
    if (index < STRUGGLE_CHART_PALETTE.length) {
        return STRUGGLE_CHART_PALETTE[index];
    }
    const hue = (index * 37) % 360;
    return `hsl(${hue}, 52%, 45%)`;
}

/** Assigns a unique color to every label in stable order. */
export function assignStruggleLabelColors(labels: readonly string[]): Map<string, string> {
    const colors = new Map<string, string>();
    for (let i = 0; i < labels.length; i++) {
        colors.set(labels[i], getStruggleLabelColor(i));
    }
    return colors;
}
