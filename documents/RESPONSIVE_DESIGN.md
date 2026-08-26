# Responsive Design Guide

This document outlines the responsive design strategy for the tlef-engeai project, including breakpoint sizes, development considerations, and testing guidelines.

---

## Breakpoint Strategy

We use a **mobile-first** approach with two primary breakpoints:

| Breakpoint | Width | Target |
|------------|-------|--------|
| **Phone** | Base (default) | &lt; 480px |
| **Large phone / small tablet** | 480px | min-width: 480px |
| **Tablet and up** | 768px | min-width: 768px |

```css
/* Base: mobile (< 480px) */
.container { padding: 1rem; }

@media (min-width: 480px) {
  /* Large phone / small tablet */
}

@media (min-width: 768px) {
  /* Tablet and desktop */
}
```

---

## Viewport Sizes to Be Aware Of

| Category | Width | Typical Use |
|----------|-------|-------------|
| Mobile (small) | 320px – 480px | Older phones, smallest devices |
| Mobile (medium) | 481px – 767px | Most smartphones |
| Tablet (portrait) | 768px – 1024px | iPads, tablets |
| Tablet (landscape) / small laptop | 1025px – 1280px | Large tablets, small laptops |
| Desktop | 1281px – 1920px | Standard laptops and monitors |
| Large desktop | 1921px+ | Large monitors, 4K |

### Key Device Widths

- **320px** – Smallest common mobile (e.g. iPhone SE)
- **375px** – Common phone width (e.g. iPhone 12/13/14)
- **390px** – Newer iPhones (e.g. iPhone 14 Pro)
- **414px** – Larger phones (e.g. iPhone Plus)
- **768px** – Tablet portrait (e.g. iPad)
- **1024px** – Tablet landscape / small laptop
- **1280px** – Typical laptop width
- **1440px** – Common desktop monitor
- **1920px** – Full HD desktop

---

## Considerations for Mobile / Tablet Components

<!-- @rdschrs: Implemented the responsive Writing Feedback review workflow. -->
### Writing Feedback review workflow

- **Desktop (901px+)**: show the submission queue and review workspace side by side. Keep verified text, student-facing feedback, and staff-only notes visually distinct. An open Canvas import or rubric panel spans the workspace above the split view so assignment context remains visible.
- **Tablet (601–900px)**: use a single-panel queue/detail flow rather than placing two full workspaces in one long stack. Selecting a row opens detail; **Back to submissions** restores the prior assignment, filter, search, and scroll context. Import and rubric forms are full-width.
- **Phone (600px and below)**: keep the same single-panel flow with full-width actions and labelled inputs. Stack rubric criteria/level fields into one column and prevent horizontal scrolling. Staff must still be able to import, verify, save a revision, approve, preview, and release.
- Do not use status color as the only indicator; include the status word. Move focus to the selected detail heading, restore it to the returning queue row, and announce queue/status changes with live regions.
- The action priority stays **Import from Canvas**, **Upload files**, **Add text**, then **Edit/View rubric** at every width. Wrapping may change layout but not order or meaning.
- Canvas mode, loading, empty, error, imported/skipped, rubric dirty/saved/approved, and release preview/released states must fit without hover-dependent detail. Do not use browser `alert()` or `confirm()` as a responsive fallback.

#### Writing Feedback component behavior

- Queue controls wrap without clipping: assignment selector first, then search and status filter.
- At desktop width, keep the queue usable at a stable minimum width while the review pane takes remaining space.
- At tablet/phone widths, hide the inactive queue or detail from both visual and keyboard navigation; do not leave focusable controls off-screen.
- The Canvas assignment list uses full-row labels and an explicit import button. In local demo mode the synthetic label remains visible at all widths.
- Rubric editor sections use one column on phone and may use two columns only when labels, helper text, and point inputs remain readable.
- Sticky action bars may be used only if they do not cover validation messages, the instructor sidebar toggle, or the final form fields. Account for safe-area insets on mobile.
- Loading placeholders reserve enough height to avoid large jumps. Filtered-empty and course-empty states have different copy and actions.
- Preserve at least 44×44px touch targets, `:focus-visible`, and `prefers-reduced-motion` at every breakpoint.

