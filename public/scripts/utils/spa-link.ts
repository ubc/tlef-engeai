/**
 * Sidebar navigation links for the single-page app shells.
 *
 * Navigation items are real `<a href>` elements so assistive technology announces them as
 * links and they can be opened in a new tab or copied. A plain left click is handled
 * in-app (no page reload); modified clicks (Ctrl/Cmd/Shift/Alt, middle click) are left to
 * the browser so they open the href natively.
 */

/**
 * Gives a sidebar link its href and routes plain left clicks through `navigate`.
 *
 * @param link - The `<a>` element (no-op when missing)
 * @param href - Real URL of the destination; omitted when it can't be built (e.g. no course in the URL)
 * @param navigate - In-app navigation to run instead of a full page load
 */
export function bindSpaLink(link: HTMLElement | null, href: string | null, navigate: () => void | Promise<void>): void {
    if (!link) return;
    if (href && link instanceof HTMLAnchorElement) {
        link.href = href;
    }

    link.addEventListener('click', (e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
            return;
        }
        e.preventDefault();
        void navigate();
    });
}
