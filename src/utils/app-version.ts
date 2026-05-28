/**
 * Re-export npm package version (SemVer MAJOR.MINOR.PATCH).
 * Single source of truth: package.json "version" field.
 */

import pkg from '../../package.json';

export const appVersion: string = pkg.version;
