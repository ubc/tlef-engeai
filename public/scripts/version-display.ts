/**
 * Version Display
 * Renders frontend and backend versions in the bottom-left of the page.
 * Format: "F v1.0.0" and "B v1.0.0"
 */

import { frontendVersion } from './frontend-version.js';

const VERSION_DISPLAY_ID = 'version-display';
const API_VERSION_URL = '/api/version';

/** Fetches backend version from API */
async function fetchBackendVersion(): Promise<string> {
    try {
        const res = await fetch(API_VERSION_URL);
        if (!res.ok) return '—';
        const data = await res.json();
        return data.backendVersion ?? '—';
    } catch {
        return '—';
    }
}

/** Renders version display and mounts it to the DOM */
async function renderVersionDisplay(): Promise<void> {
    const container = document.getElementById(VERSION_DISPLAY_ID);
    if (!container) return;

    const backendVersion = await fetchBackendVersion();

    container.innerHTML = `
        <span class="version-line">F v${frontendVersion}</span>
        <span class="version-line">B v${backendVersion}</span>
    `;
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVersionDisplay);
} else {
    renderVersionDisplay();
}
