const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');

const publicRoot = path.resolve(__dirname, '../public');
const component = readFileSync(path.join(publicRoot, 'components/documents/documents-instructor.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
let browser;

before(async () => {
    browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
});

after(async () => {
    await browser?.close();
});

for (const width of [1280, 390]) {
    for (const label of ['Add Week', 'Add Topic']) {
        test(`${label} supports Tab, Enter, Space and click at ${width}px`, async () => {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            try {
                await page.route('**/*', async (route) => {
                    const url = new URL(route.request().url());
                    if (url.origin !== 'http://engeai.test') return route.abort();
                    const file = path.resolve(publicRoot, `.${url.pathname}`);
                    if (!file.startsWith(`${publicRoot}${path.sep}`)) return route.abort();
                    await route.fulfill({ path: file });
                });
                await page.setContent(`<base href="http://engeai.test/"><link rel="stylesheet" href="/styles/style.css"><link rel="stylesheet" href="/styles/instructor-mode.css"><link rel="stylesheet" href="/styles/page-shell.css">${component}`);
                await page.locator('#add-division-btn').evaluate((control, text) => {
                    control.textContent = text;
                    control.dataset.clicks = '0';
                    control.addEventListener('click', () => {
                        control.dataset.clicks = String(Number(control.dataset.clicks) + 1);
                    });
                }, label);
                await page.locator('.division-control-panel').evaluate((panel) => {
                    panel.tabIndex = -1;
                    panel.focus();
                });
                await page.keyboard.press('Tab');
                if (process.env.DOCUMENTS_A11Y_SHOTS && label === 'Add Week') {
                    mkdirSync(process.env.DOCUMENTS_A11Y_SHOTS, { recursive: true });
                    await page.screenshot({ path: path.join(process.env.DOCUMENTS_A11Y_SHOTS, `add-week-${width}.png`) });
                }
                assert.equal(await page.evaluate(() => document.activeElement.id), 'add-division-btn');
                const control = page.getByRole('button', { name: label, exact: true });
                assert.equal(await control.count(), 1);
                assert.equal(await control.getAttribute('type'), 'button');
                await page.keyboard.press('Enter');
                assert.equal(await control.getAttribute('data-clicks'), '1');
                await page.keyboard.press('Space');
                assert.equal(await control.getAttribute('data-clicks'), '2');
                assert.equal(await page.evaluate(() => document.activeElement.id), 'add-division-btn');
                await page.keyboard.press('Tab');
                const nextControl = width > 768 ? '#copy-materials-btn' : '.overflow-trigger';
                assert.equal(await page.evaluate((selector) => document.activeElement.matches(selector), nextControl), true);
                await control.click();
                assert.equal(await control.getAttribute('data-clicks'), '3');
            } finally {
                await page.close();
            }
        });
    }
}
