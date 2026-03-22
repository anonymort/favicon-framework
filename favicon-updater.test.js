const FaviconUpdater = require('./favicon-updater');

// Minimal DOM/browser mocks
function setupDom() {
    const links = [];
    global.document = {
        querySelector: (sel) => links.find(l => l._sel === sel) || null,
        createElement: (tag) => {
            const el = { _sel: "link[rel~='icon']", rel: '', href: '' };
            links.push(el);
            return el;
        },
        head: { appendChild: () => {} }
    };
}

function setupStorage() {
    const store = {};
    global.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; },
        _store: store
    };
    return store;
}

function teardown() {
    delete global.document;
    delete global.localStorage;
    delete global.window;
}

function makeConfig(overrides = {}) {
    return {
        defaultIcon: '/default.ico',
        states: {
            notification: '/notification.ico',
            error: '/error.ico',
            loading: '/loading.ico'
        },
        ...overrides
    };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        failed++;
        console.error(`  FAIL: ${message}`);
    } else {
        passed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        failed++;
        console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    } else {
        passed++;
    }
}

function assertThrows(fn, message) {
    try {
        fn();
        failed++;
        console.error(`  FAIL: ${message} — expected error but none was thrown`);
    } catch {
        passed++;
    }
}

function test(name, fn) {
    teardown();
    setupDom();
    setupStorage();
    global.window = { addEventListener: () => {}, removeEventListener: () => {} };
    try {
        fn();
    } catch (e) {
        failed++;
        console.error(`  FAIL: ${name} — ${e.message}`);
    }
    teardown();
}

// --- Constructor / init ---

test('constructor requires config object', () => {
    assertThrows(() => new FaviconUpdater(), 'null config');
    assertThrows(() => new FaviconUpdater('string'), 'string config');
    assertThrows(() => new FaviconUpdater(42), 'number config');
});

test('constructor validates defaultIcon type', () => {
    assertThrows(() => new FaviconUpdater({ defaultIcon: 123 }), 'numeric defaultIcon');
});

test('constructor validates states type', () => {
    assertThrows(() => new FaviconUpdater({ states: 'bad' }), 'string states');
    assertThrows(() => new FaviconUpdater({ states: [1, 2] }), 'array states');
    assertThrows(() => new FaviconUpdater({ states: null }), 'null states');
});

test('constructor validates icon URLs in states', () => {
    assertThrows(() => new FaviconUpdater({ states: { a: 123 } }), 'numeric icon URL');
});

test('constructor sets defaultIcon', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertEqual(fu.defaultIcon, '/default.ico', 'defaultIcon');
});

// --- Priority ordering (issue #2 fix) ---

test('first-defined state has highest default priority', () => {
    const fu = new FaviconUpdater(makeConfig());
    // notification is defined first, should have highest priority
    const notifPriority = fu.priorityMap.get('notification');
    const errorPriority = fu.priorityMap.get('error');
    const loadingPriority = fu.priorityMap.get('loading');
    assert(notifPriority > errorPriority, 'notification > error priority');
    assert(errorPriority > loadingPriority, 'error > loading priority');
});

test('first-defined state wins when multiple states active', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setState('loading');
    fu.setState('notification');
    assertEqual(fu.getCurrentIcon(), '/notification.ico', 'notification wins');
});

// --- setState ---

test('setState activates a valid state', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setState('error');
    assert(fu.getActiveStates().includes('error'), 'error is active');
    assertEqual(fu.getCurrentIcon(), '/error.ico', 'error icon applied');
});

test('setState throws on invalid state', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertThrows(() => fu.setState('nonexistent'), 'invalid state');
});

test('setState does not duplicate states', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setState('error');
    fu.setState('error');
    assertEqual(fu.getActiveStates().filter(s => s === 'error').length, 1, 'no duplicate');
});

// --- setState does NOT clear overrideIcon (issue #1 fix) ---

test('setState preserves overrideIcon', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setFavicon('https://example.com/custom.ico');
    fu.setState('error');
    assertEqual(fu.overrideIcon, 'https://example.com/custom.ico', 'override preserved');
    assertEqual(fu.getCurrentIcon(), 'https://example.com/custom.ico', 'override icon shown');
});

// --- clearState ---

test('clearState removes an active state', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setState('error');
    fu.clearState('error');
    assert(!fu.getActiveStates().includes('error'), 'error cleared');
});

test('clearState throws on invalid state (issue #3 fix)', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertThrows(() => fu.clearState('nonexistent'), 'invalid state');
});

// --- setFavicon ---

test('setFavicon sets override icon', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setFavicon('https://example.com/fav.ico');
    assertEqual(fu.getCurrentIcon(), 'https://example.com/fav.ico', 'override applied');
});

test('setFavicon throws on non-string', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertThrows(() => fu.setFavicon(42), 'numeric url');
});

test('setFavicon rejects javascript: URLs (issue #5 fix)', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertThrows(() => fu.setFavicon('javascript:alert(1)'), 'javascript: URL');
});

