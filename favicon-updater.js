class FaviconUpdater {
    constructor(config) {
        this.defaultIcon = '';
        this.currentIcon = '';
        this.states = {};
        this.activeStates = [];
        this.priorityMap = new Map();
        this.overrideIcon = '';

        this.init(config);
        this.setupEventListeners();
    }

    init(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration. Expected an object.');
        }

        if (Object.prototype.hasOwnProperty.call(config, 'defaultIcon') && typeof config.defaultIcon !== 'string') {
            throw new Error('Invalid defaultIcon. Expected a string.');
        }
        if (Object.prototype.hasOwnProperty.call(config, 'states') && (config.states == null || typeof config.states !== 'object' || Array.isArray(config.states))) {
            throw new Error('Invalid states. Expected an object mapping state -> icon URL.');
        }

        this.defaultIcon = config.defaultIcon || '';
        this.states = config.states || {};

        for (const [state, icon] of Object.entries(this.states)) {
            if (typeof icon !== 'string') {
                throw new Error(`Invalid icon URL for state "${state}". Expected a string.`);
            }
        }
        this.updateFavicon(this.defaultIcon);

        Object.keys(this.states).forEach((state, index) => {
            this.priorityMap.set(state, index);
        });

        this.loadFromStorage();
    }

    setupEventListeners() {
        if (typeof window === 'undefined') return;
        window.addEventListener('storage', this.handleStorageEvent.bind(this));
    }

    updateFavicon(url) {
        if (typeof url !== 'string') {
            throw new Error('Invalid favicon URL. Expected a string.');
        }

        try {
            if (typeof document === 'undefined') return;
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = url;
            this.currentIcon = url;
        } catch (error) {
            console.error("Failed to update favicon:", error);
        }
    }

    applyState() {
        if (this.overrideIcon) {
            this.updateFavicon(this.overrideIcon);
            return;
        }
        if (this.activeStates.length > 0) {
            this.activeStates.sort((a, b) => (this.priorityMap.get(b) ?? 0) - (this.priorityMap.get(a) ?? 0));
            const topState = this.activeStates[0];
            const icon = this.states[topState];
            if (typeof icon === 'string') {
                this.updateFavicon(icon);
            } else {
                this.updateFavicon(this.defaultIcon);
            }
        } else {
            this.updateFavicon(this.defaultIcon);
        }
    }

    syncAcrossTabs() {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem('faviconState', JSON.stringify({
                activeStates: this.activeStates,
                overrideIcon: this.overrideIcon
            }));
        } catch {
            // Ignore storage failures (privacy mode, quotas, disabled storage, etc.)
        }
    }

    handleStorageEvent(event) {
        if (event.key === 'faviconState') {
            const next = this.parseStorageValue(event.newValue);
            this.activeStates = next.activeStates;
            this.overrideIcon = next.overrideIcon;
            this.applyState();
        }
    }

    setState(state) {
        if (!this.hasState(state)) {
            throw new Error(`Invalid state: ${state}`);
        }
        if (!this.activeStates.includes(state)) {
            this.activeStates.push(state);
            this.overrideIcon = '';
            this.applyState();
            this.syncAcrossTabs();
        }
    }

    clearState(state) {
        this.activeStates = this.activeStates.filter(s => s !== state);
        this.applyState();
        this.syncAcrossTabs();
    }

    setFavicon(url) {
        if (typeof url !== 'string') {
            throw new Error('Invalid favicon URL. Expected a string.');
        }
        this.overrideIcon = url;
        this.applyState();
        this.syncAcrossTabs();
    }

    clearAllStates() {
        this.activeStates = [];
        this.overrideIcon = '';
        this.updateFavicon(this.defaultIcon);
        this.syncAcrossTabs();
    }

    setPriority(state, priority) {
        if (!this.hasState(state)) {
            throw new Error(`Invalid state: ${state}`);
        }
        if (typeof priority !== 'number' || !Number.isFinite(priority)) {
            throw new Error('Priority must be a finite number');
        }
        this.priorityMap.set(state, priority);
        this.applyState();
        this.syncAcrossTabs();
    }

    getActiveStates() {
        return [...this.activeStates];
    }

    getCurrentIcon() {
        return this.currentIcon;
    }

    loadFromStorage() {
        try {
            if (typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem('faviconState');
            const next = this.parseStorageValue(raw);
            this.activeStates = next.activeStates;
            this.overrideIcon = next.overrideIcon;
            this.applyState();
        } catch {
            // Ignore storage failures.
        }
    }

    parseStorageValue(raw) {
        if (raw == null || raw === '') return { activeStates: [], overrideIcon: '' };
        try {
            const parsed = JSON.parse(raw);
            // Backwards compatibility: older versions stored just an array.
            if (Array.isArray(parsed)) {
                return {
                    activeStates: this.sanitiseActiveStates(parsed),
                    overrideIcon: ''
                };
            }
            if (parsed && typeof parsed === 'object') {
                return {
                    activeStates: this.sanitiseActiveStates(parsed.activeStates),
                    overrideIcon: typeof parsed.overrideIcon === 'string' ? parsed.overrideIcon : ''
                };
            }
        } catch {
            // Fall through to safe defaults.
        }
        return { activeStates: [], overrideIcon: '' };
    }

    sanitiseActiveStates(value) {
        if (!Array.isArray(value)) return [];
        const seen = new Set();
        const safe = [];
        for (const item of value) {
            if (typeof item !== 'string') continue;
            if (!this.hasState(item)) continue;
            if (seen.has(item)) continue;
            seen.add(item);
            safe.push(item);
        }
        return safe;
    }

    hasState(state) {
        return Object.prototype.hasOwnProperty.call(this.states, state);
    }
}