### Layout & Spacing

- **Stack vs. row**: Phone = single column; tablet = 2 columns or side-by-side where appropriate
- **Padding/margin**: Increase on tablet (e.g. 16px → 24px)
- **Max-width**: Use `max-width` on containers so content doesn’t stretch too wide on large screens

### Typography

- **Font sizes**: Slightly larger on tablet (e.g. body 14px → 16px)
- **Line length**: ~45–75 characters per line; use `max-width` on text blocks
- **Line height**: Slightly looser on tablet for readability

### Touch & Interaction

- **Touch targets**: Minimum 44×44px for buttons/links on phone
- **Spacing between taps**: ~8px between interactive elements
- **Hover states**: Less important on phone; more useful on tablet

### Navigation

- **Phone**: Hamburger or bottom nav; keep primary actions easy to reach
- **Tablet**: Top nav or sidebar; more items visible without opening menus

### Images & Media

- **Responsive images**: Use `srcset` or `picture` for different widths
- **Aspect ratios**: Use `aspect-ratio` so layout doesn’t jump while loading
- **Video**: Full-width on phone; constrained width on tablet

### Forms & Inputs

- **Input size**: Tall enough for touch (e.g. 44px height)
- **Labels**: Above inputs on phone; inline on tablet if space allows
- **Buttons**: Full-width on phone; auto-width on tablet

### Performance

- **Above-the-fold**: Critical content within ~600–800px height on phone
- **Lazy load**: Images and heavy content below the fold
- **Reduce motion**: Respect `prefers-reduced-motion` for animations

---

## Quick Reference

| Aspect | Phone (&lt; 480px) | Tablet (≥ 768px) |
|--------|--------------------|------------------|
| Columns | 1 | 2+ where appropriate |
| Nav | Collapsed / bottom | Top or sidebar |
| Touch targets | ≥ 44px | Same |
| Padding | 12–16px | 20–24px |
| Forms | Stacked, full-width | Inline where possible |

---

## Student Onboarding Mobile: Conclusions

The student onboarding mobile improvements (see `STUDENT_ONBOARDING_MOBILE_IMPROVEMENTS_PLAN.md`) established several patterns worth applying elsewhere:

### Breakpoint Usage

- **768px** is used as the mobile cutoff for onboarding: `@media (max-width: 768px)`.
- This aligns with the artefact handler’s `isModalMode()` (`window.matchMedia('(max-width: 768px)')`).
- When JS and CSS share a breakpoint, keep them in sync (768px for “mobile = modal overlay”).

### Artefact Panel on Mobile

- On mobile, the artefact panel uses a **modal overlay** (moved into `.artefact-modal-wrapper` on `body`).
- When closed, the panel may still be in the DOM inside the main layout. Use `display: none` on the panel when it lives in the layout so it does not affect flex/flow.
- The panel stays in the DOM for JS to move into the modal on open; once in the modal, it is no longer a layout child.

### Layout Patterns

- **Hide side panels** on mobile: `.onboarding-steps-panel { display: none }` so content can use full width.
- **Content-first**: `.onboarding-content-area` should expand to fill available space (`flex: 1`, `min-height: 0`).
- **Scroll container**: Use `overflow-y: auto` on the content container, not the outer wrapper, to avoid cut-off content.
- **Fixed nav**: Bottom navigation with `position: fixed`; add `padding-bottom` on the scroll container for space above the nav.

### Touch & Accessibility

- Use **icon-only** nav on mobile with adequate touch targets (≥ 44px).
- Respect `prefers-reduced-motion` for artefact modal and other animations.

---

## Student Mobile Header Pattern

The student mode uses a consistent mobile header pattern across welcome screen, chat window, and flag history.

### Structure

- **Welcome screen** (`welcome-screen.html`): `mobile-header-bar` with hamburger button only (no title).
- **Chat window** (`chat-window.html`): `chat-header` with `mobile-hamburger-btn`, `chat-title`, and actions (artefact, pin, delete).
- **Flag history** (`flag-history.html`): `flag-header` with hamburger + `<h1>Flag History</h1>`.

### CSS (`student-mode.css`)

