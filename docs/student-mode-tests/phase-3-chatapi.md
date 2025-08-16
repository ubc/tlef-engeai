## Student Mode Refactor — Phase 3 Test Plan (Chat API Mock)

### Scope
Validate new mock-friendly `ChatApi` methods that bypass session/auth and hit local mock endpoints.

### Preconditions
- Server running (`src/server.ts`) with routes from `src/routes/chat.ts`
- Network available at `http://localhost:<port>`

### Test Cases

1) Health check
- Action: `ChatApi.healthCheckLocal()`
- Expect: `{ status: 'healthy', ... }` shape, no auth headers required

2) Send message (mock)
- Action: `ChatApi.sendMessageLocalMock('hello thermodynamics')`
- Expect: `reply` string, numeric `timestamp`
- Expect (depending on keyword): `artefact` may be present with `{ type:'mermaid', source:string }`
- Timing: response should arrive within ~0.5–2.5s (simulated delay)

3) Error handling
- Action: `ChatApi.sendMessageLocalMock('')` (empty string)
- Expect: 400 from server; method should throw with readable error

### Notes
- These methods must not depend on `setSession()` or any Canvas headers.
- Keep existing `sendMessage(...)` intact for future LTI integration.


