## Student Mode Refactor — Phase 2 Test Plan (Utils)

### Scope
Validate `DOMUtils`, `TimeUtils`, `ModalManager`, and `EventBus` utility behaviors used by student mode.

### Preconditions
- Served app so HTML components can load
- Minimal test HTML present via existing components (no code changes required)

### Test Cases

1) Time formatting
- Action: `TimeUtils.formatFullTimestamp(Date.now())`
- Expect: contains `Today` and current HH:MM
- Action: with yesterday timestamp
- Expect: contains `Yesterday`

2) DOM selection & manipulation
- Action: `DOMUtils.findElement('#chat-title', true)` after loading `chat-window`
- Expect: returns element
- Action: `DOMUtils.setText('#chat-title', 'Test')`
- Expect: title updates
- Action: class toggles show/hide on dummy element

3) Event handling utilities
- Setup: create button in DOM
- Action: `DOMUtils.addEventListener(button, 'click', handler)`
- Expect: handler called; removeListener stops calls
- Action: delegated handler with `delegateSelector`
- Expect: only fires for matching targets

4) Scroll helpers
- Setup: message container with overflow
- Action: `DOMUtils.scrollToBottom('#message-area')`
- Expect: scrolled to bottom without error

5) EventBus
- Action: `globalEventBus.on('test', h); emit('test', 1,2,3)`
- Expect: handler invoked; `once()` fires once; `off()` removes
- Action: `listenerCount`, `eventNames`, `hasListeners`
- Expect: values reflect registrations accurately

6) ModalManager close lifecycle
- Action: `ModalManager.showDisclaimer()`
- Expect: overlay appears, body has `modal-open`
- Action: programmatically close via `ModalManager.closeModal('disclaimer')`
- Expect: overlay removed, body class cleaned up; escape handler detached

### Notes
- `ModalManager.closeModal` must be implemented before this test can fully pass.


