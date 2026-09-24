/**
 * onboarding-layout-guard.mjs
 *
 * Fails when the floating tutorial navigation covers an interactive control.
 *
 * The navigation is `position: absolute; bottom: 2rem; right: 2rem; z-index: 10`
 * and floats over the scroll area. Where it lands on the control that satisfies a
 * gated step, the tutorial becomes unfinishable — flag-setup step 4's Edit
 * Response button gates step 5. No type check or Jest test can see this, so it is
 * checked in a real browser at the viewports the tutorials are used on.
 *
 * Requires `playwright` as a devDependency.
 *
 * On this workspace, cached Chromium may need NSS libraries from cached
 * Firefox. The script auto-detects both under ~/.cache/ms-playwright, while
 * still accepting CHROME_BIN / LD_LIBRARY_PATH as fallbacks.
 *
 * Run: npm run check:onboarding-layout
 */

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch (err) {
    console.error(
        'onboarding-layout-guard: could not load "playwright".\n' +
        'Install it with: npm i -D playwright@1.56.0\n' +
        `(${err && err.message ? err.message : err})`
    );
    process.exit(1);
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT_CACHE = path.join(process.env.HOME || '', '.cache', 'ms-playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const HARNESS = '/components/onboarding/__harness__/layout-harness.html';
const PORT = 4399;
const TYPES = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'
};

/** Every stage and how many steps it has. */
const STAGES = {
    'course-setup': 5,
    'document-setup': 4,
    'scenario-generation-setup': 4,
    'writing-feedback-setup': 6,
    'guided-pathway-setup': 5,
    'flag-setup': 5,
    'monitor-setup': 4
};

/** Phone, the five common iPad sizes, and desktop. iPad is worst served. */
const VIEWPORTS = [
    ['mobile', 390, 844],
    ['ipad-mini', 744, 1133],
    ['ipad-portrait', 768, 1024],
    ['ipad-pro-portrait', 834, 1112],
    ['ipad-landscape', 1024, 768],
    ['ipad-pro-landscape', 1112, 834],
    ['desktop', 1440, 900]
];

function versionNumber(name, prefix) {
    const value = Number.parseInt(name.slice(prefix.length), 10);
    return Number.isFinite(value) ? value : -1;
}

function cacheDirs(prefix) {
    if (!PLAYWRIGHT_CACHE || !fs.existsSync(PLAYWRIGHT_CACHE)) return [];
    return fs.readdirSync(PLAYWRIGHT_CACHE, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
        .map((entry) => entry.name)
        .sort((a, b) => versionNumber(b, prefix) - versionNumber(a, prefix))
        .map((name) => path.join(PLAYWRIGHT_CACHE, name));
}

function firstExisting(paths) {
    return paths.find((candidate) => candidate && fs.existsSync(candidate));
}

function resolveChromiumExecutable() {
    const cached = firstExisting(cacheDirs('chromium-').map((dir) => path.join(dir, 'chrome-linux64', 'chrome')));
    return cached || (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : undefined);
}

function resolveFirefoxLibraryPath() {
    const cached = firstExisting(cacheDirs('firefox-').map((dir) => path.join(dir, 'firefox')));
    if (cached) return cached;
    return process.env.LD_LIBRARY_PATH || undefined;
}

const firefoxLibraryPath = resolveFirefoxLibraryPath();
if (firefoxLibraryPath && !process.env.LD_LIBRARY_PATH?.split(':').includes(firefoxLibraryPath)) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
        ? `${firefoxLibraryPath}:${process.env.LD_LIBRARY_PATH}`
        : firefoxLibraryPath;
}

const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(PORT, resolve));

const browser = await chromium.launch({
    executablePath: resolveChromiumExecutable(),
    args: ['--no-sandbox', '--disable-gpu']
});

const failures = [];
for (const [component, stepCount] of Object.entries(STAGES)) {
    for (let step = 1; step <= stepCount; step++) {
        for (const [label, width, height] of VIEWPORTS) {
            const page = await browser.newPage({ viewport: { width, height } });
            await page.goto(`http://localhost:${PORT}${HARNESS}?component=${component}&step=${step}`);
            try {
                await page.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
            } catch {
                failures.push(`${component} step${step} ${label}: harness never became ready`);
                await page.close();
                continue;
            }

            // Smooth scrolling animates, so rects read straight after setting
            // scrollTop describe a position the user never rests at. Several
            // onboarding steps also play a one-shot CSS `animation` (e.g.
            // .expanded-content's 0.3s slideDown, which tweens max-height
            // from 0) on every render, not just on toggle -- so scrollHeight
            // itself is a moving target until that settles too. Kill both
            // before measuring so the DOM is at the resting layout the user
            // actually ends up at.
            await page.addStyleTag({
                content: '*, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }'
            });
            await page.evaluate(() => {
                let el = document.querySelector('.content-step.active');
                while (el) {
                    if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
                    el = el.parentElement;
                }
            });
            await page.waitForTimeout(250);

            const covered = await page.evaluate(() => {
                const active = document.querySelector('.content-step.active');
                const nav = document.querySelector('.onboarding-navigation');
                if (!active || !nav) return [];
                const nb = nav.getBoundingClientRect();
                if (!nb.width || !nb.height) return [];
                const selector = 'button, input, select, textarea, a[href], [role="button"], summary, label';
                const out = [];
                for (const control of active.querySelectorAll(selector)) {
                    const r = control.getBoundingClientRect();
                    if (!r.width || !r.height) continue;
                    if (r.bottom < 0 || r.top > innerHeight) continue;
                    const hit = !(r.bottom <= nb.top || r.top >= nb.bottom || r.right <= nb.left || r.left >= nb.right);
                    if (!hit) continue;
                    const name = control.id || control.className || control.tagName;
                    const text = (control.textContent || control.value || '').trim().slice(0, 40);
                    out.push(`${name} :: ${text}`);
                }
                return [...new Set(out)];
            });

            if (covered.length) {
                failures.push(`${component} step${step} ${label} (${width}x${height}): nav covers ${JSON.stringify(covered)}`);
            }
            await page.close();
        }
    }
}

await browser.close();
server.close();

if (failures.length) {
    console.error('Onboarding navigation covers interactive controls:\n' + failures.join('\n'));
    process.exit(1);
}
console.log('onboarding layout guard: no controls covered by the navigation');
