// public/scripts/docs/docs-markdown.ts

/**
 * Docs markdown helpers — path mapping, slugs, and HTML escape for the public viewer.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-13
 * @version: 1.0.0
 * @description: Pure helpers for /docs URL → file mapping and heading ids.
 */

const DOCS_SLUG_PATTERN = /^[a-z0-9][a-z0-9/-]*$/i;

/**
 * slugifyHeading - turns heading text into a URL fragment id.
 *
 * @param text - visible heading text
 * @returns kebab-case id, or `section` when empty
 */
export function slugifyHeading(text: string): string {
	const slug = text
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
	return slug || 'section';
}

/**
 * currentDocSlug - sidebar path for the current location.
 *
 * `/docs` and `/docs/overview` both map to `overview`.
 *
 * @param pathname - `location.pathname`
 * @returns nav.json path slug
 */
export function currentDocSlug(pathname: string): string {
	const raw = pathname.replace(/^\/docs\/?/, '').replace(/\/+$/, '');
	return raw || 'overview';
}

/**
 * isSafeDocSlug - true when a URL slug cannot escape public/docs/.
 *
 * @param slug - path after /docs/
 */
function isSafeDocSlug(slug: string): boolean {
	return !slug.includes('..') && !slug.includes('\\') && DOCS_SLUG_PATTERN.test(slug);
}

/**
 * docUrlToMarkdownPath - maps a docs URL to a static markdown file.
 *
 * Returns null when the slug is empty of safe characters (path traversal).
 *
 * @param pathname - `location.pathname`
 * @returns same-origin path like `/docs/overview.md`, or null
 */
export function docUrlToMarkdownPath(pathname: string): string | null {
	const urls = markdownCandidateUrls(pathname);
	return urls[0] ?? null;
}

/**
 * markdownCandidateUrls - fetch order for a docs path (`index.md` then `.md`).
 *
 * @param pathname - `location.pathname`
 * @returns same-origin markdown URLs to try
 */
export function markdownCandidateUrls(pathname: string): string[] {
	const slug = currentDocSlug(pathname);
	if (!isSafeDocSlug(slug)) {
		return [];
	}
	if (slug === 'overview') {
		return ['/docs/overview.md'];
	}
	return [`/docs/${slug}/index.md`, `/docs/${slug}.md`];
}

/**
 * isMarkdownHttpResponse - true when fetch returned markdown, not the HTML shell.
 *
 * @param response - fetch result
 * @param body - response text (HTML shells start with `<!DOCTYPE` / `<html`)
 */
export function isMarkdownHttpResponse(response: Response, body: string): boolean {
	if (!response.ok) {
		return false;
	}
	const type = (response.headers.get('content-type') || '').toLowerCase();
	if (type.includes('text/html')) {
		return false;
	}
	const start = body.trimStart().slice(0, 15).toLowerCase();
	return !start.startsWith('<!doctype') && !start.startsWith('<html');
}

export type DocsCalloutKind =
	| 'solution'
	| 'developer-note'
	| 'agent-note'
	| 'prerequisites'
	| 'relevant-readings';

/**
 * docsCalloutKind - maps a fence language to a docs callout, or null for normal code.
 *
 * Accepts `solution`, `developer-note`, `agent-note`, `prerequisites`, and `relevant readings`.
 *
 * @param lang - marked `lang` field (may include extra info)
 */
export function docsCalloutKind(lang: string | undefined): DocsCalloutKind | null {
	const name = (lang || '').trim().toLowerCase().replace(/\s+/g, '-');
	if (name === 'solution') {
		return 'solution';
	}
	if (name === 'developer-note') {
		return 'developer-note';
	}
	if (name === 'agent-note') {
		return 'agent-note';
	}
	if (name === 'prerequisites') {
		return 'prerequisites';
	}
	if (name === 'relevant-readings') {
		return 'relevant-readings';
	}
	return null;
}

/**
 * extractDocsCallouts - pulls callout fences out so marked never re-enters parse.
 *
 * @param markdown - raw page source
 * @returns body with placeholders, plus callout inner markdown in order
 */
export function extractDocsCallouts(markdown: string): {
	body: string;
	callouts: { kind: DocsCalloutKind; inner: string }[];
} {
	const callouts: { kind: DocsCalloutKind; inner: string }[] = [];
	const body = markdown.replace(/```([^\n]*)\n([\s\S]*?)```/g, (match, lang: string, inner: string) => {
		const kind = docsCalloutKind(lang);
		if (!kind) {
			return match;
		}
		const index = callouts.length;
		callouts.push({ kind, inner: String(inner).trim() });
		return `\n\nDOCS_CALLOUT_PLACEHOLDER_${index}\n\n`;
	});
	return { body, callouts };
}

/**
 * escapeHtml - encodes text for safe insertion into HTML.
 *
 * @param text - raw string
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * docsHrefForPath - canonical in-app href for a nav.json path.
 *
 * @param path - nav path (`overview`, `getting-started`)
 */
export function docsHrefForPath(navPath: string): string {
	return navPath === 'overview' ? '/docs' : `/docs/${navPath}`;
}
