# Student Onboarding Mobile Improvements – Post-Implementation Review

This document outlined what went wrong in the initial implementation and how to fix it. **Fixes have been implemented** (see changelog below).

---

## Issue 1: Onboarding Steps Panel Still Visible

### What Went Wrong

The steps panel (`.onboarding-steps-panel`) is still visible on mobile despite the intended fix.

### Root Cause Analysis

1. **Selector scope**: The rule `.student-onboarding .onboarding-steps-panel { display: none !important }` is in `student-onboarding.css` inside `@media (max-width: 768px)`. The HTML has `class="onboarding student-onboarding"` on the root div.

2. **Possible causes**:
   - **CSS load order**: `onboarding.css` (line 21) loads before `student-onboarding.css` (line 22) in `student-mode.html`. `student-onboarding.css` should win for the same specificity.
   - **Specificity conflict**: Another rule may override this. `onboarding.css` has `.onboarding-steps-panel` with `width`, `flex`, etc., but no `display` in the mobile block. A later rule could still set `display`.
   - **Viewport**: The media query may not match if the viewport is reported as > 768px (e.g. device pixel ratio, browser chrome).
   - **DOM structure**: The onboarding HTML is injected into `#main-content-area`. The `.student-onboarding` class is on the root of the loaded component, so the selector should apply.

### How to Fix

1. **Increase specificity**: Use `body.onboarding-active .student-onboarding .onboarding-steps-panel` so the rule only applies when onboarding is active and is harder to override.
2. **Move rule to base `onboarding.css`**: Add a mobile rule in `onboarding.css` scoped to `.student-onboarding` so it applies regardless of load order.
3. **Verify in DevTools**: Inspect `.onboarding-steps-panel` on mobile and check which rule controls `display` and whether the media query matches.

---

## Issue 2: Demo Artefact Container Not Found

### What Went Wrong

`renderDemoArtefact()` in `student-onboarding.ts` logs "Demo artefact container not found" because it looks for `#demo-artefact-content`, which does not exist in the HTML.

### Root Cause Analysis

1. **Missing element**: `student-onboarding.html` Step 4 has:
   - `demo-artefact-btn` (the "View Diagram" button)
   - No `demo-artefact-content` div

2. **Intended behavior**: `renderDemoArtefact()` is meant to render a static Mermaid diagram preview in the step content. It expects a parent container to append the diagram into.

3. **Current flow**: The function exits early with a console warning, so no static preview is shown. The "View Diagram" button still opens the artefact panel via the artefact handler.

### How to Fix

1. **Add the container**: In `student-onboarding.html` Step 4, add a div for the demo content, e.g. inside the `demo-interactive` block:
   ```html
   <div id="demo-artefact-content" class="artefact-demo-container"></div>
   ```
   Place it near the "View Diagram" button so the preview appears above or beside it.

2. **Alternative**: If a static preview is not needed, remove or refactor `renderDemoArtefact()` so it no longer depends on `#demo-artefact-content` and does not log a warning.

---

## Issue 3: Onboarding Navigation – Box Style with Transparent Background

### What Went Wrong

The user wants the navigation to be a box with a transparent background that “follows the back” (i.e. shows the content behind it).

### Current Implementation

```css
.onboarding-navigation {
    background: var(--chat-bg);
    border-top: 1px solid var(--border-color);
    /* ... */
}
```

This uses a solid background and a top border.

### How to Fix

1. **Transparent background**: Set `background: transparent` (or `background: rgba(0,0,0,0)`).
2. **Box styling**: Add:
   - `border-radius` for rounded corners
   - Optional `border` for a box outline
   - Optional `backdrop-filter: blur()` for a frosted effect
3. **Reference**: Use `.about-navigation` in `about.css` as a reference for layout and styling, but with a transparent background.

---

## Issue 4: onboarding-content-steps Full Background of the View

### What Went Wrong

The user wants `.onboarding-content-steps` to have the “full background of the view” on mobile.

### Interpretation

- The content area should fill the viewport.
- Its background should cover the full visible area (e.g. `min-height: 100vh` or `100dvh`).
- The background color/pattern should extend across the whole screen.

### Current Implementation

- `.onboarding-content-area` has `flex: 1`, `min-height: 0`, `overflow: hidden`.
- `.onboarding-content-steps` has `flex: 1`, `min-height: 0`, `overflow-y: auto`.
- Parent heights depend on `.onboarding` and `#main-content-area`.

### How to Fix

1. **Full viewport height**: On mobile, ensure the onboarding layout fills the viewport:
   - `.onboarding` or its parent: `min-height: 100vh` (or `100dvh`).
   - `.onboarding-content-area`: `min-height: 100vh` or `flex: 1` with a constrained parent.
2. **Background on content steps**: Set `background` on `.onboarding-content-steps` (e.g. `var(--chat-bg)` or `var(--background-2)`) so it visibly fills the area.
3. **Layout chain**: Confirm `#main-content-area` and `.main-dashboard` have appropriate height so the onboarding can expand to full viewport.

---

## Summary: Fix Checklist

| Issue | File(s) | Action |
|-------|---------|--------|
| Steps panel visible | `student-onboarding.css` or `onboarding.css` | Increase specificity or move rule; verify in DevTools |
| Demo artefact container | `student-onboarding.html` | Add `<div id="demo-artefact-content">` in Step 4 |
| Nav transparent box | `student-onboarding.css` | `background: transparent`, add border-radius, optional backdrop-filter |
| Full background | `student-onboarding.css` | `min-height: 100vh` on layout, background on `.onboarding-content-steps` |

---

## Testing After Fixes

1. **Steps panel**: At 375px width, confirm the steps panel is hidden.
2. **Demo artefact**: Confirm no "Demo artefact container not found" warning and that the static preview appears in Step 4.
3. **Navigation**: Confirm the nav looks like a box with a transparent background and content visible behind it.
4. **Full background**: Confirm the content area fills the viewport and its background covers the full screen on mobile.

---

## Changelog (Implemented)

- **Steps panel**: Updated selector to `body.onboarding-active .student-onboarding .onboarding-steps-panel` for higher specificity.
- **Demo artefact**: Added `<div id="demo-artefact-content" class="artefact-demo-container"></div>` in Step 4 of `student-onboarding.html`.
- **Navigation**: Set `background: transparent`, added `border`, `border-radius`, `box-shadow`, and inset positioning (`bottom: 1rem`, `left: 1rem`, `right: 1rem`) for a floating box.
- **Full background**: Added `min-height: 100vh` to `.student-onboarding` and `.onboarding-content-steps`, plus `background: var(--chat-bg)` on `.onboarding-content-steps`.
