# StreamVault UI Audit Report

Audit date: 2026-03-14  
Scope: Frontend code audit (React + Tailwind), with focus on generic-font usage, AI-slop anti-patterns, accessibility, theming, performance, and responsiveness.

## Anti-Patterns Verdict
**Verdict: FAIL (partially AI-styled in key surfaces).**

Top tells observed:
- Repeated gradient text headline treatment across auth/pricing/success flows (`bg-clip-text text-transparent`), e.g. `src/auth/Login.tsx:118`, `src/pages/Pricing.tsx:153`, `src/pages/SubscriptionSuccess.tsx:81`.
- Heavy glassmorphism/backdrop blur repetition in nav/search/modals, e.g. `src/components/MobileNav.tsx:56`, `src/components/search/DynamicSearchBar.tsx:297`.
- Overuse of “safe glossy” patterns (rounded cards, glow shadows, scale hover everywhere) instead of stronger visual hierarchy.

Generic-font verdict (requested check):
- Primary app typography is **not generic**: custom `Archivo` + `Space Grotesk` loaded in `index.html` and used in `src/index.css`.
- There **is** a generic font fallback usage in key cinematic content: `font-serif` on title/subtitle in `src/components/MovieDetailModal.tsx:431` and `:436`, which can fall back to browser-default serif and weaken brand consistency.

## Executive Summary
- Total issues: **11**
- Critical: **2**
- High: **4**
- Medium: **3**
- Low: **2**
- Overall quality score: **71/100**

Most critical items:
1. Non-semantic clickable cards block keyboard access.
2. Icon-only controls in modal lack accessible names.
3. Repeated hard-coded color values bypass design tokens/theming.
4. Undersized touch targets on core navigation controls.

## Detailed Findings By Severity

### Critical Issues

#### 1) Clickable cards are `<div>` elements (keyboard inaccessible)
- **Location**: `src/components/MediaCard.tsx:129`, `:192`; `src/components/RecommendationRow.tsx:234`
- **Severity**: Critical
- **Category**: Accessibility
- **Description**: Primary card interactions use clickable `<div>` containers with `onClick` and no keyboard handlers/focus semantics.
- **Impact**: Keyboard and assistive-tech users can miss core “open/play media” actions.
- **WCAG/Standard**: WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value
- **Recommendation**: Use semantic `<button>`/`<a>` wrappers or add `role="button"`, `tabIndex={0}`, and Enter/Space handlers (semantic controls preferred).
- **Suggested command**: `/harden`

#### 2) Icon-only action buttons missing accessible names
- **Location**: `src/components/MovieDetailModal.tsx:567`, `:578`, `:688`, `:694`
- **Severity**: Critical
- **Category**: Accessibility
- **Description**: Like/dislike/favorite/share icon buttons do not expose explicit `aria-label`s.
- **Impact**: Screen-reader users receive unclear or unusable controls in a core playback surface.
- **WCAG/Standard**: WCAG 4.1.2 Name/Role/Value, 1.3.1 Info and Relationships
- **Recommendation**: Add contextual `aria-label` and pressed-state semantics (`aria-pressed`) where toggles are used.
- **Suggested command**: `/harden`

### High-Severity Issues

#### 3) Touch targets below 44x44 on frequently used controls
- **Location**: `src/components/Header.tsx:203` (`h-8 w-8` avatar trigger), `src/components/RecommendationRow.tsx:124` (`h-8 w-8` arrows), `src/components/ui/button.tsx:21` (`sm: h-8`)
- **Severity**: High
- **Category**: Responsive
- **Description**: Multiple interactive controls render at 32–36px.
- **Impact**: Reduced tap accuracy on phones/tablets; higher mis-tap rate.
- **WCAG/Standard**: WCAG 2.5.5 Target Size (AAA), platform touch guidance
- **Recommendation**: Enforce minimum 44px touch-size tokens for primary nav/carousel controls.
- **Suggested command**: `/adapt`

#### 4) Hard-coded colors bypass tokens and fragment theming
- **Location**: `src/components/MovieDetailModal.tsx:648`, `:663`, `:743`, `:760`; `src/components/MobileNav.tsx:56`; `src/components/QuickViewModal.tsx:105`, `:168`
- **Severity**: High
- **Category**: Theming
- **Description**: Repeated `#...`/`rgba(...)` literals mixed with tokenized theme colors.
- **Impact**: Inconsistent dark/light behavior, harder maintenance, brittle brand updates.
- **WCAG/Standard**: Design system consistency/theming best practices
- **Recommendation**: Replace literals with semantic tokens (`--background`, `--card`, `--muted`, brand tokens).
- **Suggested command**: `/normalize`

#### 5) Likely low-contrast small text in auth/payment surfaces
- **Location**: `src/auth/Login.tsx:175` (`text-gray-600 text-xs` on black), `src/pages/Pricing.tsx:285-290` (`gray-500`/`gray-400` on light gray)
- **Severity**: High
- **Category**: Accessibility
- **Description**: Small utility text colors appear near AA contrast thresholds or below, depending on runtime background.
- **Impact**: Reduced readability, especially low vision and bright-light conditions.
- **WCAG/Standard**: WCAG 1.4.3 Contrast (Minimum)
- **Recommendation**: Audit contrast pairs and raise token contrast for text below 18px.
- **Suggested command**: `/audit` then `/normalize`

