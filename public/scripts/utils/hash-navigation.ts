/**
 * In-page hash links (`#…`) for the single-page app shells.
 *
 * Following a hash link, or going Back/Forward between hash entries, fires `popstate`. The
 * shell routers treat every popstate as a view change and rebuild the view, which would
 * destroy the element the link points at. They call `isHashOnlyNavigation` first and leave
 * hash-only changes to the feature that owns the target (e.g. ChatManager focusing a message heading).
 */

interface TrackedLocation {
    pathAndQuery: string;
    hash: string;
}

function readLocation(): TrackedLocation {
    return {
        pathAndQuery: window.location.pathname + window.location.search,
        hash: window.location.hash,
    };
}

let lastLocation: TrackedLocation = readLocation();

/**
 * Reports whether a popstate changed only the URL hash, then records the current URL for
 * the next call. Call it once at the top of the shell's popstate router.
 *
 * In-app navigation dispatches synthetic popstate events after changing the path; those are
 * never hash-only, so the router still runs for them.
 *
 * @param event - The popstate event being routed
 */
export function isHashOnlyNavigation(event: PopStateEvent): boolean {
    const previous = lastLocation;
    lastLocation = readLocation();
    return (
        event.isTrusted &&
        lastLocation.pathAndQuery === previous.pathAndQuery &&
        lastLocation.hash !== previous.hash
    );
}

/**
 * Adds a history entry for `hash` on the current page, so Back returns to the previous hash.
 * Unlike following the link, pushState doesn't fire popstate. No-op when the URL already has
 * that hash, so repeat clicks don't stack duplicate entries.
 *
 * @param hash - Fragment including the leading `#`
 */
export function pushHashLocation(hash: string): void {
    if (window.location.hash === hash) return;
    window.history.pushState(window.history.state, '', hash);
    lastLocation = readLocation();
}
