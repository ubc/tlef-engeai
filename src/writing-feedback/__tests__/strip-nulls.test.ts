/**
 * @fileoverview Pins stripNulls's key-omission behavior — the fix for OpenAI's
 * structured-output mode sending explicit `null` for unset optional fields, which
 * MongoDB's driver would otherwise round-trip back as a stored null on write.
 */

import { stripNulls } from '../strip-nulls';

describe('stripNulls', () => {
    it('omits a top-level null-valued key entirely, not just sets it to undefined', () => {
        const result = stripNulls({ a: 'x', b: null });
        expect('b' in result).toBe(false);
        expect(result).toEqual({ a: 'x' });
    });

    it('recurses into nested objects', () => {
        const result = stripNulls({ outer: { inner: null, kept: 1 } });
        expect('inner' in result.outer).toBe(false);
        expect(result.outer.kept).toBe(1);
    });

    it('recurses into arrays of objects', () => {
        const result = stripNulls([{ a: null, b: 1 }, { a: 2, b: null }]);
        expect('a' in result[0]).toBe(false);
        expect(result[0].b).toBe(1);
        expect(result[1].a).toBe(2);
        expect('b' in result[1]).toBe(false);
    });

    it('leaves non-null values, including falsy ones, untouched', () => {
        const result = stripNulls({ zero: 0, empty: '', falseValue: false, list: [] });
        expect(result).toEqual({ zero: 0, empty: '', falseValue: false, list: [] });
    });

    it('passes primitives through unchanged', () => {
        expect(stripNulls('text')).toBe('text');
        expect(stripNulls(42)).toBe(42);
        expect(stripNulls(undefined)).toBeUndefined();
    });
});
