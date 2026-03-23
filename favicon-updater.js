const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'data:', 'blob:'];
const IMAGE_CACHE_MAX = 20;
const FAVICON_SIZE = 32;
const VALID_BADGE_POSITIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];

class FaviconUpdater {
    constructor(config) {
        this.defaultIcon = '';
        this.currentIcon = '';
        this.states = {};
        this.activeStates = [];
        this.priorityMap = new Map();
        this.overrideIcon = '';
        this._storageKey = 'faviconState';
        this._boundHandleStorage = this.handleStorageEvent.bind(this);

        // Badge state
        this._badge = null;
        this._badgeCache = null; // { baseUrl, count, dataUrl }

        // Animation state
        this._animation = null;
        this._animationFrameId = null;

        // Shared infrastructure
        this._imageCache = new Map();
        this._canvasSupported = null;
        this._renderGeneration = 0;
        this._animationCanvas = null;

        this._boundVisibilityChange = this._handleVisibilityChange.bind(this);

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

        if (typeof config.storageKey === 'string' && config.storageKey) {
            this._storageKey = config.storageKey;
        }

        for (const [state, icon] of Object.entries(this.states)) {
            if (typeof icon !== 'string') {
                throw new Error(`Invalid icon URL for state "${state}". Expected a string.`);
            }
        }
        this.updateFavicon(this.defaultIcon);

        const stateKeys = Object.keys(this.states);
        stateKeys.forEach((state, index) => {
            this.priorityMap.set(state, stateKeys.length - index);
        });

        this.loadFromStorage();
    }

