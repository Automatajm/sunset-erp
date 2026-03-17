# Sunset — Design System

**Version:** 1.0  
**Last updated:** March 2026  
**Applies to:** All frontend screens — `frontend/`

---

## Philosophy

Sunset ERP takes its name seriously. The visual language is built around a single metaphor: **a sky at dusk** — deep violet overhead, warm orange at the horizon. The interface should feel like professional software seen through that light: dark, refined, with orange accents that are earned rather than decorative.

Three rules that govern every decision:

1. **Dark by default.** No light mode toggle. Dark surfaces reduce eye strain during long work sessions.
2. **Warm accents only.** Orange is the only expressive color. Blue, purple, green appear only for semantic meaning (info, success).
3. **No emojis in production code.** Use SVG icons sized explicitly at `width: Npx; height: Npx; flex-shrink: 0`.

---

## Color Palette

### Background layers

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#08060f` | Page background, outermost layer |
| `bg-surface` | `#0a0712` | Cards, modals, sidebars |
| `bg-elevated` | `rgba(255,255,255,0.06)` | Hover states, inputs on dark surface |

### Brand — sunset orange

| Token | Hex | Usage |
|---|---|---|
| `brand-deep` | `#c2410c` | Gradient start, pressed states |
| `brand-primary` | `#ea580c` | Buttons, gradient mid, logo mark |
| `brand-accent` | `#fb923c` | Accent text ("set" in wordmark), label color, active nav |
| `brand-tint` | `rgba(251,146,60,0.15)` | Active nav background, subtle highlights |
| `brand-border` | `rgba(251,146,60,0.14)` | Card borders, input focus |

**Button gradient:** `linear-gradient(135deg, #c2410c 0%, #ea580c 60%, #f97316 100%)`  
**Logo mark gradient:** `linear-gradient(145deg, #c2410c 0%, #ea580c 50%, #f97316 100%)`

### Text

| Token | Value | Usage |
|---|---|---|
| `text-primary` | `#f1f5f9` | Headings, values, primary content |
| `text-secondary` | `rgba(255,255,255,0.55)` | Body text, descriptions |
| `text-muted` | `rgba(255,255,255,0.35)` | Placeholders, subtitles, footer |
| `text-label` | `rgba(251,146,60,0.65)` | Form field labels (uppercase) |

### Semantic

| Token | Color | Usage |
|---|---|---|
| `success` | `#4ade80` | Positive deltas, active status, approved |
| `danger` | `#f87171` | Errors, negative deltas, overdue |
| `warning` | `#fbbf24` | Pending, draft, needs attention |
| `info` | `#60a5fa` | Neutral informational (use sparingly) |

### Backgrounds for semantic badges

```css
background: rgba(34,197,94,0.12);   /* success */
background: rgba(239,68,68,0.12);   /* danger  */
background: rgba(251,191,36,0.12);  /* warning */
background: rgba(96,165,250,0.12);  /* info    */
```

---

## Typography

### Fonts

```css
/* Brand wordmark only */
font-family: 'Cormorant Garamond', Georgia, serif;

/* All UI text */
font-family: 'IBM Plex Sans', sans-serif;

/* Code, credentials, monospaced values */
font-family: 'IBM Plex Mono', 'Courier New', monospace;
```

### Scale

| Role | Font | Size | Weight | Letter-spacing | Color |
|---|---|---|---|---|---|
| Brand name | Cormorant Garamond | 34px | 300 | 0.10em | `text-primary` + accent on last syllable |
| Page title | IBM Plex Sans | 22px | 500 | — | `text-primary` |
| Section heading | IBM Plex Sans | 16px | 500 | — | `text-primary` |
| Body | IBM Plex Sans | 14px | 400 | — | `text-secondary` |
| Caption / secondary | IBM Plex Sans | 12px | 400 | — | `text-muted` |
| Field label | IBM Plex Sans | 11px | 500 | 0.10em | `text-label` (uppercase) |
| Code / mono | IBM Plex Mono | 12px | 400 | — | `text-muted` |

### Brand wordmark rule

The wordmark always splits at **"Sun" + "set"**. `Sun` in `text-primary`, `set` in `brand-accent`.

```html
<span>Sun<span style="color: #fb923c;">set</span></span>
```

Never write it as "SUNSET ERP" in the UI. The word "ERP" is redundant — the product is Sunset.

---

## Backgrounds & Atmosphere

Every full-page surface should use layered radial gradients to create depth. Copy this as the base for any new full-page layout:

```css
.page-bg {
  background-color: #08060f;
  background-image:
    /* warm horizon glow at bottom */
    radial-gradient(ellipse 100% 55% at 50% 100%, rgba(234, 88, 12, 0.32) 0%, transparent 65%),
    radial-gradient(ellipse 70%  40% at 70%  90%, rgba(251, 146, 60, 0.18) 0%, transparent 55%),
    radial-gradient(ellipse 60%  45% at 30%  85%, rgba(220, 38, 38, 0.15) 0%, transparent 50%),
    /* violet-to-near-black sky at top */
    linear-gradient(to bottom, #0c0a1a 0%, #120c1e 40%, #1a0e18 70%, #1f1008 100%);
}
```

For screens that don't need a dramatic background (data tables, list views), use `background: #08060f` alone.

### Grid texture (optional)

Adds subtle structure on landing / login pages:

```css
background-image:
  linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
background-size: 44px 44px;
```

### Horizon glow line

For full-bleed pages (login, onboarding):

```css
.horizon-line {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(251,146,60,0.6) 30%,
    rgba(234,88,12,0.9) 50%,
    rgba(251,146,60,0.6) 70%,
    transparent 100%
  );
  filter: blur(1px);
}
```

---

## Surface Cards

All cards use glassmorphism on dark backgrounds:

```css
.card {
  background: rgba(10, 7, 18, 0.75);
  border: 1px solid rgba(251, 146, 60, 0.14);
  border-radius: 18px;
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  box-shadow:
    0 0 0 1px rgba(255, 140, 50, 0.05) inset,
    0 32px 80px rgba(0, 0, 0, 0.72),
    0 0 60px rgba(234, 88, 12, 0.07);
  /* Top accent line */
  position: relative;
}

.card::before {
  content: '';
  position: absolute;
  top: 0; left: 40px; right: 40px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(251,146,60,0.45), transparent);
  border-radius: 1px;
}
```

For smaller cards (stat cards, list items):

```css
.card-sm {
  background: rgba(255, 255, 255, 0.04);
  border: 0.5px solid rgba(255, 255, 255, 0.09);
  border-radius: 10px;
}
```

---

## Form Elements

### Field label

Always uppercase, always `text-label` color:

```css
.field-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: rgba(251, 146, 60, 0.65);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
```

### Input

```css
.input {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  padding: 11px 14px;
  font-size: 14px;
  font-family: 'IBM Plex Sans', sans-serif;
  color: #f1f5f9;
  outline: none;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.input:focus {
  border-color: rgba(251, 146, 60, 0.5);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.1);
}

/* Chrome autofill override */
.input:-webkit-autofill,
.input:-webkit-autofill:hover,
.input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px #100c1c inset;
  -webkit-text-fill-color: #f1f5f9;
  caret-color: #f1f5f9;
}
```

---

## Buttons

### Primary (orange gradient)

```css
.btn-primary {
  background: linear-gradient(135deg, #c2410c 0%, #ea580c 60%, #f97316 100%);
  border: none;
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'IBM Plex Sans', sans-serif;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(234, 88, 12, 0.4);
  transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 6px 26px rgba(234, 88, 12, 0.55);
}
```

### Ghost / secondary

```css
.btn-ghost {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 14px;
  font-family: 'IBM Plex Sans', sans-serif;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
}
```

---

## Status Badges

```css
/* Base badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
}

/* Dot indicator (6×6px circle before the label) */
.badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.badge-success { background: rgba(34,197,94,0.12);  color: #4ade80; border: 0.5px solid rgba(34,197,94,0.2);  }
.badge-danger  { background: rgba(239,68,68,0.12);  color: #f87171; border: 0.5px solid rgba(239,68,68,0.2);  }
.badge-warning { background: rgba(251,191,36,0.12); color: #fbbf24; border: 0.5px solid rgba(251,191,36,0.2); }
.badge-neutral { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.5); border: 0.5px solid rgba(255,255,255,0.1); }
.badge-accent  { background: rgba(251,146,60,0.12); color: #fb923c; border: 0.5px solid rgba(251,146,60,0.2); }
```

---

## Icon Mark (Logo)

The logo mark is a **sun with rays above a horizon line**. It is never a house, globe, or letter.

