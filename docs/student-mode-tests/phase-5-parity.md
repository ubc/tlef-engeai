## Student Mode Refactor — Phase 5 Test Plan (Parity Completion)

### Scope
Validate non-core UX elements match ground truth behaviors after core chat is working.

### Preconditions
- Phases 1–4 complete

### Test Cases

1) Message context menu
- Right-click or click the chevron on a message
- Expect: message menu appears near trigger
- Actions: Pin/Unpin affects message banner; Flag visible only for bot messages

2) Flag message flow (frontend-only)
- Choose Flag → load `flag-message` component in panel/modal
- Complete form and submit
- Expect: show confirmation (no backend) and close

3) Disclaimer modal
- Trigger disclaimer link
- Expect: modal loads via `ModalManager`, ESC/backdrop/close button work

4) Report history
- Click report history button
- Expect: `report-history` component loads; expand/collapse works; back button returns to chat

### Notes
- Keep flows frontend-only; no server persistence required.