#### 6) Motion/paint cost risk from shadow-heavy animations and global `transition-all`
- **Location**: `src/index.css:464-473` (animated `box-shadow`), `src/index.css:519`, plus many `transition-all` classes in UI components
- **Severity**: High
- **Category**: Performance
- **Description**: Expensive paint operations are animated; broad transitions can animate unintended properties.
- **Impact**: Frame drops on low/mid devices, battery drain.
- **WCAG/Standard**: Performance/rendering best practice
- **Recommendation**: Restrict transitions to transform/opacity; avoid animating multi-layer shadow where possible.
- **Suggested command**: `/optimize`

### Medium-Severity Issues

#### 7) Generic serif fallback used in key hero typography
- **Location**: `src/components/MovieDetailModal.tsx:431`, `:436`
- **Severity**: Medium
- **Category**: Design/Theming
- **Description**: `font-serif` fallback appears in primary title/subtitle path.
- **Impact**: Inconsistent typography across devices; can feel generic vs brand-defined type system.
- **WCAG/Standard**: Brand consistency/usability
- **Recommendation**: Define and use a branded serif/display token instead of generic `font-serif`.
- **Suggested command**: `/normalize`

#### 8) Overuse of gradient-text and glass surfaces (AI-style fingerprint)
- **Location**: `src/auth/Login.tsx:118`, `src/auth/Signup.tsx:76`, `src/pages/Pricing.tsx:153`, `src/pages/SubscriptionSuccess.tsx:81`
- **Severity**: Medium
- **Category**: Anti-pattern/Design quality
- **Description**: Similar visual motifs repeated across distinct contexts.
- **Impact**: Low differentiation, templated feel, weaker information hierarchy.
- **WCAG/Standard**: UX quality / anti-pattern guidelines
- **Recommendation**: Reduce decorative treatments; keep one signature accent per page.
- **Suggested command**: `/distill` then `/quieter`

#### 9) Decorative images use descriptive alt text instead of empty alt
- **Location**: `src/auth/Login.tsx:77-82` (`alt="Movie poster"` repeated collage)
- **Severity**: Medium
- **Category**: Accessibility
- **Description**: Non-informative decorative images are announced repeatedly.
- **Impact**: Screen-reader verbosity/noise.
- **WCAG/Standard**: WCAG 1.1.1 Non-text Content
- **Recommendation**: Use `alt=""` for purely decorative poster collage images.
- **Suggested command**: `/harden`

### Low-Severity Issues

#### 10) Scrollbars globally hidden
- **Location**: `src/index.css:306-332`
- **Severity**: Low
- **Category**: Accessibility/Responsive
- **Description**: Global and utility scrollbar suppression reduces affordance for scrollable regions.
- **Impact**: Discoverability issue for some users.
- **WCAG/Standard**: Usability best practice
- **Recommendation**: Keep subtle scrollbars for horizontal carousels or provide clear drag/scroll cues.
- **Suggested command**: `/polish`

#### 11) Dead CSS file likely unused
- **Location**: `src/components/RecommendationRow.css` (not imported)
- **Severity**: Low
- **Category**: Performance/Maintainability
- **Description**: Legacy stylesheet appears unused by current TSX implementation.
- **Impact**: Maintenance noise and potential confusion.
- **WCAG/Standard**: N/A
- **Recommendation**: Remove or archive if truly unused.
- **Suggested command**: `/optimize`

## Patterns & Systemic Issues
- Token drift: mixed tokenized styles and hard-coded literals in major surfaces.
- Accessibility drift in custom components: semantic/labeling gaps appear where interactions are hand-rolled instead of using reusable UI primitives.
- Visual over-decoration pattern: gradient text + blur + glow often stacked together.

## Positive Findings
- Strong base typography setup with non-generic custom fonts loaded non-blocking (`index.html`, `src/index.css`).
- Good use of lazy loading and decoding hints for many images (e.g. `loading="lazy"`, `decoding="async"`).
- Many shadcn-derived controls include focus-visible ring behavior and keyboard-friendly defaults.
- Theme token foundation is present and extensible in `src/index.css`.

## Recommendations By Priority
1. **Immediate (Critical blockers)**  
   Fix semantic interactivity and missing accessible names in media cards and modal icon actions.
2. **Short-term (This sprint)**  
   Normalize touch targets to >=44px and eliminate hard-coded color literals in top-level user flows.
3. **Medium-term (Next sprint)**  
   Reduce visual anti-pattern repetition (gradient text/glass everywhere), standardize typography tokens (replace generic `font-serif` fallback).
4. **Long-term (Ongoing)**  
   Performance tuning for paint-heavy effects; remove dead styles and broaden automated UI regression checks.

## Suggested Commands For Fixes
- Use `/harden` to fix semantic controls, aria labeling, and decorative-image alt behavior.
- Use `/adapt` to raise touch-target sizes and improve mobile control ergonomics.
- Use `/normalize` to replace hard-coded color literals and align to theme tokens.
- Use `/optimize` to reduce expensive shadow/blur animations and clean dead CSS.
- Use `/distill` and `/quieter` to reduce AI-slop visual fingerprints without losing brand identity.
- Re-run `/audit` after each pass to verify severity reductions.
