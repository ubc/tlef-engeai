// public/scripts/home/home-page.ts

/**
 * HomePage — marketing homepage interactions
 *
 * Owns theme toggle, scroll-buffer panel zoom, Learn more reveal,
 * scroll-driven features section, shared footer injection, glassy topbar,
 * shared footer injection, glassy topbar, TLEF grant count-up, and testimonials marquee.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-31
 * @version: 1.7.0
 * @description: Client behavior for the public EngE-AI hero homepage.
 */

const REVEAL_STORAGE_KEY = 'engeai-home-more-revealed';
const THEME_STORAGE_KEY = 'engeai-home-theme';
const SCROLL_GLASS_THRESHOLD_PX = 24;
const GRANT_COUNT_DURATION_MS = 1100;
/** Fraction of the hero scrub track where zoom finishes; lower = more scroll for same zoom. */
const HERO_ZOOM_COMPLETE_AT = 0.65;
/** Tablet+ breakpoint — matches CSS min-width: 768px for sticky features scrub. */
const FEATURES_SCRUB_MIN_WIDTH_PX = 768;

type HomeTheme = 'dark' | 'light';

/**
 * initHomePage - wires theme, footer, grant counter, features scrub; hero when scrub exists.
 */
function initHomePage(): void {
	setupThemeToggle();
	setupTopbarGlass();
	void setupHomeFooter();
	setupGrantFunding();
	setupTestimonialsMarquee();

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	setupFeaturesScroll(reducedMotion);

	const scrub = document.getElementById('home-scrub');
	if (!scrub) {
		return;
	}

	setupScrollScrub(scrub, reducedMotion);
	setupLearnMore();
}

/**
 * afterNextPaint - runs fn after two animation frames so layout has reflowed.
 *
 * Used after revealing `#home-more` (was display:none) before measuring the features scrub track.
 *
 * @param fn - callback to run after paint
 */
function afterNextPaint(fn: () => void): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(fn);
	});
}

/**
 * preferStaticFeatures - true when sticky scrub should not run (reduced motion or phone).
 *
 * @param reducedMotion - prefers-reduced-motion: reduce
 * @returns whether to use the static expanded stack
 */
function preferStaticFeatures(reducedMotion: boolean): boolean {
	return (
		reducedMotion ||
		!window.matchMedia(`(min-width: ${FEATURES_SCRUB_MIN_WIDTH_PX}px)`).matches
	);
}

/**
 * setupHomeFooter - injects the shared marketing footer into #home-footer-mount.
 *
 * Fetches `/components/home/home-footer.html`. On failure the mount stays empty.
 */
async function setupHomeFooter(): Promise<void> {
	const mount = document.getElementById('home-footer-mount');
	if (!mount) {
		return;
	}

	try {
		const response = await fetch('/components/home/home-footer.html');
		if (!response.ok) {
			return;
		}
		mount.innerHTML = await response.text();
	} catch {
		/* leave mount empty on network/parse failure */
	}
}

/**
 * readStoredTheme - returns persisted theme or dark default.
 *
 * @returns dark or light
 */
function readStoredTheme(): HomeTheme {
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') {
			return stored;
		}
	} catch {
		/* ignore storage errors */
	}
	return 'dark';
}

/**
 * applyHomeTheme - sets html data-home-theme and syncs toggle a11y state.
 *
 * @param theme - dark or light
 * @param toggle - optional theme button to update
 */
function applyHomeTheme(theme: HomeTheme, toggle: HTMLButtonElement | null): void {
	document.documentElement.setAttribute('data-home-theme', theme);
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		/* ignore storage errors */
	}

	if (!toggle) {
		return;
	}

	const isDark = theme === 'dark';
	toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
	toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

/**
 * setupThemeToggle - persists light/dark preference for marketing pages.
 */
