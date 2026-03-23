# Issues Found in favicon-updater.js

## Critical

### 1. `setState()` unconditionally clears `overrideIcon` (line 114)

When `setState()` is called, it sets `this.overrideIcon = ''` regardless of whether
the user explicitly set a custom favicon via `setFavicon()`. This silently destroys
the user's override.

```js
setState(state) {
    if (!this.activeStates.includes(state)) {
        this.activeStates.push(state);
        this.overrideIcon = '';  // BUG: clears user's custom favicon
        this.applyState();
        this.syncAcrossTabs();
    }
}
```

**Expected**: Override icons set via `setFavicon()` should persist across state changes
unless explicitly cleared.

### 2. Default priority sort order is counterintuitive (line 74)

In `init()`, priorities are assigned by iteration index (0, 1, 2, ...). In `applyState()`,
the sort comparator `(b) - (a)` picks the highest number as the top state. This means
states defined *last* in the config object win by default, which is the opposite of
what most users would expect.

```js
// init() assigns: stateA=0, stateB=1, stateC=2
// applyState() sorts descending: stateC wins
this.activeStates.sort((a, b) =>
    (this.priorityMap.get(b) ?? 0) - (this.priorityMap.get(a) ?? 0)
);
```

### 3. `clearState()` lacks input validation (line 120)

`setState()` and `setPriority()` both validate that the state exists via `hasState()`,
but `clearState()` silently accepts any string. This inconsistency can mask typos:

```js
faviconUpdater.setState('notfication');   // throws Error (typo caught)
faviconUpdater.clearState('notfication'); // silently does nothing (typo hidden)
```

## Medium

### 4. No module export

The `FaviconUpdater` class is defined but never exported. It cannot be consumed via
`require()`, `import`, or any module system. The file needs:

```js
// CommonJS
module.exports = FaviconUpdater;
// or ESM
export default FaviconUpdater;
```

### 5. No URL scheme validation in `setFavicon()` (line 126)

`setFavicon()` accepts any string, including potentially unsafe schemes like
`javascript:` URIs. While browsers won't execute JS from a favicon `href`, basic
scheme validation (http, https, data, blob) would be more defensive.

### 6. `clearAllStates()` bypasses `applyState()` (line 138)

`clearAllStates()` directly calls `this.updateFavicon(this.defaultIcon)` instead of
going through `applyState()`. If the `applyState()` logic is extended in the future,
this method will become inconsistent. It should reset state and delegate to `applyState()`.

```js
clearAllStates() {
    this.activeStates = [];
    this.overrideIcon = '';
    this.updateFavicon(this.defaultIcon);  // should be this.applyState()
    this.syncAcrossTabs();
}
```

## Low

### 7. No test coverage

A stateful library with cross-tab synchronization, priority ordering, and localStorage
parsing has zero tests. This makes it difficult to verify correctness or safely refactor.

### 8. Hardcoded storage key `'faviconState'`

Multiple `FaviconUpdater` instances on the same origin will collide on the same
localStorage key, overwriting each other's state. The key should be configurable.

### 9. No cleanup / `destroy()` method

`setupEventListeners()` binds a `storage` event listener but provides no way to remove
it. Instances cannot be properly torn down, leading to potential memory leaks in SPAs
that create and discard `FaviconUpdater` instances.
