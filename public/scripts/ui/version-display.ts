/**
 * Version Display
 * Renders unified app version in the bottom-left of the page.
 * Format: "v1.3.0" (SemVer MAJOR.MINOR.PATCH)
 */

const VERSION_DISPLAY_ID = 'version-display';
const API_VERSION_URL = '/api/version';

/** Fetches app version from API */
async function fetchVersion(): Promise<string> {
    try {
        const res = await fetch(API_VERSION_URL);
        if (!res.ok) return '—';
        const data = await res.json();
        return data.version ?? '—';
    } catch {
        return '—';
    }
}

/** Renders version display and mounts it to the DOM */
async function renderVersionDisplay(): Promise<void> {
    const container = document.getElementById(VERSION_DISPLAY_ID);
    if (!container) return;

    const version = await fetchVersion();

    container.innerHTML = `<span class="version-line">v${version}</span>`;
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVersionDisplay);
} else {
    renderVersionDisplay();
}