function setupThemeToggle(): void {
	const toggle = document.getElementById('home-theme-toggle') as HTMLButtonElement | null;
	const current = readStoredTheme();
	applyHomeTheme(current, toggle);

	if (!toggle) {
		return;
	}

	toggle.addEventListener('click', () => {
		const next: HomeTheme =
			document.documentElement.getAttribute('data-home-theme') === 'light' ? 'dark' : 'light';
		applyHomeTheme(next, toggle);
	});
}

/**
 * setupTopbarGlass - toggles glassy border/background once the page scrolls.
 */
function setupTopbarGlass(): void {
	const topbar = document.getElementById('home-topbar');
	if (!topbar) {
		return;
	}

	const update = () => {
		topbar.classList.toggle('is-scrolled', window.scrollY > SCROLL_GLASS_THRESHOLD_PX);
	};

	update();
	window.addEventListener('scroll', update, { passive: true });
}

/**
 * setupScrollScrub - maps scroll through the sticky hero buffer to panel scale.
 *
 * Glow box-shadow stays visually constant: pixel lengths are divided by scale so
 * transform does not enlarge the bleed.
 *
 * @param scrub - tall track element that contains the sticky hero
 * @param reducedMotion - skip transform when the user prefers reduced motion
 */
function setupScrollScrub(scrub: HTMLElement, reducedMotion: boolean): void {
	const glow = document.getElementById('home-video-glow');
	if (!glow || reducedMotion) {
		return;
	}

	const BASE_SCALE = 1.2;
	let ticking = false;

	const update = () => {
		ticking = false;
		const rect = scrub.getBoundingClientRect();
		const track = scrub.offsetHeight - window.innerHeight;
		if (track <= 0) {
			glow.style.transform = 'scale(1)';
			return;
		}

		// Progress 0 → 1 while the scrub section is pinning the hero
		const scrolled = Math.min(Math.max(-rect.top, 0), track);
		const progress = scrolled / track;
		// Zoom completes early in the track, then holds at max scale
		const zoomProgress = Math.min(1, progress / HERO_ZOOM_COMPLETE_AT);
		const scale = BASE_SCALE + zoomProgress * 0.12;
		// Counteract transform so the glow bleed keeps its on-screen size
		const s = BASE_SCALE / scale;
		glow.style.transform = `scale(${scale.toFixed(4)})`;
		glow.style.boxShadow = [
			`0 ${(-32 * s).toFixed(2)}px ${(90 * s).toFixed(2)}px ${(-8 * s).toFixed(2)}px rgba(111, 158, 74, 0.5)`,
			`0 ${(-14 * s).toFixed(2)}px ${(48 * s).toFixed(2)}px ${(-6 * s).toFixed(2)}px rgba(61, 122, 176, 0.4)`,
			'0 0 0 1px rgba(255, 255, 255, 0.12) inset',
			`0 ${(24 * s).toFixed(2)}px ${(60 * s).toFixed(2)}px rgba(0, 0, 0, 0.45)`,
		].join(', ');
	};

	const onScroll = () => {
		if (!ticking) {
			ticking = true;
			requestAnimationFrame(update);
		}
	};

	update();
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onScroll, { passive: true });
}

/** Callback set by setupFeaturesScroll so Learn more can re-measure after reveal. */
let refreshFeaturesScroll: (() => void) | null = null;

/** Callback set by setupGrantFunding so Learn more can position the ink bar after reveal. */
let refreshGrantInk: (() => void) | null = null;

/**
 * expandStaticFeatures - shows all step bodies and panels (phone / reduced-motion fallback).
 *
 * @param steps - feature step list items
 * @param panels - right-side panel figures
 */
function expandStaticFeatures(
	steps: HTMLElement[],
	panels: HTMLElement[]
): void {
	for (const step of steps) {
		step.classList.add('is-active');
		step.removeAttribute('aria-current');
		const body = step.querySelector('.home-features-step-body');
		body?.removeAttribute('hidden');
	}
	for (const panel of panels) {
		panel.classList.add('is-active');
		panel.setAttribute('aria-hidden', 'false');
	}
}

