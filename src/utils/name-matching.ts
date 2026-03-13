/**
 * Name Matching Utility
 *
 * Provides fuzzy/word-based matching for instructor names to handle variations
 * such as "Amir S. Dekhoda" matching "Amir Dekhoda", "Charisma P Rusdiyanto" matching "Charisma Rusdiyanto".
 *
 * @author: EngE-AI Team
 * @since: 2026-02-23
 */

/**
 * Normalizes a name for comparison by:
 * - Lowercasing and trimming
 * - Removing single-letter tokens (e.g. "S", "P", "J")
 * - Removing common suffixes (Jr., Sr., III, etc.)
 * - Collapsing whitespace
 *
 * @param name - Raw name string (e.g. "Amir S. Dekhoda")
 * @returns Normalized comparable key (e.g. "amir dekhoda")
 */
export function normalizeNameForMatching(name: string): string {
    if (!name || typeof name !== 'string') return '';

    let normalized = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\./g, ' ');

    const words = normalized.split(/\s+/).filter(Boolean);

    const significantWords = words.filter((word) => {
        if (word.length <= 1) return false;
        const lower = word.toLowerCase();
        if (['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md'].includes(lower)) return false;
        return true;
    });

    return significantWords.join(' ').trim();
}

/**
 * Checks if two names refer to the same person using word-based matching.
 * Handles middle initials, extra spaces, and minor variations.
 *
 * @param storedName - Name as stored in the database (e.g. "Amir Dehkhoda")
 * @param sessionName - Name from session/auth (e.g. "Amir S. Dekhoda")
 * @returns true if names match
 */
export function namesMatch(storedName: string, sessionName: string): boolean {
    if (!storedName || !sessionName) return false;

    const storedKey = normalizeNameForMatching(storedName);
    const sessionKey = normalizeNameForMatching(sessionName);

    if (!storedKey || !sessionKey) return false;

    if (storedKey === sessionKey) return true;

    const storedWords = storedKey.split(/\s+/).filter(Boolean);
    const sessionWords = sessionKey.split(/\s+/).filter(Boolean);

    if (storedWords.length === 0 || sessionWords.length === 0) return false;

    const firstMatch = storedWords[0] === sessionWords[0];
    const lastStored = storedWords[storedWords.length - 1];
    const lastSession = sessionWords[sessionWords.length - 1];
    const lastMatch = lastStored === lastSession;

    if (firstMatch && lastMatch) return true;

    if (sessionWords.length === 1 && storedWords[0] === sessionWords[0]) {
        return true;
    }

    return false;
}
