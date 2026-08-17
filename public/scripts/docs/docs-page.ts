// public/scripts/docs/docs-page.ts

/**
 * DocsPage — public markdown documentation viewer
 *
 * Loads `nav.json` and `.md` files from `/docs/`, renders with vendored marked,
 * and paints the three-pane layout (sidebar, article, on-this-page).
 *
 * @author: EngE-AI Team
 * @date: 2026-08-13
 * @version: 1.0.0
 * @description: Client viewer for public EngE-AI markdown docs.
 */

import {
	currentDocSlug,
	docsHrefForPath,
	docsCalloutKind,
	type DocsCalloutKind,
	escapeHtml,
	extractDocsCallouts,
	isMarkdownHttpResponse,
	markdownCandidateUrls,
	slugifyHeading,
} from './docs-markdown.js';

interface DocsNavChild {
	title: string;
	path: string;
}

interface DocsNavGroup {
	title: string;
	path?: string;
	children?: DocsNavChild[];
}

interface DocsNav {
	items: DocsNavGroup[];
}

interface MarkedHeadingToken {
	depth: number;
	text: string;
}

interface MarkedCodeToken {
	text: string;
	lang?: string;
	escaped?: boolean;
}

interface MarkedHtmlToken {
	text: string;
}

interface MarkedInstance {
	use: (ext: {
		renderer: {
			html: (token: MarkedHtmlToken) => string;
			heading: (token: MarkedHeadingToken) => string;
			code: (token: MarkedCodeToken) => string;
		};
	}) => void;
	parse: (src: string) => string | Promise<string>;
}

interface MarkedGlobal {
	Marked?: new (options?: { silent?: boolean; async?: boolean }) => MarkedInstance;
	default?: { Marked?: new (options?: { silent?: boolean; async?: boolean }) => MarkedInstance };
	parse?: (src: string) => string | Promise<string>;
}

declare global {
	interface Window {
		marked?: MarkedGlobal;
		mermaid?: MermaidApi;
	}
}

interface MermaidRenderResult {
	svg: string;
}

interface MermaidApi {
	initialize: (config: Record<string, unknown>) => void;
	render: (id: string, code: string) => Promise<MermaidRenderResult>;
}

const DOCS_NAV_URL = '/docs/nav.json';
const TABLET_MIN_PX = 768;

let docsStarted = false;
let sidebarLinksEl: HTMLElement | null = null;
let articleEl: HTMLElement | null = null;
let tocEl: HTMLElement | null = null;
let tocListEl: HTMLOListElement | null = null;
let navToggle: HTMLButtonElement | null = null;
let backdropEl: HTMLElement | null = null;
let headingObserver: IntersectionObserver | null = null;
let mermaidConfigured = false;

/** CHBE-aligned Mermaid palette for public docs diagrams. */
const DOCS_MERMAID_THEME = {
	background: '#ffffff',
	mainBkg: '#eef6e6',
	primaryColor: '#e8f3dc',
	primaryBorderColor: '#4d7a2f',
	primaryTextColor: '#1e3a1a',
	secondaryColor: '#f4f9ef',
	tertiaryColor: '#ffffff',
	clusterBkg: '#eef6e6',
	clusterBorder: '#4d7a2f',
	lineColor: '#6f9e4a',
	defaultLinkColor: '#6f9e4a',
	edgeLabelBackground: '#ffffff',
	nodeBorder: '#4d7a2f',
	titleColor: '#4d7a2f',
	fontFamily: 'Lato, sans-serif',
} as const;

/**
 * ensureMermaidConfigured - one-time Mermaid init (same CDN build as student/instructor mode).
 */
function ensureMermaidConfigured(): MermaidApi | null {
	const api = window.mermaid;
	if (!api?.render) {
		return null;
	}
	if (!mermaidConfigured) {
		api.initialize({
			startOnLoad: false,
			theme: 'base',
			themeVariables: { ...DOCS_MERMAID_THEME },
		});
		mermaidConfigured = true;
	}
	return api;
}

/**
 * renderDocsMermaidDiagrams - replaces ```mermaid fences with rendered SVG in the article.
 */