/**
 * setupFeaturesScroll - maps scroll through the features scrub track to active step.
 *
 * Progress through `#features` advances steps 0→N; syncs left indicator, step body
 * visibility, aria-current, and right-side panels. Clicking a step jumps scroll
 * to that step's scrub offset. Skipped under prefers-reduced-motion or below 768px
 * (CSS static stack). Lazy-wires listeners on first successful measure after reveal.
 *
 * Track length uses the sticky stage height (not raw viewport) so pin range matches CSS.
 * Exposes refreshFeaturesScroll for post-reveal re-measure when `#home-more` was hidden.
 *
 * @param reducedMotion - skip sticky scrub when the user prefers reduced motion
 */
function setupFeaturesScroll(reducedMotion: boolean): void {
	const scrub = document.getElementById('features');
	const sticky = scrub?.querySelector('.home-features-sticky') as HTMLElement | null;
	const stage = scrub?.querySelector('.home-features-stage') as HTMLElement | null;
	const indicator = scrub?.querySelector('.home-features-indicator') as HTMLElement | null;
	if (!scrub || !stage) {
		return;
	}

	const steps = Array.from(stage.querySelectorAll<HTMLElement>('.home-features-step'));
	const panels = Array.from(stage.querySelectorAll<HTMLElement>('.home-features-panel'));
	const stepCount = steps.length;
	if (stepCount === 0) {
		return;
	}

	let activeStep = -1;
	let ticking = false;
	let scrubWired = false;
	let onScroll: (() => void) | null = null;
	let ro: ResizeObserver | null = null;

	const nav = scrub?.querySelector('.home-features-nav') as HTMLElement | null;

	const syncIndicator = () => {
		const activeEl = steps[activeStep];
		if (!indicator || !activeEl || !nav) {
			return;
		}
		const trigger = activeEl.querySelector('.home-features-step-trigger') as HTMLElement | null;
		const target = trigger ?? activeEl;
		// Measure against nav — offsetTop sums are wrong when li + button share the same offsetParent
		const navRect = nav.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const top = targetRect.top - navRect.top;
		const height = targetRect.height;
		indicator.style.transform = `translateY(${Math.max(0, top)}px)`;
		indicator.style.height = `${Math.max(height, 24)}px`;
	};

	const applyStep = (index: number) => {
		if (index !== activeStep) {
			activeStep = index;
			stage.dataset.activeStep = String(index);
			stage.style.setProperty('--step-index', String(index));

			steps.forEach((step, i) => {
				const isActive = i === index;
				step.classList.toggle('is-active', isActive);
				if (isActive) {
					step.setAttribute('aria-current', 'step');
				} else {
					step.removeAttribute('aria-current');
				}
				const body = step.querySelector('.home-features-step-body');
				if (body) {
					if (isActive) {
						body.removeAttribute('hidden');
					} else {
						body.setAttribute('hidden', '');
					}
				}
			});

			// Class + aria only — avoid [hidden] (UA display:none !important breaks stacked panels)
			panels.forEach((panel, i) => {
				const isActive = i === index;
				panel.classList.toggle('is-active', isActive);
				panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
			});
		}

		// Align after body visibility changes layout
		requestAnimationFrame(syncIndicator);
	};

	/** Pin track: scrub content height minus sticky slice (excludes padding-top). */
	const getPadTop = (): number => {
		return parseFloat(getComputedStyle(scrub).paddingTop) || 0;
	};

	const getTrack = (): number => {
		const stickyH = sticky?.offsetHeight || window.innerHeight;
		return Math.max(0, scrub.offsetHeight - stickyH - getPadTop());
	};

	const update = () => {
		ticking = false;
		if (preferStaticFeatures(reducedMotion)) {
			expandStaticFeatures(steps, panels);
			return;
		}

		const track = getTrack();
		if (track <= 0) {
			applyStep(0);
			return;
		}

		const rect = scrub.getBoundingClientRect();
		const padTop = getPadTop();
		// Progress starts once padding has scrolled away and sticky is pinning
		const scrolled = Math.min(Math.max(-rect.top - padTop, 0), track);
		const progress = scrolled / track;
		const scaled = progress * stepCount;
		const next = Math.min(stepCount - 1, Math.floor(scaled));
		applyStep(next);
	};

	const jumpToStep = (index: number) => {
		if (preferStaticFeatures(reducedMotion)) {
			return;
		}
		const track = getTrack();
		if (track <= 0) {
			applyStep(index);
			return;
		}
		const scrubTop = scrub.getBoundingClientRect().top + window.scrollY;
		const target = scrubTop + getPadTop() + (index / stepCount) * track + 1;
		window.scrollTo({ top: target, behavior: 'smooth' });
	};

	const wireScrub = () => {
		if (scrubWired) {
			return;
		}
		scrubWired = true;

		onScroll = () => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(update);
			}
		};

		steps.forEach((step, i) => {
			const trigger = step.querySelector('.home-features-step-trigger');
			trigger?.addEventListener('click', () => jumpToStep(i));
		});

		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });

		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => onScroll?.());
			ro.observe(scrub);
			if (sticky) {
				ro.observe(sticky);
			}
		}
	};

	refreshFeaturesScroll = () => {
		if (preferStaticFeatures(reducedMotion)) {
			expandStaticFeatures(steps, panels);
			return;
		}

		// Section still display:none or zero-height — wait for layout
		if (scrub.offsetHeight <= 0) {
			return;
		}

		wireScrub();
		applyStep(activeStep < 0 ? 0 : activeStep);
		update();
	};

	// Initial pass: static on phone / reduced-motion; scrub waits for reveal + layout
	if (preferStaticFeatures(reducedMotion)) {
		expandStaticFeatures(steps, panels);
	} else if (scrub.offsetHeight > 0) {
		wireScrub();
		applyStep(0);
		update();
	}
}

