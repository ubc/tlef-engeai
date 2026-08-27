// public/scripts/home/home-page.ts

/**
 * HomePage — marketing homepage interactions
 *
 * Owns theme toggle, Learn more reveal, features scrub (tablet+) / static
 * title→desc→image cards (phone), shared footer injection, glassy topbar,
 * and hero video autoplay + scroll zoom-to-max.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-31
 * @version: 1.9.3
 * @description: Client behavior for the public EngE-AI hero homepage.
 */

const REVEAL_STORAGE_KEY = 'engeai-home-more-revealed';
const THEME_STORAGE_KEY = 'engeai-home-theme';
const SCROLL_GLASS_THRESHOLD_PX = 24;
/** Resting hero video scale (matches CSS). */
const HERO_ZOOM_BASE = 1.06;
/** Max hero video scale reached during scroll zoom. */
const HERO_ZOOM_MAX = 1.22;
/** Tablet+ breakpoint — matches CSS min-width: 768px for sticky features scrub. */
const FEATURES_SCRUB_MIN_WIDTH_PX = 768;
/** Footer / hash targets inside #home-more (About → features, Funding → funding). */
const HOME_SECTION_HASHES = ['features', 'funding'] as const;
type HomeSectionHash = (typeof HOME_SECTION_HASHES)[number];

type HomeTheme = 'dark' | 'light';

/**
 * initHomePage - wires theme, footer, features scrub, and hero video.
 */
