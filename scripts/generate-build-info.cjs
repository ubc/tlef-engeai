/**
 * Captures the current git commit into src/generated/build-info.json so it can be
 * embedded in the build (see src/utils/build-info.ts). Run via: npm run build:info
 * (wired into build:backend so it always runs before tsc).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outDir = path.join(__dirname, '..', 'src', 'generated');
const outFile = path.join(outDir, 'build-info.json');

function git(cmd) {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

let buildInfo = {
    commit: 'unknown',
    commitShort: 'unknown'
};

try {
    buildInfo.commit = git('git rev-parse HEAD');
    buildInfo.commitShort = git('git rev-parse --short HEAD');
} catch (err) {
    console.warn('[build:info] Could not read git commit (not a git repo / no commits?) - using "unknown".', err.message);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(buildInfo, null, 2) + '\n');
console.log([
    '*',
    '*',
    '*————————— BUILD INFO-------------------',
    '*',
    `[build:info] Wrote ${path.relative(process.cwd(), outFile)} - ${buildInfo.commitShort}`,
    '*',
    '*—————————BUILD INFO———————————',
    '*',
    '*',
].join('\n'));