/**
 * formatGrantCurrency - formats a non-negative integer as a CAD dollar string.
 *
 * @param value - amount in whole dollars
 * @returns e.g. "$87,198"
 */
function formatGrantCurrency(value: number): string {
	return `$${Math.max(0, Math.floor(value)).toLocaleString('en-CA')}`;
}

/**
 * animateGrantAmount - counts element text from 0 to target with ease-out cubic.
 *
 * Uses a generation counter so a newer animation cancels an in-flight one.
 * Respects reduced motion by setting the final value immediately.
 *
 * @param element - amount display node
 * @param target - final dollar amount
 * @param generation - current animation generation for this element
 * @param getGeneration - returns the latest generation (mismatch cancels)
 * @param reducedMotion - skip animation when true
 */
function animateGrantAmount(
	element: HTMLElement,
	target: number,
	generation: number,
	getGeneration: () => number,
	reducedMotion: boolean
): void {
	const capped = Math.max(0, Math.floor(target));
	element.setAttribute('aria-live', 'off');

	if (reducedMotion) {
		element.textContent = formatGrantCurrency(capped);
		element.setAttribute('aria-live', 'polite');
		return;
	}

	const durationMs = GRANT_COUNT_DURATION_MS;
	const startTime = performance.now();

	const tick = (now: number): void => {
		if (getGeneration() !== generation) {
			return;
		}
		const t = Math.min(1, (now - startTime) / durationMs);
		const eased = 1 - Math.pow(1 - t, 3);
		element.textContent = formatGrantCurrency(Math.round(capped * eased));
		if (t < 1) {
			requestAnimationFrame(tick);
		} else {
			element.textContent = formatGrantCurrency(capped);
			element.setAttribute('aria-live', 'polite');
		}
	};

	element.textContent = formatGrantCurrency(0);
	requestAnimationFrame(tick);
}

/**
 * transitionGrantAmount - fades the amount label to a new value without counting digits.
 *
 * Used after the one-time count-up when switching Year 1 / Year 2 / Total.
 *
 * @param element - amount display node
 * @param target - final dollar amount
 * @param generation - current animation generation for this element
 * @param getGeneration - returns the latest generation (mismatch cancels)
 * @param reducedMotion - skip animation when true
 */