- `.mobile-hamburger-btn`: `display: none` by default; `display: inline-flex` in `@media (max-width: 768px)`.
- `.mobile-header-bar`: flex row, hamburger + optional title, padding, border, background.
- `.chat-header`: sticky, contains hamburger + title + actions.
- Sidebar: fixed, `translateX(-100%)` off-screen; `.mobile-open` slides it in.
- `.sidebar-overlay`: dimmed backdrop when sidebar is open.

### Behavior

- Hamburger toggles sidebar via `.mobile-open` and overlay.
- Header lives inside the main content area, not a separate top bar.
- Breakpoint: **768px**.

---

## Instructor Flag Management

**Flag Management** (`flag-instructor.html`, `flag-instructor.css`) uses the shared **page shell** (`.page-frame` > `.page-shell` > `.page-header`). Workflow nav tiles sit in the page header (outline/green, filled when active). At **768px**, tiles wrap under the title with 44px touch targets.

**Filters** sit in page content, first below the header (not in the header, not a modal). Source, category, and period controls apply with Clear/Apply. Custom date fields stack to one column at ≤768px.

---

## Instructor Dashboard

The instructor dashboard (`dashboard-instructor.html`, `dashboard.css`) uses the shared **page shell**. The topbar is `.page-header` plus `.dashboard-topbar` (title + course-code flip). Welcome/date live in the scroll body under the header.

### Desktop (≥768px)

- **Topbar**: sticky flex row — left column (title) + right column (course-code flip widget, 200px).
- **Advanced Settings**: static section title + divider; three inline accordion cards (Model Settings, Advanced Features, Course Information).
- **Enter animation**: header via `.page-header`; greeting/date at 0.08s, card grid at 0.18s, Advanced Settings section at 0.28s.

### Mobile (≤768px)

- **Topbar**: sticky; `flex-direction: column`; course-code flip `align-self: flex-start` (left-aligned under the title).
- **Advanced Settings**: three inline accordions (Model Settings, Advanced Features, Course Information) expand inside each card with a smooth height transition; `prefers-reduced-motion` collapses instantly.
- **Feature rows**: Model pickers and Advanced Feature toggles share a wrapping flex layout at every width. Controls stay beside their title where space permits, wrap internally when possible, then move to a right-aligned line below the title.
- **Hamburger**: shown in the title row via `.instructor-mobile-hamburger-btn`.
- **Accordions**: full-width; toggle min-height 44px for touch.

Course Information was removed from the instructor sidebar footer; course code lives in the dashboard topbar and metadata in the Course Information accordion.

---

## Admin course selection (`admin-course-selection.html`)

Styles: [`public/styles/course-selection.css`](public/styles/course-selection.css) (split layout) and [`public/styles/admin-guided-pathway-flags.css`](public/styles/admin-guided-pathway-flags.css) (escalations queue).

### Desktop

- **Bell**: toggles a **1:1 flex split** of `.admin-course-selection-wrapper` — courses on the left, escalations panel on the right (`flex: 1 1 0` each). Active bell uses palette light brown (`#ECE5DD` / `--background-2`).
- **Independent scroll**: the page does not scroll as a whole; the course column and the escalations list each scroll in their own overflow region.
- **Panel**: 1rem gap from the course column; 10px radius; **green header** on a **white** body. Header is a single row — title, All courses pill, compact Refresh / Hide. Bell, **Hide**, or **Escape** closes; focus returns to the bell. Closed panel uses `hidden` + `inert`.
- **Splitter**: a drag handle between the columns resizes them. Both columns have **min-width 40%**. Arrow keys on the handle nudge by 2%. Hidden on ≤768px.
- **Period cards**: when split, course containers use **100% of the left column** (not the default 80% page width).

### Mobile (≤768px)

- Escalations open as a **ModalOverlay** (same 768px cutoff as the View Diagram artefact modal). Course list stays full width; no stacked split and no splitter.
- Overlay X, backdrop click, Escape, or the bell closes it. Nested identity-reveal confirms still stack on top.
- `prefers-reduced-motion`: desktop split transitions remain disabled.

---

## Page shell (reusable layout)

Generic scrollport + sticky header module: [`public/styles/page-shell.css`](public/styles/page-shell.css). Loaded from `instructor-mode.html` for instructor features today; student/admin can link the same file later without renaming classes.

