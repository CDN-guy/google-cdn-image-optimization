const { SUPPORTED_OUTPUT_FORMATS } = require('../config/constants');

/**
 * @typedef {Object} ParsedImageParams
 * @property {number | undefined} width - Width in pixels or undefined
 * @property {number | undefined} height - Height in pixels or undefined
 * @property {string} format - Output image format
 * @property {number} quality - Compression quality (1-100)
 * @property {string} position - Crop position/gravity
 * @property {string} fit - Resize fit mode
 * @property {string} cacheKey - Cache key for LRU cache lookup
 */

/**
 * @typedef {Object} ParamParseResult
 * @property {ParsedImageParams | null} params
 * @property {{ status: number, message: string, requestedFormat?: string } | null} error
 */

/**
 * Resolve output image format from query, headers, and user-agent
 * @param {string | undefined} queryFormat
 * @param {string | undefined} acceptHeader
 * @param {string} uaFamily
 * @returns {string}
 */
function resolveOutputFormat(queryFormat, acceptHeader, uaFamily) {
    let rawFormat = (queryFormat || acceptHeader || 'webp').toLowerCase();
    if (uaFamily === 'MSIE') {
        rawFormat = 'jpg';
    }
    return SUPPORTED_OUTPUT_FORMATS.includes(rawFormat) ? rawFormat : 'webp';
}

/**
 * Resolve quality level (1-100) based on query and client device type
 * @param {string | undefined} queryQuality
 * @param {string} deviceType
 * @returns {number}
 */
function resolveQuality(queryQuality, deviceType) {
    const quality = typeof queryQuality === 'string' ? parseInt(queryQuality, 10) : NaN;
    if (!isNaN(quality) && quality >= 1 && quality <= 100) {
        return quality;
    }

    switch (deviceType.toLowerCase()) {
        case 'desktop':
            return 60;
        case 'tablet':
        case 'smart_tv':
        case 'game_console':
        case 'set_top_box':
            return 40;
        case 'wearable':
        case 'smart_speaker':
        case 'mobile':
            return 20;
        default:
            return 40;
    }
}

/**
 * Resolve crop position from query parameter
 * @param {string | undefined} queryPosition
 * @returns {string}
 */
function resolvePosition(queryPosition) {
    switch (queryPosition) {
        case 'top':
            return 'top';
        case 'right_top':
            return 'right top';
        case 'right':
            return 'right';
        case 'right_bottom':
            return 'right bottom';
        case 'bottom':
            return 'bottom';
        case 'left_bottom':
            return 'left bottom';
        case 'left':
            return 'left';
        case 'left_top':
            return 'left top';
        case 'center':
        case 'centre':
            return 'center';
        default:
            return 'center';
    }
}

/**
 * Resolve resize fit mode from query parameter
 * @param {string | undefined} queryFit
 * @returns {string}
 */
function resolveFit(queryFit) {
    switch (queryFit) {
        case 'cover':
            return 'cover';
        case 'contain':
            return 'contain';
        case 'fill':
            return 'fill';
        case 'inside':
            return 'inside';
        case 'outside':
            return 'outside';
        default:
            return 'cover';
    }
}

/**
 * Construct CacheKey for LRU cache lookup
 * @param {string} format
 * @param {number} quality
 * @param {number | string} width
 * @param {number | string} height
 * @param {string} position
 * @param {string} fit
 * @param {string} basePath
 * @returns {string}
 */
function buildCacheKey(format, quality, width, height, position, fit, basePath) {
    return `f:${format}-q:${quality}-w:${width}-h:${height}-position:${position}-fit:${fit}:${basePath}`;
}

/**
 * Parse and validate image transformation parameters from Express request
 * @param {import('express').Request} req
 * @returns {ParamParseResult}
 */
function parseImageParams(req) {
    const rawDeviceType = req.headers['x-client-device-type'];
    const deviceType = typeof rawDeviceType === 'string' ? rawDeviceType : 'device_type';
    const rawUaFamily = req.headers['x-client-ua-family'];
    const uaFamily = typeof rawUaFamily === 'string' ? rawUaFamily : 'ua_family';

    // Parse dimensions
    const parsedW = typeof req.query.w === 'string' ? parseInt(req.query.w, 10) : NaN;
    const parsedH = typeof req.query.h === 'string' ? parseInt(req.query.h, 10) : NaN;
    const width = (!isNaN(parsedW) && parsedW > 0 && parsedW <= 4096) ? parsedW : undefined;
    const height = (!isNaN(parsedH) && parsedH > 0 && parsedH <= 4096) ? parsedH : undefined;

    const cacheKeyWidth = width !== undefined ? width : 'none';
    const cacheKeyHeight = height !== undefined ? height : 'none';

    // Validate requested output format
    if (typeof req.query.f === 'string') {
        const requestedF = req.query.f.toLowerCase();
        if (requestedF === 'avif') {
            return {
                params: null,
                error: {
                    status: 400,
                    message: "Error: AVIF output format is currently disabled",
                    requestedFormat: req.query.f
                }
            };
        }
        if (!SUPPORTED_OUTPUT_FORMATS.includes(requestedF)) {
            return {
                params: null,
                error: {
                    status: 400,
                    message: `Error: Unsupported output format '${req.query.f}'. Supported formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`,
                    requestedFormat: req.query.f
                }
            };
        }
    }

    const queryF = typeof req.query.f === 'string' ? req.query.f : undefined;
    const acceptHeader = typeof req.headers['x-client-accept'] === 'string' ? req.headers['x-client-accept'] : undefined;
    const format = resolveOutputFormat(queryF, acceptHeader, uaFamily);

    const queryQ = typeof req.query.q === 'string' ? req.query.q : undefined;
    const quality = resolveQuality(queryQ, deviceType);

    const queryP = typeof req.query.p === 'string' ? req.query.p : undefined;
    const position = resolvePosition(queryP);

    const queryFit = typeof req.query.fit === 'string' ? req.query.fit : undefined;
    const fit = resolveFit(queryFit);

    const cacheKey = buildCacheKey(
        format,
        quality,
        cacheKeyWidth,
        cacheKeyHeight,
        position,
        fit,
        `${req.baseUrl}${req.path}`
    );

    return {
        params: {
            width,
            height,
            format,
            quality,
            position,
            fit,
            cacheKey
        },
        error: null
    };
}

module.exports = {
    parseImageParams,
    resolveOutputFormat,
    resolveQuality,
    resolvePosition,
    resolveFit,
    buildCacheKey
};