function transitionGrantAmount(
	element: HTMLElement,
	target: number,
	generation: number,
	getGeneration: () => number,
	reducedMotion: boolean
): void {
	const capped = Math.max(0, Math.floor(target));
	const nextText = formatGrantCurrency(capped);

	if (reducedMotion || element.textContent === nextText) {
		element.textContent = nextText;
		element.style.opacity = '1';
		element.setAttribute('aria-live', 'polite');
		return;
	}

	element.setAttribute('aria-live', 'off');
	element.style.transition = 'opacity 160ms ease';
	element.style.opacity = '0';

	window.setTimeout(() => {
		if (getGeneration() !== generation) {
			return;
		}
		element.textContent = nextText;
		element.style.opacity = '1';
		element.setAttribute('aria-live', 'polite');
	}, 160);
}

/**
 * setupGrantFunding - wires Year 1 / Year 2 / Total selector and count-up on scroll into view.
 *
 * Amounts come from `data-grant-amount` on each option. Total is the default.
 * Count-up from zero runs once; later option changes fade the amount text.
 * The underline ink bar slides to the active option on select and on resize.
 */
function setupGrantFunding(): void {
	const stat = document.getElementById('home-grant-stat');
	const amountEl = document.getElementById('home-grant-amount');
	const periodEl = document.getElementById('home-grant-period');
	const selector = stat?.querySelector('.home-grant-selector') as HTMLElement | null;
	if (!stat || !amountEl) {
		return;
	}

	const options = Array.from(stat.querySelectorAll<HTMLButtonElement>('.home-grant-option'));
	if (options.length === 0) {
		return;
	}

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let generation = 0;
	let hasInitialCountUp = false;
	let observer: IntersectionObserver | null = null;

	/** Inset so the bar sits under the label, not the full padded button width. */
	const INK_INSET_PX = 18;

	const syncInk = (): void => {
		if (!selector) {
			return;
		}
		// Grant lives inside #home-more [hidden] until Learn more — skip until laid out
		if (selector.offsetParent === null && selector.offsetWidth === 0) {
			return;
		}
		const active =
			options.find((btn) => btn.getAttribute('aria-pressed') === 'true') ??
			options.find((btn) => btn.classList.contains('is-active')) ??
			options[options.length - 1];
		const width = Math.max(0, active.offsetWidth - INK_INSET_PX * 2);
		selector.style.setProperty('--grant-ink-left', `${active.offsetLeft + INK_INSET_PX}px`);
		selector.style.setProperty('--grant-ink-width', `${width}px`);
	};

	refreshGrantInk = syncInk;

	const readActiveTarget = (): { amount: number; label: string } => {
		const active =
			options.find((btn) => btn.getAttribute('aria-pressed') === 'true') ??
			options.find((btn) => btn.dataset.grantKey === 'total') ??
			options[options.length - 1];
		const amount = Math.max(0, Math.floor(Number(active.dataset.grantAmount ?? '0')));
		const label = active.dataset.grantLabel ?? active.textContent?.trim() ?? 'TLEF funding';
		return { amount, label };
	};

	const updateAmount = (useCountUp: boolean): void => {
		const { amount, label } = readActiveTarget();
		if (periodEl) {
			periodEl.textContent = label;
		}
		generation += 1;
		const current = generation;

		if (useCountUp && !hasInitialCountUp) {
			hasInitialCountUp = true;
			observer?.disconnect();
			observer = null;
			animateGrantAmount(amountEl, amount, current, () => generation, reducedMotion);
			return;
		}

		if (!hasInitialCountUp) {
			hasInitialCountUp = true;
			amountEl.textContent = formatGrantCurrency(amount);
			amountEl.setAttribute('aria-live', 'polite');
			return;
		}

		transitionGrantAmount(amountEl, amount, current, () => generation, reducedMotion);
	};

	const selectOption = (chosen: HTMLButtonElement): void => {
		for (const btn of options) {
			const isActive = btn === chosen;
			btn.classList.toggle('is-active', isActive);
			btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
		}
		syncInk();
		updateAmount(false);
	};

	for (const btn of options) {
		btn.addEventListener('click', () => {
			if (btn.getAttribute('aria-pressed') === 'true') {
				return;
			}
			selectOption(btn);
		});
	}

	syncInk();
	window.addEventListener('resize', syncInk, { passive: true });

	observer = new IntersectionObserver(
		(entries) => {
			const entry = entries[0];
			if (!entry?.isIntersecting) {
				return;
			}
			// Re-measure once visible — initial syncInk ran while #home-more was [hidden]
			syncInk();
			if (hasInitialCountUp) {
				return;
			}
			updateAmount(true);
		},
		{ threshold: 0.35 }
	);

	observer.observe(stat);
}

