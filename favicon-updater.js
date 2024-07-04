class FaviconUpdater {
    constructor(config) {
        this.defaultIcon = '';
        this.currentIcon = '';
        this.states = {};
        this.activeStates = [];
        this.priorityMap = new Map();

        this.init(config);
        this.setupEventListeners();
    }

    init(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration. Expected an object.');
        }

        this.defaultIcon = config.defaultIcon || '';
        this.states = config.states || {};
        this.updateFavicon(this.defaultIcon);

        Object.keys(this.states).forEach((state, index) => {
            this.priorityMap.set(state, index);
        });
    }

    setupEventListeners() {
        window.addEventListener('storage', this.handleStorageEvent.bind(this));
    }

    updateFavicon(url) {
        if (typeof url !== 'string') {
            throw new Error('Invalid favicon URL. Expected a string.');
        }

        try {
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
        if (this.activeStates.length > 0) {
            this.activeStates.sort((a, b) => this.priorityMap.get(b) - this.priorityMap.get(a));
            const topState = this.activeStates[0];
            this.updateFavicon(this.states[topState]);
        } else {
            this.updateFavicon(this.defaultIcon);
        }
    }

    syncAcrossTabs() {
        localStorage.setItem('faviconState', JSON.stringify(this.activeStates));
    }

    handleStorageEvent(event) {
        if (event.key === 'faviconState') {
            this.activeStates = JSON.parse(event.newValue);
            this.applyState();
        }
    }

    setState(state) {
        if (!this.states[state]) {
            throw new Error(`Invalid state: ${state}`);
        }
        if (!this.activeStates.includes(state)) {
            this.activeStates.push(state);
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
        this.updateFavicon(url);
        this.syncAcrossTabs();
    }

    clearAllStates() {
        this.activeStates = [];
        this.updateFavicon(this.defaultIcon);
        this.syncAcrossTabs();
    }

    setPriority(state, priority) {
        if (!this.states[state]) {
            throw new Error(`Invalid state: ${state}`);
        }
        if (typeof priority !== 'number') {
            throw new Error('Priority must be a number');
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
}

// Example Usage
const faviconUpdater = new FaviconUpdater({
    defaultIcon: 'path/to/default/favicon.ico',
    states: {
        'notification': 'path/to/notification/favicon.ico',
        'error': 'path/to/error/favicon.ico',
        'success': 'path/to/success/favicon.ico'
    }
});

faviconUpdater.setState('notification');
setTimeout(() => faviconUpdater.clearState('notification'), 5000);
