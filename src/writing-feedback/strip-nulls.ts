/**
 * Strip nulls — normalizes structured-output `null` back to plain-optional absence
 *
 * OpenAI's structured-output JSON-schema mode requires every optional field to also
 * be nullable, so a model response can carry an explicit `null` for any field it left
 * unset. This codebase's contracts treat "unset" as an absent key, not `null`, and
 * every one of these results is eventually persisted to MongoDB — whose driver
 * serializes an undefined-valued property as a stored BSON null on write, which would
 * hand a literal `null` back to a schema that only accepts a value or absence on the
 * next read. Removing the key outright, not merely setting it to `undefined`, is what
 * actually closes that gap end to end.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.0.0
 * @description: Recursively omits null-valued object keys from a structured-output result.
 */

/** Removes `null` from a type everywhere stripNulls removes it from the value, recursively. */
export type WithoutNull<T> = T extends null
    ? never
    : T extends (infer Item)[]
        ? WithoutNull<Item>[]
        : T extends object
            ? { [K in keyof T]: WithoutNull<T[K]> }
            : T;

/**
 * stripNulls - recursively removes any object key whose value is `null`.
 *
 * Safe for this module's structured-output results specifically: none of their schemas
 * use `null` as a meaningful value in its own right, only as the structured-output
 * encoding of "this optional field was left unset." The return type reflects the same
 * narrowing at compile time, so callers no longer need `?? undefined`/casts afterward.
 *
 * @param value - Parsed structured-output value (object, array, or primitive)
 * @returns The same shape with every null-valued key omitted instead of present
 */
export function stripNulls<T>(value: T): WithoutNull<T> {
    if (Array.isArray(value)) {
        return value.map((item) => stripNulls(item)) as unknown as WithoutNull<T>;
    }
    if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (entry === null) continue;
            result[key] = stripNulls(entry);
        }
        return result as WithoutNull<T>;
    }
    return value as WithoutNull<T>;
}
