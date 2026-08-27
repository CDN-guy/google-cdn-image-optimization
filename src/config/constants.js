/**
 * Application constants and configuration
 */

const UA_STRING = 'ImageOptimizer/CloudRun';

const SUPPORTED_INPUT_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'svg'];
const SUPPORTED_OUTPUT_FORMATS = ['webp', 'jpeg', 'jpg', 'png', 'gif', 'jp2', 'jxl', 'tiff', 'raw'];

const LRU_CACHE_LIMIT_IN_GB = 4;
const DEFAULT_PORT = 8080;

module.exports = {
    UA_STRING,
    SUPPORTED_INPUT_FORMATS,
    SUPPORTED_OUTPUT_FORMATS,
    LRU_CACHE_LIMIT_IN_GB,
    DEFAULT_PORT
};
