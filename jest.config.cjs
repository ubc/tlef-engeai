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
    clearMocks: true,
    collectCoverageFrom: ['src/db/**/*.ts', '!src/db/**/__tests__/**'],
    coverageDirectory: 'coverage',
    globals: {
        'ts-jest': {
            tsconfig: '<rootDir>/tsconfig.jest.json'
        }
    }
};
