## Student Mode Refactor — Phase 4 Test Plan (Entry Orchestration)

### Scope
Validate `public/scripts/student-mode.ts` acts as an orchestrator only, delegating to modules and preserving UX for core chat flows.

### Preconditions
- Components available (`public/components/*.html`)
- State + utils + mock ChatApi completed from prior phases

### Test Cases

1) Initial load behavior
- Fresh page load with no chats
- Expect: `welcome-screen` is loaded in main area
- Click “Add Chat” → creates chat, loads `chat-window` and sets active

2) Chat-window wiring
- Textarea auto-grows up to 4 lines
- Send via button and via Enter (no Shift)
- Expect: user message appears immediately; input clears; scroll to bottom

3) Receive AI reply (mock)
- After send, reply arrives and renders
- If reply has artefact, artefact panel auto-opens with rendered Mermaid

4) Pin/unpin chat
- Toggle pin button in header
- Expect: chat list reorders; icon state updates

5) Delete chat
- Delete active chat
- Expect: fallback selection (`setActiveChatOrFirst`) applied and UI updates accordingly

6) Rendering details
- Timestamps use `TimeUtils.formatFullTimestamp`
- Feather icons rendered in areas where icons appear
- Scroll behavior correct even after icon replacement

### Notes
- Entry file should not contain business logic; only orchestration, event wiring, and calls into modules.


