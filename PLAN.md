# Plan: Dynamic Favicon Support (Badges + Animations)

## Overview

Add two features to `FaviconUpdater`:
1. **Canvas-drawn notification badges** — red circle with unread count overlaid on the favicon
2. **Animated loading indicators** — spinner and pulse effects via requestAnimationFrame

Both use an offscreen `<canvas>` to produce data URLs fed into the existing `updateFavicon(url)` pipeline.

---

## Step 1: Shared Infrastructure

Add to `FaviconUpdater`:

- `_canUseCanvas()` — returns boolean, cached after first call
- `_loadImage(url)` — returns `Promise<HTMLImageElement>`, caches in `this._imageCache = new Map()`
- `_resolveBaseUrl()` — extract base-URL resolution logic out of `applyState()` so both features can reuse it
- `_renderGeneration` counter — increment in `applyState()`, check after async renders to discard stale results

## Step 2: Notification Badges

### API

```js
updater.setBadge(count, options?)  // count=0 clears
updater.clearBadge()
```

**Options:** `{ backgroundColor, textColor, size, position, fontSize }`

### Design

- Badge is a **layer**, not a state — it overlays whatever icon is currently resolved
- Stored in `this._badge = { count, ...options }`
- `applyState()` checks `this._badge` after resolving the base URL:
  - If badge active → `_renderBadge(baseUrl)` (async: load image, draw on canvas, composite badge circle + text, return data URL)
  - If badge inactive → existing sync path unchanged
- Generation counter guards against stale async renders
- Counts > 99 display as "99+"
- **Not synced cross-tab** — badge counts are app-driven per tab

### Edge Cases

- Canvas unsupported → fall back to unbadged icon
- Image fails to load (CORS/404) → fall back to unbadged icon
- Rapid state changes → generation counter discards stale renders
- Data URLs as base → work fine (no CORS)

## Step 3: Animated Favicons

### API

```js
updater.startAnimation(type, options?)  // type: 'spinner' | 'pulse'
updater.stopAnimation()
```

**Options:** `{ color, baseIcon, speed, fps }` (default 30fps cap)

### Design

- Stored in `this._animation = { type, options, startTime }`
- Uses `requestAnimationFrame` loop in `_animateFrame()`, throttled to configured fps
- Two built-in renderers:
  - `_drawSpinner()` — rotating arc overlay around favicon border
  - `_drawPulse()` — oscillating opacity via sine wave
- **Animation takes precedence over badges** when both active (keeps pipeline simple)
- `applyState()` defers to animation loop when active — just updates `_animation._pendingBaseUrl`
- `stopAnimation()` cancels rAF, calls `applyState()` to restore static favicon (with badge if set)

### Edge Cases

- No `requestAnimationFrame` → no-op with console warning
- Background tabs → browsers throttle rAF naturally, no special handling
- Multiple `startAnimation` calls → stops previous first
- Canvas reused across frames to avoid GC pressure

## Step 4: Update `destroy()`

Add cleanup: `stopAnimation()`, `clearBadge()`, `_imageCache.clear()`

## Step 5: Tests

Extend test harness with mocks:
- **Canvas mock** — `getContext('2d')` records calls, `toDataURL()` returns fixed string
- **rAF mock** — `requestAnimationFrame = (cb) => setTimeout(cb, 0)`
- **Image mock** — `src` setter triggers `onload` synchronously

Test cases: badge rendering lifecycle, animation start/stop, interaction between features, fallbacks when canvas unavailable, generation counter race conditions.

---

## Files Modified

| File | Changes |
|------|---------|
| `favicon-updater.js` | Add badge + animation methods, refactor `applyState()`, update `destroy()` |
| `favicon-updater.test.js` | Add canvas/rAF/Image mocks, tests for new features |

## Key Principle

Animation and badge are **layers on top of** the existing state/priority system, not replacements. The resolution pipeline becomes:

```
states + priority → base URL → badge overlay? → animation override? → updateFavicon()
```
