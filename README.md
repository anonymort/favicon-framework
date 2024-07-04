# Dynamic Favicon Updater

## Overview

The Dynamic Favicon Updater is a lightweight JavaScript class designed to enhance user engagement by dynamically updating the favicon based on specific events or conditions. This framework allows web applications to communicate important information through the browser tab itself, even when the user is not actively viewing the page.

## Features

- Change favicon dynamically based on events or conditions
- Support for different states (e.g., notifications, status indicators)
- Customizable icons to match branding and application needs
- Automatic restoration to the original favicon when no events are active
- Cross-tab communication to ensure consistency across multiple browser tabs
- Priority management for multiple active states
- Error handling and input validation

## Potential Use Cases

- Web Applications: Enhance user experience by displaying real-time notifications or status updates in the favicon.
- Messaging Platforms: Indicate unread messages or new notifications directly in the browser tab.
- Monitoring Tools: Show system or service status updates through favicon changes.

## Installation

Include the `favicon-updater.js` script in your HTML file:

```html
<script src="path/to/favicon-updater.js"></script>
```

## API Reference

### Initialization

Create a new instance of FaviconUpdater with the default favicon URL and any pre-defined states.

```javascript
const faviconUpdater = new FaviconUpdater({
    defaultIcon: 'path/to/default/favicon.ico',
    states: {
        'notification': 'path/to/notification/favicon.ico',
        'error': 'path/to/error/favicon.ico',
        'success': 'path/to/success/favicon.ico'
    }
});
```

### Setting a State

Change the favicon based on a specific event or condition.

```javascript
faviconUpdater.setState('notification');
```

### Clearing a State

Remove a specific state from the active states.

```javascript
faviconUpdater.clearState('notification');
```

### Custom Favicon

Set a custom favicon directly.

```javascript
faviconUpdater.setFavicon('path/to/custom/favicon.ico');
```

### Managing Multiple States

Handle multiple states with priority (e.g., error state takes precedence over notification).

```javascript
faviconUpdater.setState('notification');
faviconUpdater.setState('error');
faviconUpdater.clearState('error');
```

### Setting State Priority

Specify the priority of each state.

```javascript
faviconUpdater.setPriority('error', 10);
faviconUpdater.setPriority('notification', 5);
```

### Clearing All States

Remove all active states and restore the default favicon.

```javascript
faviconUpdater.clearAllStates();
```

### Getting Active States

Retrieve the current list of active states.

```javascript
const activeStates = faviconUpdater.getActiveStates();
```

### Getting Current Icon

Retrieve the URL of the currently displayed favicon.

```javascript
const currentIcon = faviconUpdater.getCurrentIcon();
```

## Error Handling

The framework includes error handling and input validation. If an operation fails (e.g., due to an invalid URL or state), an error will be thrown with a descriptive message.

## Example Usage

```javascript
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
```

## Contributing

Contributions to the Dynamic Favicon Updater are welcome! Here are some ways you can contribute:

1. Report bugs or request features by opening an issue on the GitHub repository.
2. Improve documentation and examples.
3. Write code to address open issues or add new features.

To contribute code:

1. Fork the repository.
2. Create a new branch for your changes.
3. Make your changes and add tests if applicable.
4. Submit a pull request with a clear description of your changes.

Please ensure your code follows the existing style and passes all tests before submitting a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For questions, support, or to report issues, please open an issue on the GitHub repository: [[https://github.com/yourusername/favicon-updater](https://github.com/yourusername/favicon-updater](https://github.com/anonymort/favicon-framework/issues)
