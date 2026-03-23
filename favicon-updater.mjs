import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const FaviconUpdater = require('./favicon-updater.js');

export default FaviconUpdater;
export { FaviconUpdater };