async function renderDocsMermaidDiagrams(root: HTMLElement): Promise<void> {
	const codeBlocks = Array.from(root.querySelectorAll('pre > code.language-mermaid'));
	if (codeBlocks.length === 0) {
		return;
	}
	const mermaid = ensureMermaidConfigured();
	if (!mermaid) {
		return;
	}
	for (const codeEl of codeBlocks) {
		const pre = codeEl.parentElement;
		if (!pre) {
			continue;
		}
		const source = codeEl.textContent?.trim() ?? '';
		const host = document.createElement('div');
		host.className = 'docs-mermaid';
		pre.replaceWith(host);
		if (!source) {
			continue;
		}
		const id = `docs-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		try {
			const { svg } = await mermaid.render(id, source);
			host.innerHTML = svg;
		} catch {
			host.classList.add('docs-mermaid--error');
			host.innerHTML = `<p class="docs-mermaid-error-label">Could not render diagram.</p><pre><code>${escapeHtml(source)}</code></pre>`;
		}
	}
}

/**
 * initDocsPage - wires nav, markdown load, mobile menu, and in-docs links.
 */
function initDocsPage(): void {
	if (docsStarted) {
		return;
	}

	sidebarLinksEl = document.getElementById('docs-sidebar-links');
	articleEl = document.getElementById('docs-article');
	tocEl = document.getElementById('docs-toc');
	tocListEl = document.getElementById('docs-toc-list') as HTMLOListElement | null;
	navToggle = document.getElementById('docs-nav-toggle') as HTMLButtonElement | null;
	backdropEl = document.getElementById('docs-backdrop');

	if (!sidebarLinksEl || !articleEl) {
		return;
	}
	docsStarted = true;

	setupMobileNav();
	document.addEventListener('click', onDocsLinkClick);
	window.addEventListener('popstate', () => {
		void loadCurrentPage();
	});

	void (async () => {
		await ensureMarked();
		await loadSidebar();
		await loadCurrentPage();
	})();
}

/**
 * ensureMarked - loads vendored marked ESM when the UMD global is missing.
 *
 * Cursor’s embedded browser can define `module`, so the UMD build never sets
 * `window.marked`. Dynamic import of the ESM file always works on this page.
 */
async function ensureMarked(): Promise<void> {
	if (resolveMarkedCtor()) {
		return;
	}
	await new Promise<void>((resolve) => {
		let settled = false;
		const finish = (): void => {
			if (settled) {
				return;
			}
			settled = true;
			window.removeEventListener('engeai-marked-ready', finish);
			resolve();
		};
		window.addEventListener('engeai-marked-ready', finish);
		const script = document.createElement('script');
		script.type = 'module';
		script.textContent =
			'import * as marked from "/vendor/marked/marked.esm.js"; window.marked = marked; window.dispatchEvent(new Event("engeai-marked-ready"));';
		script.onerror = finish;
		document.head.appendChild(script);
		window.setTimeout(finish, 2000);
	});
}

/**
 * setupMobileNav - toggles the overlay sidebar below the tablet breakpoint.
 */
function setupMobileNav(): void {
	if (!navToggle || !backdropEl) {
		return;
	}

	navToggle.addEventListener('click', () => {
		setMobileNavOpen(!document.body.classList.contains('docs-nav-open'));
	});
	backdropEl.addEventListener('click', () => setMobileNavOpen(false));
	window.addEventListener(
		'resize',
		() => {
			if (window.matchMedia(`(min-width: ${TABLET_MIN_PX}px)`).matches) {
				setMobileNavOpen(false);
			}
		},
		{ passive: true }
	);
}

/**
 * setMobileNavOpen - opens or closes the phone sidebar overlay.
 *
 * @param open - whether the sidebar should be visible
 */
function setMobileNavOpen(open: boolean): void {
	document.body.classList.toggle('docs-nav-open', open);
	navToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
	if (backdropEl) {
		backdropEl.hidden = !open;
	}
}

/**
 * loadSidebar - fetches nav.json and paints the left nav.
 */
async function loadSidebar(): Promise<void> {
	if (!sidebarLinksEl) {
		return;
	}
	try {
		const response = await fetch(DOCS_NAV_URL);
		if (!response.ok) {
			sidebarLinksEl.innerHTML = '<p class="docs-nav-error">Could not load navigation.</p>';
			return;
		}
		const nav = (await response.json()) as DocsNav;
		sidebarLinksEl.innerHTML = renderNavHtml(nav);
		highlightActiveNav();
	} catch {
		sidebarLinksEl.innerHTML = '<p class="docs-nav-error">Could not load navigation.</p>';
	}
}

/**
 * renderNavHtml - builds the sidebar markup from nav.json.
 *
 * @param nav - sidebar tree
 */
function renderNavHtml(nav: DocsNav): string {
	const parts: string[] = [];
	for (const item of nav.items || []) {
		if (item.children && item.children.length > 0) {
			parts.push(`<p class="docs-nav-group">${escapeHtml(item.title)}</p>`);
			parts.push('<ul class="docs-nav-list">');
			for (const child of item.children) {
				parts.push(navLinkItem(child.title, child.path));
			}
			parts.push('</ul>');
			continue;
		}
		if (item.path) {
			parts.push(`<ul class="docs-nav-list docs-nav-list--top">${navLinkItem(item.title, item.path)}</ul>`);
		}
	}
	return parts.join('');
}

/**
 * navLinkItem - one sidebar link row.
 */
function navLinkItem(title: string, path: string): string {
	const href = docsHrefForPath(path);
	return `<li><a class="docs-nav-link" data-docs-path="${escapeHtml(path)}" href="${escapeHtml(href)}">${escapeHtml(title)}</a></li>`;
}

/**
 * highlightActiveNav - marks the current page in the sidebar.
 */
function highlightActiveNav(): void {
	const slug = currentDocSlug(window.location.pathname);
	for (const link of document.querySelectorAll<HTMLAnchorElement>('.docs-nav-link')) {
		link.classList.toggle('is-active', link.dataset.docsPath === slug);
	}
}

/**
 * onDocsLinkClick - client-side navigation for same-origin /docs links.
 */
function onDocsLinkClick(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}
	const anchor = target.closest('a');
	if (!anchor || anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey) {
		return;
	}
	const url = new URL(anchor.href, window.location.origin);
	if (url.origin !== window.location.origin || !url.pathname.startsWith('/docs')) {
		return;
	}
	if (/\.(md|json)$/i.test(url.pathname)) {
		return;
	}
	event.preventDefault();
	setMobileNavOpen(false);
	if (url.pathname === window.location.pathname && url.hash === window.location.hash) {
		return;
	}
	if (url.pathname === window.location.pathname && url.hash) {
		window.location.hash = url.hash;
		return;
	}
	window.history.pushState({}, '', `${url.pathname}${url.hash}`);
	void loadCurrentPage().then(() => {
		if (url.hash) {
			document.getElementById(url.hash.slice(1))?.scrollIntoView();
		} else {
			window.scrollTo(0, 0);
		}
	});
}

/**
 * loadCurrentPage - fetches and renders markdown for the current URL.
 */
async function loadCurrentPage(): Promise<void> {
	if (!articleEl) {
		return;
	}
	highlightActiveNav();
	const markdown = await fetchMarkdownForPath(window.location.pathname);
	if (markdown === null) {
		showNotFound();
		return;
	}
	try {
		articleEl.innerHTML = await renderMarkdown(markdown);
		try {
			await renderDocsMermaidDiagrams(articleEl);
		} catch {
			/* pre/code fallback remains when Mermaid fails */
		}
	} catch {
		articleEl.innerHTML = '<h1>Could not render</h1><p>The markdown renderer failed on this page.</p>';
		if (tocListEl) {
			tocListEl.innerHTML = '';
		}
		setTocVisible(false);
		return;
	}
	const title = articleEl.querySelector('h1')?.textContent?.trim();
	document.title = title ? `${title} | EngE-AI` : 'Documentation | EngE-AI';
	try {
		buildToc();
	} catch {
		if (tocListEl) {
			tocListEl.innerHTML = '';
		}
		setTocVisible(false);
	}
}

/**
 * fetchMarkdownForPath - tries candidate .md URLs and ignores HTML shell responses.
 *
 * @param pathname - `location.pathname`
 * @returns markdown source, or null when no file is found
 */
async function fetchMarkdownForPath(pathname: string): Promise<string | null> {
	const urls = markdownCandidateUrls(pathname);
	for (const url of urls) {
		try {
			const response = await fetch(url);
			const body = await response.text();
			if (isMarkdownHttpResponse(response, body)) {
				return body;
			}
		} catch {
			/* try the next candidate */
		}
	}
	return null;
}

/**
 * showNotFound - replaces the article with a missing-page message.
 */
function showNotFound(): void {
	if (!articleEl) {
		return;
	}
	articleEl.innerHTML = '<h1>Page not found</h1><p>That documentation page does not exist.</p>';
	document.title = 'Page not found | EngE-AI';
	if (tocListEl) {
		tocListEl.innerHTML = '';
	}
	setTocVisible(false);
}

/**
 * resolveMarkedCtor - Marked class from UMD global or ESM namespace import.
 */
function resolveMarkedCtor(): (new (options?: { silent?: boolean; async?: boolean }) => MarkedInstance) | null {
	const api = window.marked;
	if (typeof api?.Marked === 'function') {
		return api.Marked;
	}
	if (typeof api?.default?.Marked === 'function') {
		return api.default.Marked;
	}
	return null;
}

const CALLOUT_LABEL: Record<
	'solution' | 'developer-note' | 'agent-note' | 'prerequisites' | 'relevant-readings',
	string
> = {
	solution: 'Solution',
	'developer-note': 'Developer note',
	'agent-note': 'Agent note',
	prerequisites: 'Prerequisites',
	'relevant-readings': 'Relevant readings',
};

const DOCS_CODE_ICON =
	'<svg class="docs-callout-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';

const DOCS_ROBOT_ICON =
	'<svg class="docs-callout-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>';

/**
 * renderCollapsibleNote - expandable developer/agent callout with icon + label.
 */
function renderCollapsibleNote(
	noteClass: 'docs-developer-note' | 'docs-agent-note',
	iconSvg: string,
	label: string,
	innerHtml: string
): string {
	return `<details class="${noteClass}"><summary class="docs-collapsible-note-summary">${iconSvg}<span class="docs-collapsible-note-label">${label}</span></summary><div class="docs-callout-body">${innerHtml}</div></details>`;
}

/**
 * openMetaLinksInNewTab - adds target="_blank" to anchors in relevant-readings HTML.
 */
function openMetaLinksInNewTab(innerHtml: string): string {
	return innerHtml.replace(/<a (?![^>]*\btarget=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
}

/**
 * isMetaBoxEmpty - true when parsed meta HTML has no visible text.
 */
function isMetaBoxEmpty(innerHtml: string): boolean {
	return innerHtml.replace(/<[^>]+>/g, '').trim().length === 0;
}

/**
 * wrapMetaRow - stacks one or more meta boxes in the shared docs-meta-row layout.
 */
function wrapMetaRow(boxes: string[]): string {
	const visible = boxes.filter((box) => box.length > 0);
	if (visible.length === 0) {
		return '';
	}
	return `<div class="docs-meta-row">${visible.join('')}</div>`;
}

/**
 * renderMetaBox - prerequisites or relevant-readings block (stacked in docs-meta-row).
 */
function renderMetaBox(kind: 'prerequisites' | 'relevant-readings', innerHtml: string): string {
	if (isMetaBoxEmpty(innerHtml)) {
		return '';
	}
	const label = CALLOUT_LABEL[kind];
	const bodyHtml = kind === 'relevant-readings' ? openMetaLinksInNewTab(innerHtml) : innerHtml;
	return `<aside class="docs-meta-box docs-meta-box--${kind}"><p class="docs-meta-box-label">${label}</p><div class="docs-meta-box-body">${bodyHtml}</div></aside>`;
}

/**
 * buildCalloutMarkups - HTML for each extracted fence (pairs prerequisites + relevant-readings).
 */
async function buildCalloutMarkups(
	callouts: { kind: DocsCalloutKind; inner: string }[]
): Promise<string[]> {
	const markups: string[] = new Array(callouts.length).fill('');
	let i = 0;
	while (i < callouts.length) {
		const { kind, inner } = callouts[i];
		const innerHtml = await parseWithMarked(inner);

		if (kind === 'prerequisites' && callouts[i + 1]?.kind === 'relevant-readings') {
			const readingsHtml = await parseWithMarked(callouts[i + 1].inner);
			markups[i] = wrapMetaRow([
				renderMetaBox('prerequisites', innerHtml),
				renderMetaBox('relevant-readings', readingsHtml),
			]);
			markups[i + 1] = '';
			i += 2;
			continue;
		}

		if (kind === 'prerequisites' || kind === 'relevant-readings') {
			markups[i] = wrapMetaRow([renderMetaBox(kind, innerHtml)]);
			i += 1;
			continue;
		}

		if (kind === 'developer-note') {
			markups[i] = renderCollapsibleNote('docs-developer-note', DOCS_CODE_ICON, CALLOUT_LABEL[kind], innerHtml);
			i += 1;
			continue;
		}

		if (kind === 'agent-note') {
			markups[i] = renderCollapsibleNote('docs-agent-note', DOCS_ROBOT_ICON, CALLOUT_LABEL[kind], innerHtml);
			i += 1;
			continue;
		}

		markups[i] = `<aside class="docs-solution"><p class="docs-callout-label">${CALLOUT_LABEL[kind]}</p><div class="docs-callout-body">${innerHtml}</div></aside>`;
		i += 1;
	}
	return markups;
}

/**
 * renderMarkdown - marked parse with heading ids, escaped HTML, and callouts.
 *
 * Callout fences are extracted first so marked never calls parse re-entrantly
 * (that corrupts lexer state and throws on the next page).
 *
 * @param markdown - raw page source
 */
async function renderMarkdown(markdown: string): Promise<string> {
	const { body, callouts } = extractDocsCallouts(markdown);
	let html = await parseWithMarked(body);
	html = html.replace(/<p>DOCS_CALLOUT_PLACEHOLDER_(\d+)<\/p>/g, (_match, index: string) => {
		return `DOCS_CALLOUT_PLACEHOLDER_${index}`;
	});
	const markups = await buildCalloutMarkups(callouts);
	for (let i = 0; i < markups.length; i++) {
		html = html.replace(`DOCS_CALLOUT_PLACEHOLDER_${i}`, markups[i]);
	}
	return html;
}

/**
 * parseWithMarked - one isolated Marked instance per call (silent, no nested parse).
 *
 * @param src - markdown without live callout fences
 */
async function parseWithMarked(src: string): Promise<string> {
	const Ctor = resolveMarkedCtor();
	if (!Ctor) {
		return '<p>Markdown renderer failed to load.</p>';
	}

	const slugCounts = new Map<string, number>();
	const instance = new Ctor({ silent: true, async: false });
	instance.use({
		renderer: {
			html({ text }: MarkedHtmlToken): string {
				return escapeHtml(text);
			},
			heading({ depth, text }: MarkedHeadingToken): string {
				const base = slugifyHeading(text);
				const seen = slugCounts.get(base) ?? 0;
				slugCounts.set(base, seen + 1);
				const id = seen === 0 ? base : `${base}-${seen}`;
				return `<h${depth} id="${escapeHtml(id)}">${escapeHtml(text)}</h${depth}>\n`;
			},
			code({ text, lang, escaped }: MarkedCodeToken): string {
				if (docsCalloutKind(lang)) {
					return escapeHtml(text);
				}
				const body = escaped ? text : escapeHtml(text);
				const langName = (lang || '').trim().split(/\s+/)[0] || '';
				const cls = langName ? ` class="language-${escapeHtml(langName)}"` : '';
				return `<pre><code${cls}>${body}</code></pre>\n`;
			},
		},
	});
	const out = instance.parse(src);
	if (typeof out === 'object' && out !== null && 'then' in out) {
		return await out;
	}
	return String(out ?? '');
}

/**
 * setTocVisible - shows or hides the right-hand “On this page” nav.
 *
 * @param visible - whether the page has h2+ section headings
 */
function setTocVisible(visible: boolean): void {
	tocEl?.classList.toggle('is-empty', !visible);
}

/**
 * buildToc - fills the right-hand “On this page” list from h2/h3 and starts scroll-spy.
 */
function buildToc(): void {
	if (!articleEl || !tocListEl) {
		return;
	}
	headingObserver?.disconnect();
	const headings = Array.from(articleEl.querySelectorAll<HTMLElement>('h2, h3'));
	tocListEl.innerHTML = headings
		.map((heading) => {
			const id = heading.id;
			if (!id) {
				return '';
			}
			const level = heading.tagName === 'H3' ? ' docs-toc-link--h3' : '';
			return `<li><a class="docs-toc-link${level}" href="#${escapeHtml(id)}">${escapeHtml(heading.textContent || '')}</a></li>`;
		})
		.join('');

	const links = Array.from(tocListEl.querySelectorAll<HTMLAnchorElement>('.docs-toc-link'));
	if (headings.length === 0) {
		setTocVisible(false);
		return;
	}
	setTocVisible(true);

	try {
		headingObserver = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => entry.isIntersecting);
				if (visible.length === 0) {
					return;
				}
				const id = visible[0].target.id;
				for (const link of links) {
					link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
				}
			},
			{ rootMargin: '-64px 0px -60% 0px', threshold: 0.1 }
		);

		for (const heading of headings) {
			headingObserver.observe(heading);
		}
	} catch {
		headingObserver = null;
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initDocsPage);
} else {
	initDocsPage();
}
