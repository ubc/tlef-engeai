import {
    assignStruggleLabelColors,
    getStruggleLabelColor,
    STRUGGLE_CHART_PALETTE
} from '../struggle-chart-palette';

describe('struggle-chart-palette', () => {
    it('assigns distinct colors for 20 labels', () => {
        const labels = Array.from({ length: 20 }, (_, i) => `Label ${i + 1}`);
        const colors = assignStruggleLabelColors(labels);
        const values = labels.map((label) => colors.get(label));

        expect(values.length).toBe(20);
        expect(new Set(values).size).toBe(20);
    });

    it('uses HSL fallback beyond primary palette without reusing palette slot 0', () => {
        const indexBeyondPalette = STRUGGLE_CHART_PALETTE.length + 2;
        const color = getStruggleLabelColor(indexBeyondPalette);

        expect(color).toMatch(/^hsl\(/);
        expect(color).not.toBe(STRUGGLE_CHART_PALETTE[0]);
    });

    it('maps indices 8–15 to expanded palette slots', () => {
        for (let i = 8; i < STRUGGLE_CHART_PALETTE.length; i++) {
            expect(getStruggleLabelColor(i)).toBe(STRUGGLE_CHART_PALETTE[i]);
        }
    });
});
