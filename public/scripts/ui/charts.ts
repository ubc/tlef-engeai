/**
 * @fileoverview Chart creation helpers — modular graph layer for features (course summary, reports, etc.).
 *
 * ## Design (singleton)
 *
 * - **Single entry point:** `ChartsController` via {@link ChartsController.getInstance} and
 *   {@link chartsController}.
 * - **Library loading:** Chart.js is installed as the **`chart.js` npm package** and copied into
 *   `public/vendor/chart.js/chart.umd.js` by `npm run vendor:chart` (runs before `build:frontend` /
 *   `dev:frontend`). The page loads that **same-origin** script (no CDN).
 *   {@link ChartsController.ensureLibraryLoaded} injects the script once and resolves when `window.Chart` exists.
 * - **Instance lifecycle:** The controller keeps one **active** chart instance and destroys it before
 *   creating another. Extend later with a `Map` if multiple live charts are needed.
 *
 * ## Neutrality
 *
 * Types (`StackedBarCategory`, `StackedBarSeries`, etc.) are **UI-layer DTOs**. Features map API/domain
 * shapes into {@link StackedBarChartSpec} so this module stays free of feature imports.
 *
 * @module ui/charts
 */

declare global {
    interface Window {
        /** Chart.js constructor after the UMD script loads. */
        Chart?: any;
    }
}

/** Same-origin URL for the UMD bundle (file is produced by `npm run vendor:chart`). */
export const DEFAULT_CHART_VENDOR_PATH = '/vendor/chart.js/chart.umd.js';

/** One bucket on the category axis (e.g. course week or topic). */
export interface StackedBarCategory {
    id: string;
    label: string;
    order: number;
}

/** One value cell: numeric height + tooltip line for a category. */
export interface StackedBarDatum {
    categoryId: string;
    value: number;
    tooltip: string;
}

/** One stacked series (e.g. one struggle theme color). */
export interface StackedBarSeries {
    label: string;
    color: string;
    data: StackedBarDatum[];
}

/** Input spec for a stacked bar chart (Chart.js `type: 'bar'`, stacked on category axis). */
export interface StackedBarChartSpec {
    categories: StackedBarCategory[];
    series: StackedBarSeries[];
    xAxisLabel: string;
    yAxisLabel: string;
    /** Shared stack id so Chart.js stacks segments together. */
    stackId?: string;
}

const PALETTE_FALLBACK = [
    '#4D7A2F',
    '#2F5F8F',
    '#C9822B',
    '#8B0000',
    '#6F5AA7',
    '#2F7D7E'
] as const;

/**
 * Singleton controller for loading Chart.js and rendering chart instances.
 *
 * **Responsibilities:**
 * - Lazy-load Chart.js UMD from the vendored path once per page.
 * - Destroy and replace the active chart when a feature requests a new render.
 * - Centralize default colors and stacked-bar options.
 *
 * **Non-responsibilities:** fetching or shaping analytics data (callers build {@link StackedBarChartSpec}).
 */
export class ChartsController {
    private static instance: ChartsController | null = null;

    /** Last Chart.js instance created by this controller. */
    private activeChart: any | null = null;

    private constructor() {
        // Singleton — use getInstance().
    }

    /**
     * Returns the shared charts controller instance.
     */
    static getInstance(): ChartsController {
        if (!ChartsController.instance) {
            ChartsController.instance = new ChartsController();
        }
        return ChartsController.instance;
    }

    /**
     * Ensures Chart.js is available on `window.Chart`. Injects a single `<script>` for `scriptUrl`
     * if needed, then waits until the global constructor exists.
     *
     * @param scriptUrl - Absolute path on this origin; defaults to {@link DEFAULT_CHART_VENDOR_PATH}.
     */
    async ensureLibraryLoaded(scriptUrl: string = DEFAULT_CHART_VENDOR_PATH): Promise<void> {
        if (window.Chart) {
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
        if (existingScript) {
            await this.waitForChartJs();
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`[ChartsController] Failed to load Chart.js from ${scriptUrl}`));
            document.head.appendChild(script);
        });

        await this.waitForChartJs();
    }

    /**
     * Destroys the active chart instance if present and clears the reference.
     */
    destroyActiveChart(): void {
        if (this.activeChart) {
            this.activeChart.destroy();
            this.activeChart = null;
        }
    }

    /**
     * Renders a stacked bar chart on `canvas` from `spec`, replacing any previous active chart.
     * Calls {@link ChartsController.ensureLibraryLoaded} first. No-op if `canvas` is null or Chart.js failed to load.
     */
    async renderStackedBarChart(canvas: HTMLCanvasElement | null, spec: StackedBarChartSpec): Promise<void> {
        await this.ensureLibraryLoaded();

        if (!canvas || !window.Chart) {
            return;
        }

        const categories = [...(spec.categories ?? [])].sort((a, b) => a.order - b.order);
        if (categories.length === 0 || !(spec.series?.length)) {
            this.destroyActiveChart();
            return;
        }

        this.destroyActiveChart();

        const labels = categories.map((c) => c.label);
        const stackId = spec.stackId ?? 'stack';

        const datasets = spec.series.map((series, index) => ({
            label: series.label,
            data: categories.map((category) => {
                const cell = series.data.find((d) => d.categoryId === category.id);
                return cell?.value ?? 0;
            }),
            backgroundColor: this.resolveSeriesColor(series.color, index),
            borderColor: '#ffffff',
            borderWidth: 1.5,
            borderRadius: 5,
            borderSkipped: false,
            barPercentage: 0.72,
            categoryPercentage: 0.78,
            stack: stackId,
            _tooltips: categories.map((category) => {
                const cell = series.data.find((d) => d.categoryId === category.id);
                return cell?.tooltip ?? `${series.label}: 0`;
            })
        }));

        this.activeChart = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 14,
                            boxHeight: 14,
                            padding: 16,
                            color: '#222',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.94)',
                        titleFont: {
                            size: 13,
                            weight: '700'
                        },
                        bodyFont: {
                            size: 12
                        },
                        padding: 10,
                        callbacks: {
                            label: (context: any) => {
                                const dataset = context.dataset;
                                const line = dataset._tooltips?.[context.dataIndex];
                                return line || `${dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#333',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        },
                        title: {
                            display: true,
                            text: spec.xAxisLabel,
                            color: '#333',
                            font: {
                                size: 13,
                                weight: '700'
                            }
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.08)'
                        },
                        ticks: {
                            precision: 0,
                            color: '#333',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        },
                        title: {
                            display: true,
                            text: spec.yAxisLabel,
                            color: '#333',
                            font: {
                                size: 13,
                                weight: '700'
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Returns `providedColor` if non-empty; otherwise a color from the shared fallback palette.
     *
     * @param providedColor - Hex/CSS from data, may be empty.
     * @param paletteIndex - Index into the fallback palette (wrapped).
     */
    resolveSeriesColor(providedColor: string, paletteIndex: number): string {
        const trimmed = (providedColor || '').trim();
        if (trimmed) {
            return trimmed;
        }
        return PALETTE_FALLBACK[paletteIndex % PALETTE_FALLBACK.length] ?? PALETTE_FALLBACK[0];
    }

    private async waitForChartJs(): Promise<void> {
        const maxAttempts = 40;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (window.Chart) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
}

/** Shared singleton: `import { chartsController } from '../ui/charts.js'`. */
export const chartsController = ChartsController.getInstance();