### Structure

```text
.page-frame          optional full-height outer wrapper
  .page-shell        scrollport (1200px cap, 3rem / 1rem gutters)
    .page-header     optional sticky title row + bleed
    (feature content)
```

Modifiers: `.page-shell--wide` (1680px, Writing Feedback), `.page-shell--column` + `.page-shell-body` (System Prompts editor column).

### Tokens (on `.page-shell`, overridable per instance)

| Token | Desktop | Mobile |
|-------|---------|--------|
| `--page-shell-max-width` | `1200px` | — |
| `--page-shell-pad-x` | `3rem` | `1rem` |
| `--page-shell-pad-bottom` | `20px` | shell uses `2rem` bottom pad |
| `--page-header-pad-top` | `1.5rem` | `1.25rem` |
| `--page-header-pad-bottom` | `1rem` | `0.75rem` |
| `--page-header-margin-bottom` | `3rem` | — |
| `--page-header-title-size` | `2rem` | — |
| `--page-header-title-weight` | `700` | — |

### Sticky header (`.page-header`)

- Bleed: `margin` / `padding` use `--page-shell-pad-x` so the title aligns with body content.
- `background: var(--chat-bg)` so scrolled content does not peek beside the sticky title.
- Enter animation: `page-header-in` (`0.45s ease-out`, ends at `transform: none` for sticky).

Instructor hamburger styling stays in [`instructor-mode.css`](public/styles/instructor-mode.css) (`#main-content-area .page-header.mobile-header-bar`).

### Adopting on a new page

1. Link `/styles/page-shell.css`.
2. Wrap content: `page-frame` > `page-shell` > `page-header` + body.
3. Override tokens on `.page-shell` if needed (e.g. `--page-shell-max-width: none`).

### `prefers-reduced-motion`

- Header enter animation collapses to `0.01ms` in `page-shell.css`.

---

## Marketing homepage (`/` and `/team`)

Public marketing shell (not the course app). Styles live in `public/styles/home.css`.

