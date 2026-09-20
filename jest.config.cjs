/**
 * Resolves the worker pool size, honouring a `JEST_MAX_WORKERS` override.
 *
 * The override takes either a worker count (`4`) or a share of the CPUs (`50%`); a
 * percentage is handed to Jest untouched, since Jest resolves that form itself.
 * Anything unparseable falls back to the default rather than failing the run.
 */
function resolveMaxWorkers() {
    const override = process.env.JEST_MAX_WORKERS;
    if (override && override.trim().endsWith('%')) return override.trim();
    const count = Number(override);
    return Number.isInteger(count) && count > 0 ? count : 4;
}

/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/public/scripts'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    // Browser-side modules use NodeNext-style relative imports with an explicit `.js`
    // extension that points at a `.ts` source file (there is no compiled `.js` beside
    // it under test). Node's resolver takes that extension literally, so strip it and
    // let moduleFileExtensions above find the `.ts` file instead.
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    // Development here runs in WSL2 with far more logical CPUs than RAM (24 against
    // ~16 GB). Jest's default of `cpus - 1` spawns 23 ts-jest workers at roughly
    // 0.5-1 GB each, which exhausts the VM and thrashes it into a hang rather than an
    // OOM kill, so nothing is logged and the run simply never returns. Cap the pool,
    // and raise it through JEST_MAX_WORKERS on a machine with the memory to spare.
    maxWorkers: resolveMaxWorkers(),
    clearMocks: true,
    collectCoverageFrom: ['src/db/**/*.ts', '!src/db/**/__tests__/**'],
    coverageDirectory: 'coverage',
    globals: {
        'ts-jest': {
            tsconfig: '<rootDir>/tsconfig.jest.json'
        }
    }
};
