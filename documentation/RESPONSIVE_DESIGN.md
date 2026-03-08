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

## Testing Checklist

- [ ] 320px (small phone)
- [ ] 375px (common phone)
- [ ] 480px (breakpoint)
- [ ] 768px (breakpoint)
- [ ] Portrait and landscape on both phone and tablet
