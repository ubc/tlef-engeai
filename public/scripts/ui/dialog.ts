/**
 * Helpers for native `<dialog>` elements opened and closed by invoker commands.
 *
 * A dialog's markup lives in the page's HTML. Buttons open and close it declaratively:
 *
 *     <button type="button" commandfor="my-dialog" command="show-modal">Open</button>
 *     <button type="button" commandfor="my-dialog" command="close">Cancel</button>
 *
 * The browser then handles focus, Escape, the backdrop and stacking. A `<form method="dialog">`
 * inside the dialog closes it on submit and sets `dialog.returnValue` to the submitting
 * button's `value`, so a confirm button is `<button value="delete">` and the `close` event
 * reads `returnValue` to learn what was chosen.
 *
 * JS is only needed when one dialog serves many triggers (e.g. one "Delete" dialog for every
 * row): `onDialogOpenCommand` hands over the button that is opening the dialog, so its details
 * can be filled in before it shows.
 */

/** The parts of the browser's `CommandEvent` used here; TypeScript's DOM types don't have it yet. */
interface InvokerCommandEvent extends Event {
    readonly command: string;
    readonly source: Element | null;
}

let fallbackInstalled = false;

/**
 * supportsInvokerCommands — whether this browser acts on `commandfor`/`command` itself.
 */
export function supportsInvokerCommands(): boolean {
    return typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype;
}

/**
 * onDialogOpenCommand — runs `handler` with the button that is opening `dialog`, before it opens.
 *
 * `returnValue` is cleared first: the browser keeps the previous one, and Escape leaves it as it
 * was, so a stale "delete" would otherwise read as a fresh confirmation.
 *
 * @param dialog - Dialog opened by `command="show-modal"` buttons
 * @param handler - Fills in the dialog for this trigger; returning `false` keeps it closed
 * @param signal - Removes the listener when aborted
 */
export function onDialogOpenCommand(
    dialog: HTMLDialogElement,
    handler: (invoker: HTMLButtonElement) => boolean | void,
    signal?: AbortSignal
): void {
    dialog.addEventListener(
        'command',
        (event) => {
            const { command, source } = event as InvokerCommandEvent;
            if (command !== 'show-modal' || !(source instanceof HTMLButtonElement)) return;
            dialog.returnValue = '';
            if (handler(source) === false) {
                event.preventDefault();
            }
        },
        { signal }
    );
}

/**
 * showDialogAndWait — opens `dialog` from code (for dialogs no button opens, such as a result
 * shown after a request finishes) and resolves with its `returnValue` once it closes.
 *
 * The browser moves focus to the dialog's `autofocus` element, keeps Tab inside it, and on close
 * returns focus to whatever was focused before it opened.
 */
export function showDialogAndWait(dialog: HTMLDialogElement): Promise<string> {
    return new Promise((resolve) => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
        dialog.showModal();
    });
}

/**
 * installInvokerCommandFallback — makes `commandfor` buttons open and close dialogs in browsers
 * that predate invoker commands. It dispatches the same `command` event, so
 * `onDialogOpenCommand` works unchanged. Does nothing where the browser supports them.
 */
export function installInvokerCommandFallback(): void {
    if (fallbackInstalled || supportsInvokerCommands()) return;
    fallbackInstalled = true;

    // Capture phase: page handlers that stop propagation must not swallow the command.
    document.addEventListener(
        'click',
        (event) => {
            const button = (event.target as Element | null)?.closest?.('button[commandfor]');
            if (!(button instanceof HTMLButtonElement) || button.disabled) return;

            const dialog = document.getElementById(button.getAttribute('commandfor') ?? '');
            if (!(dialog instanceof HTMLDialogElement)) return;

            const command = button.getAttribute('command') ?? '';
            const commandEvent = Object.assign(new Event('command', { cancelable: true }), {
                command,
                source: button,
            });
            if (!dialog.dispatchEvent(commandEvent)) return;

            if (command === 'show-modal' && !dialog.open) {
                dialog.showModal();
            } else if ((command === 'close' || command === 'request-close') && dialog.open) {
                dialog.close(button.value);
            }
        },
        true
    );
}