    setupEventListeners() {
        if (typeof window === 'undefined') return;
        window.addEventListener('storage', this._boundHandleStorage);
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', this._boundVisibilityChange);
        }
    }

    destroy() {
        this.stopAnimation();
        this._badge = null;
        this._badgeCache = null;
        this._imageCache.clear();
        this._animationCanvas = null;
        if (typeof document !== 'undefined' && document.removeEventListener) {
            document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        }
        if (typeof window === 'undefined') return;
        window.removeEventListener('storage', this._boundHandleStorage);
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

    // --- Base URL resolution (extracted from applyState) ---

    _resolveBaseUrl() {
        if (this.overrideIcon) {
            return this.overrideIcon;
        }
        if (this.activeStates.length > 0) {
            this.activeStates.sort((a, b) => (this.priorityMap.get(b) ?? 0) - (this.priorityMap.get(a) ?? 0));
            const topState = this.activeStates[0];
            const icon = this.states[topState];
            if (typeof icon === 'string') {
                return icon;
            }
        }
        return this.defaultIcon;
    }

    applyState() {
        const baseUrl = this._resolveBaseUrl();

        // If animation is running, update its base URL — the animation loop handles favicon updates
        if (this._animation) {
            this._animation.baseUrl = baseUrl;
            return;
        }

        // Sync: set the base icon immediately
        this.updateFavicon(baseUrl);

        // Async: overlay badge if active
        if (this._badge && this._badge.count > 0 && this._canUseCanvas()) {
            this._applyOverlay(baseUrl);
        }
    }

    // --- Canvas support detection ---

    _canUseCanvas() {
        if (this._canvasSupported !== null) return this._canvasSupported;
        try {
            if (typeof document === 'undefined') {
                this._canvasSupported = false;
                return false;
            }
            const canvas = document.createElement('canvas');
            this._canvasSupported = !!(canvas && canvas.getContext && canvas.getContext('2d'));
        } catch {
            this._canvasSupported = false;
        }
        return this._canvasSupported;
    }

    // --- Image loading with cache ---

    _loadImage(url) {
        if (this._imageCache.has(url)) {
            return Promise.resolve(this._imageCache.get(url));
        }
        return new Promise((resolve, reject) => {
            if (typeof Image === 'undefined') {
                return reject(new Error('Image not available'));
            }
            const img = new Image();
            if (!url.startsWith('data:')) {
                img.crossOrigin = 'anonymous';
            }
            img.onload = () => {
                // Evict oldest entry if cache is full
                if (this._imageCache.size >= IMAGE_CACHE_MAX) {
                    const firstKey = this._imageCache.keys().next().value;
                    this._imageCache.delete(firstKey);
                }
                this._imageCache.set(url, img);
                resolve(img);
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
        });
    }

    // --- Badge support ---

    setBadge(count, options) {
        if (typeof count !== 'number' || !Number.isFinite(count)) {
            throw new Error('Badge count must be a finite number');
        }
        count = Math.max(0, Math.floor(count));
        if (count === 0) {
            this.clearBadge();
            return;
        }

        const defaults = {
            backgroundColor: '#FF0000',
            textColor: '#FFFFFF',
            size: 0.4,
            position: 'top-right'
        };
        this._badge = { count, ...defaults, ...(options || {}) };
        if (!VALID_BADGE_POSITIONS.includes(this._badge.position)) {
            throw new Error(`Invalid badge position: "${this._badge.position}". Expected one of: ${VALID_BADGE_POSITIONS.join(', ')}`);
        }
        this._badgeCache = null;

        if (this._animation) {
            // Animation loop will pick up the badge on next frame
            return;
        }

        const baseUrl = this._resolveBaseUrl();
        this.updateFavicon(baseUrl);
        if (this._canUseCanvas()) {
            this._applyOverlay(baseUrl);
        }
    }

    clearBadge() {
        this._badge = null;
        this._badgeCache = null;
        if (!this._animation) {
            this.applyState();
        }
    }

    _badgeCacheKey(badge) {
        return `${badge.backgroundColor}|${badge.textColor}|${badge.size}|${badge.position}`;
    }

    _applyOverlay(baseUrl) {
        const generation = ++this._renderGeneration;
        const badge = this._badge;
        if (!badge || badge.count <= 0) return;

        // Check cache (includes options to avoid stale renders on option changes)
        const optionsKey = this._badgeCacheKey(badge);
        if (this._badgeCache && this._badgeCache.baseUrl === baseUrl && this._badgeCache.count === badge.count && this._badgeCache.optionsKey === optionsKey) {
            this.updateFavicon(this._badgeCache.dataUrl);
            return;
        }

        this._loadImage(baseUrl).then(img => {
            if (this._renderGeneration !== generation) return;
            if (this._animation) return; // animation took over

            const canvas = document.createElement('canvas');
            canvas.width = FAVICON_SIZE;
            canvas.height = FAVICON_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) return; // canvas context unavailable — fall back to base icon
            ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
            this._drawBadge(ctx, FAVICON_SIZE, badge);
            const dataUrl = canvas.toDataURL('image/png');

            this._badgeCache = { baseUrl, count: badge.count, optionsKey, dataUrl };

            if (this._renderGeneration === generation && !this._animation) {
                this.updateFavicon(dataUrl);
            }
        }).catch((err) => {
            console.warn('FaviconUpdater: badge overlay failed, using base icon.', err);
        });
    }

    _drawBadge(ctx, size, badge) {
        const radius = size * badge.size * 0.5;
        let cx, cy;
        const margin = radius * 0.15;
        switch (badge.position) {
            case 'top-left':
                cx = radius + margin;
                cy = radius + margin;
                break;
            case 'bottom-right':
                cx = size - radius - margin;
                cy = size - radius - margin;
                break;
            case 'bottom-left':
                cx = radius + margin;
                cy = size - radius - margin;
                break;
            case 'top-right':
            default:
                cx = size - radius - margin;
                cy = radius + margin;
                break;
        }

        // Draw circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = badge.backgroundColor;
        ctx.fill();

        // Draw text
        const text = badge.count > 99 ? '99+' : String(badge.count);
        const fontSize = radius * (text.length > 2 ? 0.9 : 1.1);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = badge.textColor;
        ctx.fillText(text, cx, cy);
    }

    // --- Animation support ---

    startAnimation(type, options) {
        this.stopAnimation();

        if (!this._canUseCanvas()) return;
        if (typeof requestAnimationFrame === 'undefined') return;

        const isCustom = typeof type === 'function';
        if (!isCustom && type !== 'spinner' && type !== 'pulse') {
            throw new Error(`Invalid animation type: ${type}. Expected 'spinner', 'pulse', or a function.`);
        }

        const defaults = {
            color: '#4285F4',
            speed: 1.0,
            fps: 15,
            baseIcon: null
        };
        const opts = { ...defaults, ...(options || {}) };

        const baseUrl = opts.baseIcon || this._resolveBaseUrl();
        const animation = {
            type,
            options: opts,
            baseUrl,
            startTime: null,
            lastFrameTime: 0,
            isCustom,
            _loadedUrl: null
        };
        this._animation = animation;

        this._loadImage(baseUrl).then(img => {
            // Check that this animation is still the active one (race condition guard)
            if (this._animation !== animation) return;
            animation.startTime = performance.now();
            animation._loadedUrl = baseUrl;
            this._animateFrame(animation, img);
        }).catch((err) => {
            console.warn('FaviconUpdater: animation image load failed, cancelling animation.', err);
            if (this._animation === animation) {
                this._animation = null;
                this.applyState();
            }
        });
    }

    stopAnimation() {
        if (!this._animation) return;
        if (this._animationFrameId != null) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
        this._animation = null;
        this._animationCanvas = null;
        this.applyState();
    }

    _handleVisibilityChange() {
        if (!this._animation) return;
        if (document.hidden) {
            if (this._animationFrameId != null) {
                cancelAnimationFrame(this._animationFrameId);
                this._animationFrameId = null;
            }
        } else {
            if (this._animationFrameId == null) {
                this._loadImage(this._animation.baseUrl).then(img => {
                    if (this._animation && this._animationFrameId == null) {
                        this._animateFrame(this._animation, img);
                    }
                }).catch(() => {});
            }
        }
    }

    _animateFrame(animation, baseImage) {
        if (this._animation !== animation) return;

        const now = performance.now();
        const minInterval = 1000 / animation.options.fps;

        if (now - animation.lastFrameTime < minInterval) {
            this._animationFrameId = requestAnimationFrame(() => this._animateFrame(animation, baseImage));
            return;
        }
        animation.lastFrameTime = now;

        // Check if base URL changed (state change during animation)
        if (animation.baseUrl !== (animation._loadedUrl || baseImage.src)) {
            this._loadImage(animation.baseUrl).then(newImg => {
                if (this._animation !== animation) return;
                animation._loadedUrl = animation.baseUrl;
                this._renderAnimationFrame(animation, newImg, now);
                this._animationFrameId = requestAnimationFrame(() => this._animateFrame(animation, newImg));
            }).catch(() => {
                if (this._animation !== animation) return;
                this._renderAnimationFrame(animation, baseImage, now);
                this._animationFrameId = requestAnimationFrame(() => this._animateFrame(animation, baseImage));
            });
            return;
        }

        this._renderAnimationFrame(animation, baseImage, now);
        this._animationFrameId = requestAnimationFrame(() => this._animateFrame(animation, baseImage));
    }

    _getAnimationCanvas() {
        if (!this._animationCanvas) {
            this._animationCanvas = document.createElement('canvas');
            this._animationCanvas.width = FAVICON_SIZE;
            this._animationCanvas.height = FAVICON_SIZE;
        }
        return this._animationCanvas;
    }

    _renderAnimationFrame(animation, baseImage, now) {
        const elapsed = (now - animation.startTime) / 1000;
        const progress = (elapsed * animation.options.speed) % 1;

        const canvas = this._getAnimationCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) return; // canvas context unavailable
        ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);

        if (animation.isCustom) {
            animation.type(ctx, FAVICON_SIZE, progress, baseImage);
        } else if (animation.type === 'spinner') {
            this._drawSpinner(ctx, FAVICON_SIZE, progress, baseImage, animation.options);
        } else if (animation.type === 'pulse') {
            this._drawPulse(ctx, FAVICON_SIZE, progress, baseImage, animation.options);
        }

        // Composite badge on top if active
        if (this._badge && this._badge.count > 0) {
            this._drawBadge(ctx, FAVICON_SIZE, this._badge);
        }

        this.updateFavicon(canvas.toDataURL('image/png'));
    }

    _drawSpinner(ctx, size, progress, baseImage, options) {
        // Draw base image slightly dimmed
        ctx.globalAlpha = 0.6;
        ctx.drawImage(baseImage, 0, 0, size, size);
        ctx.globalAlpha = 1.0;

        // Draw rotating arc
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 2;
        const startAngle = progress * 2 * Math.PI - Math.PI / 2;
        const arcLength = Math.PI * 1.2;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, startAngle + arcLength);
        ctx.strokeStyle = options.color;
        ctx.lineWidth = Math.max(2, size * 0.08);
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    _drawPulse(ctx, size, progress, baseImage, _options) {
        const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(progress * 2 * Math.PI));
        ctx.globalAlpha = alpha;
        ctx.drawImage(baseImage, 0, 0, size, size);
        ctx.globalAlpha = 1.0;
    }

    // --- Existing methods (unchanged) ---

    syncAcrossTabs() {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(this._storageKey, JSON.stringify({
                activeStates: this.activeStates,
                overrideIcon: this.overrideIcon
            }));
        } catch {
            // Ignore storage failures (privacy mode, quotas, disabled storage, etc.)
        }
    }

    handleStorageEvent(event) {
        if (event.key === this._storageKey) {
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
            this.applyState();
            this.syncAcrossTabs();
        }
    }

    clearState(state) {
        if (!this.hasState(state)) {
            throw new Error(`Invalid state: ${state}`);
        }
        this.activeStates = this.activeStates.filter(s => s !== state);
        this.applyState();
        this.syncAcrossTabs();
    }

    setFavicon(url) {
        if (typeof url !== 'string') {
            throw new Error('Invalid favicon URL. Expected a string.');
        }
        if (url !== '') {
            try {
                const parsed = new URL(url, 'http://localhost');
                if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
                    throw new Error(`Unsupported URL scheme: ${parsed.protocol}. Allowed: ${ALLOWED_URL_SCHEMES.join(', ')}`);
                }
            } catch (e) {
                if (e.message.startsWith('Unsupported URL scheme')) throw e;
                throw new Error('Invalid favicon URL. Could not parse URL.');
            }
        }
        this.overrideIcon = url;
        this.applyState();
        this.syncAcrossTabs();
    }

    clearAllStates() {
        this.activeStates = [];
        this.overrideIcon = '';
        this.applyState();
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
            const raw = localStorage.getItem(this._storageKey);
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaviconUpdater;
}
