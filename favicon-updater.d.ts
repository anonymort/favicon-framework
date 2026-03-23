export interface FaviconUpdaterConfig {
    /** URL of the default favicon */
    defaultIcon?: string;
    /** Map of state names to favicon URLs */
    states?: Record<string, string>;
    /** Custom localStorage key for cross-tab sync (default: 'faviconState') */
    storageKey?: string;
}

export interface BadgeOptions {
    /** Background color of the badge circle (default: '#FF0000') */
    backgroundColor?: string;
    /** Text color of the badge count (default: '#FFFFFF') */
    textColor?: string;
    /** Badge size relative to favicon, 0-1 (default: 0.4) */
    size?: number;
    /** Position of the badge on the favicon (default: 'top-right') */
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface AnimationOptions {
    /** Color used by built-in animations (default: '#4285F4') */
    color?: string;
    /** Animation speed multiplier (default: 1.0) */
    speed?: number;
    /** Frames per second cap (default: 15) */
    fps?: number;
    /** Override base icon URL for the animation */
    baseIcon?: string | null;
}

export type CustomAnimationFn = (
    ctx: CanvasRenderingContext2D,
    size: number,
    progress: number,
    baseImage: HTMLImageElement
) => void;

declare class FaviconUpdater {
    /** Current favicon URL */
    currentIcon: string;
    /** Default favicon URL */
    defaultIcon: string;

    constructor(config: FaviconUpdaterConfig);

    /** Activate a favicon state */
    setState(state: string): void;
    /** Deactivate a favicon state */
    clearState(state: string): void;
    /** Clear all active states and restore default favicon */
    clearAllStates(): void;
    /** Set a custom override favicon URL */
    setFavicon(url: string): void;
    /** Set priority for a state (higher number = higher priority) */
    setPriority(state: string, priority: number): void;
    /** Get list of currently active state names */
    getActiveStates(): string[];
    /** Get the URL of the currently displayed favicon */
    getCurrentIcon(): string;

    /** Display a notification badge on the favicon */
    setBadge(count: number, options?: BadgeOptions): void;
    /** Remove the notification badge */
    clearBadge(): void;

    /** Start a favicon animation */
    startAnimation(type: 'spinner' | 'pulse' | CustomAnimationFn, options?: AnimationOptions): void;
    /** Stop the current animation */
    stopAnimation(): void;

    /** Clean up all resources, event listeners, and caches */
    destroy(): void;
}

export default FaviconUpdater;
export { FaviconUpdater };
