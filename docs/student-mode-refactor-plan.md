## Student Mode Modular Refactor Plan

### Goal
Refactor `public/scripts/student-mode.ts` to follow the modular frontend architecture (State + Utils + Services + ComponentLoader) while preserving existing UX/flows. Frontend-only; ignore Canvas/LTI/session/security.

### Ground Truth & References
- Ground truth behavior: `public/scripts/(previous)student-mode.ts`
- Entry to refactor: `public/scripts/student-mode.ts`
- Components: `public/components/*.html`
- Mock AI endpoints: `POST /api/chat/message`, `GET /api/chat/health` (see `src/routes/chat.ts`)

### Non-Goals (for this refactor)
- No Canvas/CWL/session integration
- No backend security/auth changes
- No CSS/HTML redesign beyond wiring components

---

### Phase 0 — Discovery (context only)
- [x] Read `(previous)student-mode.ts` thoroughly to capture behaviors
- [x] Review `src/server.ts` and `src/routes/chat.ts` for mock endpoints

---

### Phase 1 — State-first refactor
- [ ] Ensure `ChatStateManager` API covers needed flows:
  - [ ] createChat(title)
  - [ ] deleteChat(chatId)
  - [ ] setActiveChat(chatId|null)
  - [ ] toggleChatPin(chatId)
  - [ ] addMessage(chatId, { sender, text, timestamp, artefact? })
  - [ ] pinMessage(chatId, messageId) / unpinMessage(chatId) / toggleMessagePin(chatId, messageId)
  - [ ] Queries: getActiveChat(), getAllChats(), getSortedChats(), getMessage(), getPinnedMessage()
- [ ] Add helper: `setActiveChatOrFirst()` (fallback selection after deletions)
- [ ] Keep current event names; emit `state:changed` consistently

---

### Phase 2 — Utils alignment
- [ ] Use `TimeUtils.formatFullTimestamp(...)` everywhere timestamps are shown
- [ ] Use `DOMUtils` for:
  - [ ] Element selection and event delegation
  - [ ] Class/visibility toggles (e.g., artefact panel)
  - [ ] Scroll helpers: `scrollToBottom`, `scrollIntoView`
- [ ] `ModalManager` completeness
  - [ ] Implement `ModalManager.closeModal(type)` to properly close overlays and clean up
- [ ] Event plumbing with `EventBus` for UI actions (decouple handlers):
  - [ ] `ui:send-message` payload `{ text: string }`
  - [ ] `ui:open-artefact` payload `{ chatId: number, messageId: number }`
  - [ ] `ui:message-menu:open` payload `{ x, y, messageId, isPinned, sender }` (future phase)

---

### Phase 3 — Chat API (mock-first, no session)
- [ ] Do NOT change existing `ChatApi.sendMessage` signature
- [ ] Add mock-friendly methods (no session/auth):
  - [ ] `sendMessageLocalMock(message: string): Promise<ChatResponse>` → POST `/api/chat/message`
  - [ ] `healthCheckLocal(): Promise<{ status: string }>` → GET `/api/chat/health` (optional)
- [ ] Reuse internal request logic where safe; otherwise do a local `fetch` in new methods

---

### Phase 4 — Entry orchestration (`student-mode.ts`)
- [ ] Replace in-file logic with orchestration that delegates to modules:
  - [ ] Use `ComponentLoader` to load:
    - [ ] `welcome-screen` when no chats
    - [ ] `chat-window` when chats exist
  - [ ] On `chat-window` load, wire UI via `DOMUtils` and `EventBus` only (no heavy logic):
    - [ ] Send button + Enter-to-send → emit `ui:send-message`
    - [ ] Pin/unpin active chat → `ChatStateManager.toggleChatPin`
    - [ ] Delete active chat → `ChatStateManager.deleteChat` + `setActiveChatOrFirst()`
  - [ ] Message flow:
    - [ ] On `ui:send-message`:
      - [ ] Add user message via `ChatStateManager.addMessage(...)`
      - [ ] Call `ChatApi.sendMessageLocalMock(text)` and add bot message on resolve
      - [ ] If bot message has artefact → emit `ui:open-artefact`
  - [ ] Render messages into `#message-area` using thin render helpers
    - [ ] Use `TimeUtils` for timestamps, `DOMUtils` for DOM ops, `replaceFeatherIcons`
    - [ ] Ensure scroll-to-bottom post-render
  - [ ] Artefact panel behaviors via `DOMUtils` and `EventBus` (`ui:open-artefact`)

---

### Phase 5 — Parity completion (post core chat send/receive)
- [ ] Message context menu
  - [ ] Lazy-load `components/message-menu.html` with `ComponentLoader`
  - [ ] Use `EventBus` to open/close; delegate actions (pin/unpin/flag)
- [ ] Flag message flow (frontend only)
  - [ ] Load `flag-message` component into panel/modal
  - [ ] Wire form submit to no-op/confirm for now
- [ ] Disclaimer
  - [ ] Use `ModalManager.showDisclaimer()` (loads `components/disclaimer.html`)
- [ ] Report history page
  - [ ] `ComponentLoader.loadComponent('report-history')`, wire back and expand/collapse

---

### Phase 6 — Polishing & QA
- [ ] Preload frequently used components (`chat-window`, `flag-message`, `disclaimer`)
- [ ] Accessibility: ARIA, focus management after loads, keyboard controls
- [ ] Error handling: graceful fallbacks for component/API fetch failures
- [ ] Naming/exports hygiene: prefer `ChatTypes.ts`; consistent barrel imports

---

### Acceptance Criteria
- [ ] `student-mode.ts` acts as an orchestrator only (thin), delegating to modules
- [ ] Identical UX/workflows for chat create, send, receive, pin, artefact auto-open
- [ ] No Canvas/session/security calls in frontend
- [ ] Works against local mock endpoint `/api/chat/message`
- [ ] Code is modular, readable, and consistent with architecture standards

### Out of Scope (can be separate tasks later)
- Persistence across reloads (storage or backend state)
- Instructor dashboards, analytics, or authentication flows


