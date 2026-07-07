// src/helpers/route-params.ts

import type { ParamsDictionary } from 'express-serve-static-core';

/**
 * Coerce one Express path param to string (Express 5 types allow string | string[]).
 *
 * EngE-AI uses named segments only (`/:courseId`), not wildcard (`/*id`) routes.
 */
export function asRouteParam(value: string | string[] | undefined): string {
    if (value === undefined) {
        return '';
    }
    return Array.isArray(value) ? (value[0] ?? '') : value;
}

/** Read a named segment from `req.params` by name. */
export function routeParam(params: ParamsDictionary, name: string): string {
    return asRouteParam(params[name]);
}

/** Normalize all entries in `req.params` to strings (for destructuring). */
export function normalizeRouteParams(params: ParamsDictionary): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        out[key] = asRouteParam(value);
    }
    return out;
}