| Concern | Behavior |
|---------|----------|
| Breakpoints | Mobile-first; **centered** GitHub-style hero (copy above video) at all widths. Supporting extras (`#supporting`) use a **3-col hairline bento** at **768px** (stacks with horizontal dividers on small screens). Testimonials multi-column at **768px**. Team roster: multi-member grids go 2-col at **480px**; solo sections (PI / Co-I) stay single-column via `.team-grid--solo`. |
| Theme | Dark by default (`data-home-theme`); topbar sun/moon toggle persists in `localStorage` (`engeai-home-theme`). Light tokens reuse the prior green wash palette. |
| Topbar | Sticky; brand (CHBE green `--home-chbe-accent`) + theme toggle + Login always visible. **Team** link appears after Learn more (or when session already revealed). Glassy background/border after scroll. |
| Hero video | Centered full-width (max ~880px); 16:9 frame; green/blue ambient glow. Hero scrolls with the page (no sticky pin). Non-sticky scroll zoom ramps `1.06` → `1.22` and then holds max size while scrolling continues; disabled under `prefers-reduced-motion`. |
| Features scrub | Sticky scroll-storytelling for three main features (`#features`) at **768px+**. UI stays **pinned** under the topbar while scroll advances steps 1→3 (then the page continues). Desktop: left nav (`~0.75fr`) + right visual (`~1.6fr`); each step’s image lives **inside** its `li` and is positioned absolute into the right column; full-height rail + moving active indicator; inactive titles muted, active title bold with body copy; panels **opacity crossfade** on step change only (no scroll-linked zoom/fade). Feature titles are `<h3 class="home-features-step-title">` (clickable on desktop to jump scrub offset). Feature images share the same frame as supporting extras: **16:9** (`object-fit: cover`, `object-position: left center`) with a **3px** glass border and a green/blue ambient glow biased **upper-right** (same tokens as the hero video, not wraparound). Track height = `sticky-h + N × scroll-per-step + top spacing` (`--home-features-sticky-h` + `3 × 100vh` + `5rem`); JS pin range excludes `padding-top` and maps scroll to step index. `#home-more` reveal animation is **opacity-only** (no `transform` — that would break sticky). Marketing pages use `overflow-x: clip` on `html`/`body` (not `hidden`) and `overflow: visible` on `main` / `#home-more` so sticky is not broken. Below **768px** and under `prefers-reduced-motion`: **three stacked feature cards**, each **title → description → image** (no sticky pin, no rail, no crossfade); titles are plain non-interactive headings. |
| Supporting extras | `#supporting` + `#funding` use `--home-promo-band-*`: **light** — CHBE green band (`--home-green`) with off-white type and white bento hairlines; **dark** — muted wash (`--home-surface-muted`, same as testimonials) with CHBE green hairlines (`--home-chbe-accent-line`). Feature images use a **16:9** frame with a **3px** glass border (`--home-support-graphic-border` / `--home-support-graphic-glass`). Shared accents: `--home-chbe-accent` / `--home-chbe-accent-line` also color topbar brand, testimonial card borders, and student status lines. |
| Home page assets | Under `public/assets/home/`: hero → `EngE-AI-front-page.mov` (poster `main-image.png`); features scrub → `feature-pathway.png`, `feature-scenario.png`, `feature-writing-feedback.png`; supporting extras → `feature-tone.png`, `feature-diagram.png`, `feature-multiple-modes.png`. Testimonials use `avatar-placeholder.svg` until real headshots exist. |
| Security | `#security` — decorative database SVG (dark blue `--home-navy`, transparent bg) on the **left** of the copy at **768px+**; icon gently floats via `homeSecurityFloat` (disabled under `prefers-reduced-motion`). Stacks centered on small screens. |
| Investigators | `#investigators` — mirrored pair: Alireza (text right-aligned, photo toward center) + Amir (photo toward center, text left-aligned). Circular portraits, no borders; hover zoom on photo (`prefers-reduced-motion` off). Mock `avatar-placeholder.svg` until real headshots (`investigator-alireza.jpg` / `investigator-amir.jpg`). Stacks on small screens. |
| Grant selector | `#funding` — Year 1 · Year 2 · Total as underline tabs; a single ink bar **slides** under the active option. |
| Team page (`/team`) | Roster only (no funding acknowledgement — that lives on `/#funding` + footer). Hairline member rows; section labels are uppercase CHBE-green. Link hover is **color only** (no lift). Shared topbar/footer/theme with `/`. |
| Touch targets | Login / Learn more / Play / theme toggle / grant options use ≥ ~44px targets. Feature step titles are clickable scrub jumps at **768px+** only (plain `<h3>` on phone / reduced-motion). |

### Testing additions

- [ ] 375px: centered hero; video readable; CTAs wrap cleanly
- [ ] 375px: features — three stacked cards, each title → description → image (Pathway, Scenario, Writing); no sticky scrub
- [ ] 375px: supporting bento stacks with horizontal hairlines; feature images readable
- [ ] 1280px: centered hero scrolls normally; theme toggle flips dark/light
- [ ] 1280px: features scrub — sticky pin holds under topbar; scroll through steps 1→2→3; click step title jumps; panels opacity-crossfade on step change
- [ ] 1280px: supporting extras — 3 equal cells, shared hairlines, 16:9 images with 3px glass border
- [ ] Grant selector: underline tabs Year 1 → Year 2 → Total; dark + light readable
- [ ] Features: `prefers-reduced-motion` and phone widths show title→desc→image cards (no sticky scrub)
- [ ] `/team` readable at phone and desktop; solo sections stay 1-col; multi-member grids 2-col at 480px+; theme preference shared with `/`
- [ ] Footer APSC link hover: UBC red color only (no lift)

---

## Testing Checklist

- [ ] 320px (small phone)
- [ ] 375px (common phone)
- [ ] 480px (breakpoint)
- [ ] 768px (breakpoint)
- [ ] 900px/901px (Writing Feedback single/split transition)
- [ ] Writing Feedback queue → detail → back preserves selection, filters, and focus
- [ ] Canvas demo/not-configured/importing/imported/error states at phone and desktop widths
- [ ] Rubric clean/dirty/saved/validation/approved states at phone and desktop widths
- [ ] Portrait and landscape on both phone and tablet
