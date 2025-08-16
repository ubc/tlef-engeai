## Student Mode Refactor — Phase 6 Test Plan (Polishing & QA)

### Scope
Final checks for performance, accessibility, error handling, and naming/export hygiene.

### Preconditions
- Phases 1–5 complete

### Test Cases

1) Preload performance
- On initial load, preload components (`chat-window`, `flag-message`, `disclaimer`)
- Inspect network: subsequent loads should be cache hits or faster

2) Accessibility & keyboard
- Focus moves to sensible targets on component loads (e.g., textarea)
- Keyboard: Enter to send; ESC closes modals; Tab order reasonable

3) Error handling UX
- Simulate component fetch failure (rename file temporarily)
- Expect: placeholder/errorFallback content appears, app remains usable

4) Naming/exports hygiene
- Imports consistently use `ChatTypes.ts` naming
- Barrels used where available (`lib/state/index`, `lib/utils/Index`)

5) Scroll & icon replacements
- After rendering and `feather.replace()`, verify scroll remains at bottom

### Notes
- No backend changes; tests are manual/visual plus console verification.


