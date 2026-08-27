/**
 * Copies marked UMD + ESM from node_modules into public/ so the docs page
 * can load it from the same origin (no CDN). Run via: npm run vendor:marked
 */
const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'node_modules', 'marked', 'lib');
const outDir = path.join(__dirname, '..', 'public', 'vendor', 'marked');
const files = [
	{ src: 'marked.umd.js', dest: 'marked.umd.js' },
	{ src: 'marked.esm.js', dest: 'marked.esm.js' },
];

fs.mkdirSync(outDir, { recursive: true });
for (const file of files) {
	const src = path.join(libDir, file.src);
	if (!fs.existsSync(src)) {
		console.error('[vendor:marked] Missing:', src, '- run npm install');
		process.exit(1);
	}
	const dest = path.join(outDir, file.dest);
	fs.copyFileSync(src, dest);
	console.log('[vendor:marked] Copied', path.relative(process.cwd(), dest));
}