```html
<div class="logomark">
  <svg viewBox="0 0 26 26" fill="none"
       stroke="white" stroke-width="1.6"
       stroke-linecap="round" stroke-linejoin="round">
    <circle cx="13" cy="11" r="4" />
    <line x1="13"   y1="3"    x2="13"   y2="5.2"  />
    <line x1="19.8" y1="6.2"  x2="18.4" y2="7.6"  />
    <line x1="22"   y1="13"   x2="19.8" y2="13"   />
    <line x1="6.2"  y1="6.2"  x2="7.6"  y2="7.6"  />
    <line x1="4"    y1="13"   x2="6.2"  y2="13"   />
    <line x1="3.5"  y1="19"   x2="22.5" y2="19"   stroke-width="1.8" />
    <line x1="6.5"  y1="22"   x2="19.5" y2="22"   stroke-width="1.2" opacity="0.45" />
  </svg>
</div>
```

```css
.logomark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(145deg, #c2410c 0%, #ea580c 50%, #f97316 100%);
  box-shadow:
    0 4px 20px rgba(234, 88, 12, 0.45),
    0 0 0 1px rgba(251,146,60,0.25) inset;
}

/* SVG inside must always be explicitly sized */
.logomark svg {
  width: 26px;
  height: 26px;
  display: block;
  flex-shrink: 0;
}
```

**Sizes:**

| Context | Container | SVG |
|---|---|---|
| Login / hero | 52×52px, rx=14 | 26×26px |
| Sidebar header | 36×36px, rx=9  | 18×18px |
| Favicon | 32×32px, rx=8  | 16×16px |

---

## Navigation

### Sidebar nav item

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-item--active {
  background: rgba(234, 88, 12, 0.15);
  color: #fb923c;
  border: 0.5px solid rgba(234, 88, 12, 0.2);
}

.nav-item--default {
  color: rgba(255, 255, 255, 0.45);
}

.nav-item--default:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
}
```

### Top bar

```css
.topbar {
  height: 54px;
  background: rgba(10, 7, 18, 0.9);
  border-bottom: 0.5px solid rgba(251, 146, 60, 0.12);
  backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
}
```

---

## Stat Cards (KPI)

```css
.stat-card {
  background: rgba(255, 255, 255, 0.04);
  border: 0.5px solid rgba(255, 255, 255, 0.09);
  border-radius: 10px;
  padding: 16px 18px;
}

.stat-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(251, 146, 60, 0.6);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 24px;
  font-weight: 500;
  color: #f1f5f9;
  line-height: 1.2;
}

.stat-delta-positive { font-size: 12px; color: #4ade80; margin-top: 4px; }
.stat-delta-negative { font-size: 12px; color: #f87171; margin-top: 4px; }
```

---

## Data Tables

```css
.table-wrapper {
  background: rgba(255, 255, 255, 0.03);
  border: 0.5px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow: hidden;
}

.table { width: 100%; border-collapse: collapse; }

.table thead th {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(251, 146, 60, 0.6);
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.07);
  text-align: left;
}

.table tbody td {
  padding: 12px 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.05);
}

.table tbody tr:last-child td { border-bottom: none; }

.table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.025);
}
```

---

## Dividers

```css
/* Between content sections */
.divider {
  height: 0.5px;
  background: rgba(255, 255, 255, 0.07);
  margin: 24px 0;
}

/* With text (e.g. "Demo access") */
.divider-labeled {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.divider-labeled::before,
.divider-labeled::after {
  content: '';
  flex: 1;
  height: 0.5px;
  background: rgba(255, 255, 255, 0.07);
}
```

---

## Icons — Critical Rules

Icons in the Sunset UI must **always** have explicit pixel dimensions. Never let an icon inherit its container's font-size or grow freely.

```css
/* All inline SVG icons */
svg.icon {
  display: block;
  flex-shrink: 0;
  /* Always set one of these sizes: */
}

.icon-sm  { width: 14px; height: 14px; }  /* inline text icons */
.icon-md  { width: 18px; height: 18px; }  /* button icons, nav dots */
.icon-lg  { width: 24px; height: 24px; }  /* section icons */
.icon-xl  { width: 32px; height: 32px; }  /* hero / empty-state */
```

**Never** place icon SVGs inside `<label>` or `<button>` without the explicit size rule — they will expand unpredictably with browser zoom.

**Never** use emoji as icons in production UI.

---

## Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Tight internal gaps |
| `space-2` | 8px | Field gap, badge padding |
| `space-3` | 12px | Component internal padding |
| `space-4` | 16px | Section gap, card padding small |
| `space-6` | 24px | Card padding standard |
| `space-8` | 32px | Section margin |
| `space-10` | 40px | Page section gap |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 6px | Badges, small chips |
| `radius-md` | 8px | Inputs, buttons, nav items |
| `radius-lg` | 10px | Stat cards, table containers |
| `radius-xl` | 14px | Logo mark container |
| `radius-2xl` | 18px | Main cards, modals |

---

*Sunset Design System · v1.0 · March 2026*