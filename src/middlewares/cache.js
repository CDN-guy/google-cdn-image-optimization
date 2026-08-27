const { LRUCache } = require('lru-cache');
const { LRU_CACHE_LIMIT_IN_GB } = require('../config/constants');
const { parseImageParams } = require('../services/paramParser');

/** @type {import('lru-cache').LRUCache.Options<string, Buffer, any>} */
const options = {
    maxSize: LRU_CACHE_LIMIT_IN_GB * 1024 * 1024 * 1024,
    sizeCalculation: (value, _key) => {
        return Buffer.byteLength(value);
    }
};

/** @type {LRUCache<string, Buffer>} */
const lru_cache = new LRUCache(options);

/**
 * LRU-cache middleware: CacheKey construction, Cache Hit/Cache Miss
 * @returns {import('express').RequestHandler}
 */
const cache = () => {
    return (req, res, next) => {
        const { params, error } = parseImageParams(req);

        if (error) {
            res.status(error.status).json({
                error_message: error.message,
                details: error.details,
                requested_format: error.requestedFormat
            });
            return;
        }

        // Attach parsed parameters to request for downstream handlers
        // @ts-ignore attach parsed image params to request
        req.imageParams = params;

        const key = params.cacheKey;
        const format = params.format;

        // LRU cache lookup
        const cachedBody = lru_cache.get(key);

        // Cache-Hit Scenario
        if (cachedBody) {
            console.log(`[lru-cache]${req.method} ${req.originalUrl}`);
            console.log(`[lru-cache]Cache hit for ${key}`);
            res.header('X-IO-Cache', 'HIT');
            res.header('X-IO-Cache-Key', key);
            if (format === 'jp2') {
                res.type('image/jp2');
            } else if (format === 'jxl') {
                res.type('image/jxl');
            } else {
                res.type(format);
            }
            res.send(cachedBody);
            return;
        }

        // Cache-Miss Scenario
        console.log(`[lru-cache]${req.method} ${req.originalUrl}`);
        console.log(`[lru-cache]Cache miss for ${key}`);
        const sendResponse = res.send.bind(res);

        // @ts-ignore monkey-patching send to intercept cache write
        res.send = (body) => {
            if (res.statusCode >= 200 && res.statusCode < 300 && Buffer.isBuffer(body)) {
                lru_cache.set(key, body);
                res.header('X-IO-Cache', 'MISS');
                res.header('X-IO-Cache-Key', key);
            }
            return sendResponse(body);
        };

        next();
    };
};

module.exports = {
    cache,
    lru_cache
};
