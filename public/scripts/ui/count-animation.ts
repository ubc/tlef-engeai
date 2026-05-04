/**
 * @fileoverview Count display animations for numeric UI (count-up, count-down, future easing variants).
 *
 * ## Design (singleton)
 *
 * - **Single entry point:** `CountAnimationController` exposes one shared instance via
 *   {@link CountAnimationController.getInstance} (and optional {@link countAnimationController}).
 * - **Scope / cancellation:** Animations are tied to a **scope element** (e.g. a modal overlay).
 *   Calling {@link CountAnimationController.bumpScope} invalidates in-flight animations for that
 *   scope so closing a dialog or re-entering a step does not leave stale `requestAnimationFrame` loops.
 * - **Accessibility:** Public methods that run motion should respect
 *   `prefers-reduced-motion` (callers or {@link CountAnimationController.prefersReducedMotion}).
 *
 * ## Migration notes
 *
 * Course summary currently implements count-up inline in
 * `public/scripts/feature/course-summary.ts`. That logic should move here into
 * {@link CountAnimationController.animateCount} and related helpers in a follow-up change.
 *
 * @module ui/count-animation
 */

/** Easing function: maps linear progress `t` in [0, 1] to eased progress in [0, 1]. */
export type CountEaseFn = (t: number) => number;

/** Options for a single count animation on one DOM node. */
export interface AnimateCountOptions {
    /** Element whose `textContent` is updated with integer strings. */
    element: HTMLElement | null;
    /** Value displayed when the animation completes. */
    target: number;
    /** Duration of the animation in milliseconds. */
    durationMs: number;
    /**
     * Scope element used to coordinate cancellation; must match the same reference passed to
     * {@link CountAnimationController.bumpScope} when invalidating.
     */
    scope: HTMLElement;
    /** Delay before the first frame runs (ms). */
    delayMs?: number;
    /** Optional start value; default 0 for count-up. Future: count-down from > target. */
    from?: number;
    /** Optional easing; default will be set when implementation is ported. */
    ease?: CountEaseFn;
}

/**
 * Singleton controller for count animations across the instructor/student UI.
 *
 * **Responsibilities (intended):**
 * - Run count-up / count-down (or scrub) animations on elements.
 * - Invalidate animations by scope (e.g. modal teardown, step change).
 * - Centralize reduced-motion behavior.
 *
 * **Non-responsibilities:**
 * - Parsing course payloads or resolving CSS selectors (callers pass elements).
 */
export class CountAnimationController {
    private static instance: CountAnimationController | null = null;

    /**
     * Per-scope generation counter. When an animation starts, it captures the current generation;
     * each frame checks that the scope's generation is unchanged.
     */
    private readonly scopeGeneration = new WeakMap<HTMLElement, number>();

    private constructor() {
        // Singleton: use getInstance()
    }

    /**
     * Returns the shared controller instance.
     */
    static getInstance(): CountAnimationController {
        if (!CountAnimationController.instance) {
            CountAnimationController.instance = new CountAnimationController();
        }
        return CountAnimationController.instance;
    }

    /**
     * Increments the cancellation generation for `scope`. Any animation that captured an older
     * generation must stop updating the document.
     *
     * Call when:
     * - A modal overlay is removed or hidden.
     * - A wizard step re-runs and animations should restart.
     */
    bumpScope(scope: HTMLElement): void {
        this.scopeGeneration.set(scope, (this.scopeGeneration.get(scope) ?? 0) + 1);
    }

    /**
     * Reads whether the user prefers reduced motion (OS / browser setting).
     * When true, callers should set final values immediately instead of animating.
     */
    prefersReducedMotion(): boolean {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * Sets `element.textContent` to the clamped integer `value` with no animation.
     * Safe when `element` is null.
     */
    setImmediateValue(element: HTMLElement | null, value: number): void {
        void element;
        void value;
        // TODO: clamp to non-negative integer; set textContent — port from course-summary.ts
    }

    /**
     * Animates the displayed integer from `from` (default 0) toward `target` over `durationMs`,
     * respecting `scope` generation and optional `delayMs`.
     *
     * **Skeleton:** no runtime behavior until implementation is migrated from course summary.
     */
    animateCount(options: AnimateCountOptions): void {
        void options;
        // TODO: Port requestAnimationFrame + easeOutCubic loop from course-summary.ts
    }

    /**
     * Convenience orchestration for multiple elements under one scope (e.g. students + chats).
     * **Skeleton:** will coordinate staggered `animateCount` calls after migration.
     */
    animateCountsInScope(
        scope: HTMLElement,
        entries: Array<{ element: HTMLElement | null; target: number; durationMs: number; delayMs?: number }>
    ): void {
        void scope;
        void entries;
        // TODO: bumpScope, read prefersReducedMotion, delegate to animateCount / setImmediateValue
    }
}

/**
 * Shared singleton reference for ergonomic imports:
 * `import { countAnimationController } from '../ui/count-animation.js'`
 */
export const countAnimationController = CountAnimationController.getInstance();