test('setFavicon accepts data: URLs', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setFavicon('data:image/png;base64,abc');
    assertEqual(fu.getCurrentIcon(), 'data:image/png;base64,abc', 'data URL accepted');
});

// --- clearAllStates uses applyState (issue #6 fix) ---

test('clearAllStates resets to default', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setState('error');
    fu.setFavicon('https://example.com/custom.ico');
    fu.clearAllStates();
    assertEqual(fu.getActiveStates().length, 0, 'no active states');
    assertEqual(fu.overrideIcon, '', 'override cleared');
    assertEqual(fu.getCurrentIcon(), '/default.ico', 'default icon restored');
});

// --- setPriority ---

test('setPriority changes which state wins', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.setState('notification');
    fu.setState('loading');
    assertEqual(fu.getCurrentIcon(), '/notification.ico', 'notification wins initially');
    fu.setPriority('loading', 999);
    assertEqual(fu.getCurrentIcon(), '/loading.ico', 'loading wins after priority change');
});

test('setPriority validates state', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertThrows(() => fu.setPriority('nonexistent', 1), 'invalid state');
});

test('setPriority validates priority type', () => {
    const fu = new FaviconUpdater(makeConfig());
    assertThrows(() => fu.setPriority('error', 'high'), 'string priority');
    assertThrows(() => fu.setPriority('error', Infinity), 'infinite priority');
    assertThrows(() => fu.setPriority('error', NaN), 'NaN priority');
});

// --- Configurable storage key (issue #8 fix) ---

test('custom storageKey is used', () => {
    const store = global.localStorage._store;
    const fu = new FaviconUpdater(makeConfig({ storageKey: 'myApp_favicon' }));
    fu.setState('error');
    assert('myApp_favicon' in store, 'custom key used in storage');
    assert(!('faviconState' in store), 'default key not used');
});

// --- destroy (issue #9 fix) ---

test('destroy removes event listener', () => {
    let removed = false;
    global.window = {
        addEventListener: () => {},
        removeEventListener: () => { removed = true; }
    };
    const fu = new FaviconUpdater(makeConfig());
    fu.destroy();
    assert(removed, 'removeEventListener called');
});

// --- parseStorageValue ---

test('parseStorageValue handles null/empty', () => {
    const fu = new FaviconUpdater(makeConfig());
    const r1 = fu.parseStorageValue(null);
    assertEqual(r1.activeStates.length, 0, 'null -> empty');
    const r2 = fu.parseStorageValue('');
    assertEqual(r2.activeStates.length, 0, 'empty -> empty');
});

test('parseStorageValue handles legacy array format', () => {
    const fu = new FaviconUpdater(makeConfig());
    const r = fu.parseStorageValue(JSON.stringify(['error', 'notification']));
    assertEqual(r.activeStates.length, 2, 'two states parsed');
    assertEqual(r.overrideIcon, '', 'no override from legacy');
});

test('parseStorageValue handles new object format', () => {
    const fu = new FaviconUpdater(makeConfig());
    const r = fu.parseStorageValue(JSON.stringify({
        activeStates: ['error'],
        overrideIcon: 'https://example.com/x.ico'
    }));
    assertEqual(r.activeStates.length, 1, 'one state parsed');
    assertEqual(r.overrideIcon, 'https://example.com/x.ico', 'override parsed');
});

test('parseStorageValue filters invalid states', () => {
    const fu = new FaviconUpdater(makeConfig());
    const r = fu.parseStorageValue(JSON.stringify({ activeStates: ['error', 'bogus', 123] }));
    assertEqual(r.activeStates.length, 1, 'only valid state kept');
    assertEqual(r.activeStates[0], 'error', 'error kept');
});

test('parseStorageValue handles corrupt JSON', () => {
    const fu = new FaviconUpdater(makeConfig());
    const r = fu.parseStorageValue('{bad json');
    assertEqual(r.activeStates.length, 0, 'corrupt -> empty');
});

// --- Cross-tab sync ---

test('handleStorageEvent updates state from other tab', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.handleStorageEvent({
        key: 'faviconState',
        newValue: JSON.stringify({ activeStates: ['error'], overrideIcon: '' })
    });
    assert(fu.getActiveStates().includes('error'), 'error synced');
    assertEqual(fu.getCurrentIcon(), '/error.ico', 'error icon applied');
});

test('handleStorageEvent ignores other keys', () => {
    const fu = new FaviconUpdater(makeConfig());
    fu.handleStorageEvent({ key: 'otherKey', newValue: '{}' });
    assertEqual(fu.getActiveStates().length, 0, 'no state change');
});

// --- Module export (issue #4 fix) ---

test('module exports FaviconUpdater', () => {
    assertEqual(typeof FaviconUpdater, 'function', 'FaviconUpdater is exported');
    assertEqual(FaviconUpdater.name, 'FaviconUpdater', 'correct class name');
});

// --- Results ---

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
    process.exit(1);
}
