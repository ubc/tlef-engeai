// public/scripts/home/home-page.ts

/**
 * HomePage — marketing homepage interactions
 *
 * Owns theme toggle, scroll-buffer panel zoom, Learn more reveal,
 * Team nav injection, and glassy topbar.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 1.3.0
 * @description: Client behavior for the public EngE-AI hero homepage.
 */

const REVEAL_STORAGE_KEY = 'engeai-home-more-revealed';
const THEME_STORAGE_KEY = 'engeai-home-theme';
const SCROLL_GLASS_THRESHOLD_PX = 24;

type HomeTheme = 'dark' | 'light';

/**
 * initHomePage - wires theme toggle always; hero behaviors when scrub exists.
 */
function initHomePage(): void {
	setupThemeToggle();
	setupTopbarGlass();

	const scrub = document.getElementById('home-scrub');
	if (!scrub) {
		return;
	}

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	setupScrollScrub(scrub, reducedMotion);
	setupLearnMore();
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
 * setupScrollScrub - maps scroll through the sticky hero buffer to panel scale/glow.
 *
 * @param scrub - tall track element that contains the sticky hero
 * @param reducedMotion - skip transform when the user prefers reduced motion
 */
function setupScrollScrub(scrub: HTMLElement, reducedMotion: boolean): void {
	const glow = document.getElementById('home-video-glow');
	if (!glow || reducedMotion) {
		return;
	}

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
		const scale = 1 + progress * 0.42;
		glow.style.transform = `scale(${scale.toFixed(4)})`;
		glow.style.boxShadow = [
			`0 -${32 + progress * 40}px ${90 + progress * 70}px -8px rgba(111, 158, 74, ${0.5 + progress * 0.35})`,
			`0 -${14 + progress * 18}px ${48 + progress * 36}px -6px rgba(61, 122, 176, ${0.4 + progress * 0.3})`,
			'0 0 0 1px rgba(255, 255, 255, 0.12) inset',
			'0 24px 60px rgba(0, 0, 0, 0.45)',
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

/**
 * setupLearnMore - reveals #home-more only after Learn more is clicked.
 */
function setupLearnMore(): void {
	const more = document.getElementById('home-more');
	const learnBtn = document.getElementById('home-learn-more') as HTMLButtonElement | null;
	if (!more || !learnBtn) {
		return;
	}

	// Always start collapsed — features stay hidden until Learn more
	more.hidden = true;
	more.setAttribute('inert', '');
	document.body.classList.remove('home-more-open');
	learnBtn.setAttribute('aria-expanded', 'false');
	try {
		sessionStorage.removeItem(REVEAL_STORAGE_KEY);
	} catch {
		/* ignore */
	}

	const reveal = () => {
		more.hidden = false;
		more.removeAttribute('inert');
		document.body.classList.add('home-more-open');
		learnBtn.setAttribute('aria-expanded', 'true');
		more.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	learnBtn.addEventListener('click', () => {
		if (more.hidden) {
			reveal();
		} else {
			more.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initHomePage);
} else {
	initHomePage();
}