function initHomePage(): void {
	setupThemeToggle();
	setupTopbarGlass();

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	setupHeroVideo(reducedMotion);
	setupHeroScrollZoom(reducedMotion);
	setupFeaturesScroll(reducedMotion);
	setupLearnMore();
	setupHashNavigation(reducedMotion);
	void setupHomeFooter();
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
 * Phone and reduced-motion use CSS card stack (title → description → image per step).
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
		wireFooterSectionLinks();
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
 * setupHeroVideo - autoplays the muted hero loop when motion is allowed.
 *
 * Browsers require muted + playsinline for autoplay. When reduced motion is on,
 * the poster frame stays visible and playback is not started.
 *
 * @param reducedMotion - prefers-reduced-motion: reduce
 */
function setupHeroVideo(reducedMotion: boolean): void {
	const video = document.getElementById('home-hero-video') as HTMLVideoElement | null;
	if (!video || reducedMotion) {
		return;
	}

	video.muted = true;
	void video.play().catch(() => {
		/* poster remains if autoplay is blocked */
	});
}

/**
 * setupHeroScrollZoom - zooms hero video to a max size while page scroll remains natural.
 *
 * Non-sticky: the page scrolls normally; only `#home-video-glow` transform changes.
 * Progress is anchored to the hero section's scroll window and clamps at 1, so
 * the video scales up until max and then holds that size for the rest of the page scroll.
 * Skipped under prefers-reduced-motion (CSS resting scale remains).
 *
 * @param reducedMotion - prefers-reduced-motion: reduce
 */
function setupHeroScrollZoom(reducedMotion: boolean): void {
	const glow = document.getElementById('home-video-glow');
	const scrub = document.getElementById('home-scrub');
	if (!glow || !scrub || reducedMotion) {
		return;
	}

	let ticking = false;

	const update = () => {
		ticking = false;
		const scrubTop = scrub.getBoundingClientRect().top + window.scrollY;
		const startY = Math.max(0, scrubTop - window.innerHeight * 0.15);
		const endY = scrubTop + Math.max(scrub.offsetHeight * 0.8, window.innerHeight * 0.9);
		const travel = Math.max(endY - startY, 1) * 0.5 ;
		const progress = Math.min(Math.max((window.scrollY - startY) / travel, 0), 1);
		const scale = HERO_ZOOM_BASE + progress * (HERO_ZOOM_MAX - HERO_ZOOM_BASE);
		glow.style.transform = `scale(${scale.toFixed(4)})`;
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

/** Callback set by setupLearnMore — reveals #home-more; optional section id scrolls there instead of block top. */
let revealHomeMore: ((scrollTo?: HomeSectionHash) => void) | null = null;

/** navigateToHomeSection - set by setupHashNavigation for footer link wiring after async footer fetch. */
let navigateToHomeSection: ((id: HomeSectionHash) => void) | null = null;

/**
 * expandStaticFeatures - marks every step/panel visible for phone / reduced-motion CSS.
 *
 * Bodies and panels stay in the document (no [hidden]); CSS shows the card stack.
 * Clears aria-current so the static list is not announced as a scrub step.
 *
 * @param steps - feature step list items
 * @param panels - panel figures nested inside each step
 */
function expandStaticFeatures(
	steps: HTMLElement[],
	panels: HTMLElement[]
): void {
	for (const step of steps) {
		step.classList.add('is-active');
		step.removeAttribute('aria-current');
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
 * visibility (via `.is-active` + CSS), aria-current, and nested panels. Clicking a
 * step title jumps scroll to that step's scrub offset. Skipped under
 * prefers-reduced-motion or below 768px (CSS static title→desc→image cards).
 * Lazy-wires listeners on first successful measure after reveal.
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

	const syncIndicator = () => {
		const activeEl = steps[activeStep];
		if (!indicator || !activeEl || !stage) {
			return;
		}
		const title = activeEl.querySelector('.home-features-step-title') as HTMLElement | null;
		const target = title ?? activeEl;
		// Measure against stage — panels and indicator share this containing block on desktop
		const stageRect = stage.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const top = targetRect.top - stageRect.top;
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
			});

			// Class + aria only — body visibility is CSS (.is-active); panels use opacity
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
			const title = step.querySelector('.home-features-step-title');
			title?.addEventListener('click', () => jumpToStep(i));
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
 * isHomeSectionHash - true when hash id is a footer About / Funding target.
 *
 * @param id - location hash without leading #
 */
function isHomeSectionHash(id: string): id is HomeSectionHash {
	return (HOME_SECTION_HASHES as readonly string[]).includes(id);
}

/**
 * scrollBehaviorForHome - smooth scroll unless the user prefers reduced motion.
 *
 * @param reducedMotion - prefers-reduced-motion: reduce
 */
function scrollBehaviorForHome(reducedMotion: boolean): ScrollBehavior {
	return reducedMotion ? 'instant' : 'smooth';
}

/**
 * wireFooterSectionLinks - intercepts About / Funding footer links on the homepage.
 *
 * Team and other pages keep native navigation to `/#features` and `/#funding`.
 */
function wireFooterSectionLinks(): void {
	for (const link of document.querySelectorAll<HTMLAnchorElement>(
		'a[href="/#features"], a[href="/#funding"]'
	)) {
		link.addEventListener('click', (event) => {
			if (!document.getElementById('home-more')) {
				return;
			}
			const id = new URL(link.href, window.location.origin).hash.slice(1);
			if (!isHomeSectionHash(id)) {
				return;
			}
			event.preventDefault();
			navigateToHomeSection?.(id);
		});
	}
}

/**
 * setupHashNavigation - smooth scroll to About / Funding; reveals #home-more when collapsed.
 *
 * Handles initial `/#features` and `/#funding` on load and hashchange (back/forward).
 *
 * @param reducedMotion - skip animation when the user prefers reduced motion
 */
function setupHashNavigation(reducedMotion: boolean): void {
	const more = document.getElementById('home-more');
	if (!more) {
		return;
	}

	const scrollToSection = (id: HomeSectionHash): void => {
		const target = document.getElementById(id);
		if (!target) {
			return;
		}
		const behavior = scrollBehaviorForHome(reducedMotion);
		target.scrollIntoView({ behavior, block: 'start' });
	};

	const goToSection = (id: HomeSectionHash): void => {
		if (more.hidden) {
			revealHomeMore?.(id);
			return;
		}
		scrollToSection(id);
		if (window.location.hash !== `#${id}`) {
			history.replaceState(null, '', `#${id}`);
		}
	};

	navigateToHomeSection = goToSection;

	const initialId = window.location.hash.slice(1);
	if (isHomeSectionHash(initialId)) {
		// Avoid a flash jump to a hidden target before reveal + smooth scroll
		window.scrollTo(0, 0);
		afterNextPaint(() => goToSection(initialId));
	}

	window.addEventListener('hashchange', () => {
		const id = window.location.hash.slice(1);
		if (isHomeSectionHash(id)) {
			goToSection(id);
		}
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

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const reveal = (scrollTo?: HomeSectionHash): void => {
		more.hidden = false;
		more.removeAttribute('inert');
		document.body.classList.add('home-more-open');
		syncButton(true);
		// Wait for layout after [hidden]→visible before measuring the features scrub
		afterNextPaint(() => {
			refreshFeaturesScroll?.();
			const behavior = scrollBehaviorForHome(reducedMotion);
			if (scrollTo) {
				const target = document.getElementById(scrollTo);
				target?.scrollIntoView({ behavior, block: 'start' });
				if (window.location.hash !== `#${scrollTo}`) {
					history.replaceState(null, '', `#${scrollTo}`);
				}
			} else {
				more.scrollIntoView({ behavior, block: 'start' });
			}
			// Re-measure once layout / smooth scroll settles
			window.setTimeout(() => {
				refreshFeaturesScroll?.();
				if (scrollTo) {
					document.getElementById(scrollTo)?.scrollIntoView({ behavior, block: 'start' });
				}
			}, 450);
		});
	};

	revealHomeMore = reveal;

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
