/**
 * Copies Feather Icons into public/vendor so the instructor pages load it locally.
 * Loading it from a CDN raced the first render: refreshIcons() no-ops when the global
 * is not yet defined, so the first paint lost its icons. Run via: npm run vendor:feather
 */
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', 'feather-icons', 'dist', 'feather.min.js');
const targetDir = path.join(__dirname, '..', 'public', 'vendor', 'feather');
const target = path.join(targetDir, 'feather.min.js');

if (!fs.existsSync(source)) {
    console.error('[vendor:feather] Missing:', source, '- run npm install');
    process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log('[vendor:feather] Copied', path.relative(process.cwd(), target));