/**
 * setupTestimonialsMarquee - runs the student testimonials marquee only while visible.
 *
 * Pauses and resets when the section leaves the viewport or the tab is hidden;
 * restarts from the beginning when the user returns.
 */
function setupTestimonialsMarquee(): void {
	const marquee = document.querySelector('.home-testimonials-marquee');
	const track = marquee?.querySelector('.home-testimonials-track') as HTMLElement | null;
	if (!marquee || !track) {
		return;
	}

	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		return;
	}

	let inViewport = false;
	let pageVisible = document.visibilityState === 'visible';

	const stopMarquee = (): void => {
		track.classList.remove('is-active');
		track.style.transform = 'translateX(0)';
	};

	const startMarquee = (): void => {
		track.classList.remove('is-active');
		track.style.transform = '';
		// Force animation restart from the first frame
		void track.offsetWidth;
		track.classList.add('is-active');
	};

	const syncMarquee = (): void => {
		if (inViewport && pageVisible) {
			startMarquee();
		} else {
			stopMarquee();
		}
	};

	const observer = new IntersectionObserver(
		(entries) => {
			inViewport = entries[0]?.isIntersecting ?? false;
			syncMarquee();
		},
		{ threshold: 0.15 }
	);

	observer.observe(marquee);
	document.addEventListener('visibilitychange', () => {
		pageVisible = document.visibilityState === 'visible';
		syncMarquee();
	});
}

/**
 * setupLearnMore - toggles #home-more visibility; label switches Learn more / See less.
 */
function setupLearnMore(): void {
	const more = document.getElementById('home-more');
	const learnBtn = document.getElementById('home-learn-more') as HTMLButtonElement | null;
	if (!more || !learnBtn) {
		return;
	}

	const syncButton = (expanded: boolean): void => {
		learnBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		learnBtn.textContent = expanded ? 'See less' : 'Learn more';
	};

	// Always start collapsed — features stay hidden until Learn more
	more.hidden = true;
	more.setAttribute('inert', '');
	document.body.classList.remove('home-more-open');
	syncButton(false);
	try {
		sessionStorage.removeItem(REVEAL_STORAGE_KEY);
	} catch {
		/* ignore */
	}

	const reveal = (): void => {
		more.hidden = false;
		more.removeAttribute('inert');
		document.body.classList.add('home-more-open');
		syncButton(true);
		// Wait for layout after [hidden]→visible before measuring the features scrub
		afterNextPaint(() => {
			refreshFeaturesScroll?.();
			refreshGrantInk?.();
			more.scrollIntoView({ behavior: 'smooth', block: 'start' });
			// Re-measure once smooth scroll settles near the scrub
			window.setTimeout(() => {
				refreshFeaturesScroll?.();
				refreshGrantInk?.();
			}, 450);
		});
	};

	const collapse = (): void => {
		more.hidden = true;
		more.setAttribute('inert', '');
		document.body.classList.remove('home-more-open');
		syncButton(false);
		const instant =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.scrollTo({ top: 0, behavior: instant ? 'instant' : 'smooth' });
	};

	learnBtn.addEventListener('click', () => {
		if (more.hidden) {
			reveal();
		} else {
			collapse();
		}
	});
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initHomePage);
} else {
	initHomePage();
}
