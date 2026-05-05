/**
 * Copies Chart.js UMD bundle from node_modules into public/ so the browser can load it
 * from the same origin (no CDN). Run via: npm run vendor:chart
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
const outDir = path.join(__dirname, '..', 'public', 'vendor', 'chart.js');
const dest = path.join(outDir, 'chart.umd.js');

if (!fs.existsSync(src)) {
    console.error('[vendor:chart] Missing:', src, '- run npm install');
    process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[vendor:chart] Copied Chart.js UMD to', path.relative(process.cwd(), dest));
