/**
 * Validates `{ orderedIds }` request body for topic/week instance reorder routes.
 */
export function parseOrderedIdsBody(body: unknown): string[] | null {
    if (body === null || typeof body !== 'object') {
        return null;
    }
    const orderedIds = (body as { orderedIds?: unknown }).orderedIds;
    if (!Array.isArray(orderedIds)) {
        return null;
    }
    if (!orderedIds.every((id) => typeof id === 'string' || typeof id === 'number')) {
        return null;
    }
    return orderedIds.map((id) => String(id));
}
