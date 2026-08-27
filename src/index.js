// Import dependencies
const sharp = require("sharp");
const express = require('express');
const { LRUCache } = require('lru-cache');

// Initialize express instance
const app = express();
app.disable('x-powered-by');

// Set User-Agent
const UA_String = 'ImageOptimizer/CloudRun';

// Supported Formats
const SUPPORTED_INPUT_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'svg'];
const SUPPORTED_OUTPUT_FORMATS = ['webp', 'jpeg', 'jpg', 'png', 'gif', 'jp2', 'jxl', 'tiff', 'raw'];

// Introduce LRU-cache as an in-memory caching layer to reduce processing time
// Set storage upper limit for LRU cache (4 GB)
const LRU_CACHE_LIMIT_IN_GB = 4;
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
    // Cache key construction
    // Extract device_type & ua_family populated from upstream CDN layer
    const rawDeviceType = req.headers['x-client-device-type'];
    const device_type = typeof rawDeviceType === 'string' ? rawDeviceType : 'device_type';
    const rawUaFamily = req.headers['x-client-ua-family'];
    const ua_family = typeof rawUaFamily === 'string' ? rawUaFamily : 'ua_family';

    // Extract width & height & format
    const parsedW = typeof req.query.w === 'string' ? parseInt(req.query.w, 10) : NaN;
    const parsedH = typeof req.query.h === 'string' ? parseInt(req.query.h, 10) : NaN;
    const width = (!isNaN(parsedW) && parsedW > 0 && parsedW <= 4096) ? parsedW : 'none';
    const height = (!isNaN(parsedH) && parsedH > 0 && parsedH <= 4096) ? parsedH : 'none';

    // Validate requested output format
    if (typeof req.query.f === 'string') {
        const requestedF = req.query.f.toLowerCase();
        if (requestedF === 'avif') {
            res.status(400).json({
                error_message: "Error: AVIF output format is currently disabled",
                requested_format: req.query.f
            });
            return;
        }
        if (!SUPPORTED_OUTPUT_FORMATS.includes(requestedF)) {
            res.status(400).json({
                error_message: `Error: Unsupported output format '${req.query.f}'. Supported formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`,
                requested_format: req.query.f
            });
            return;
        }
    }

    // Set default image format to webp, except MSIE browser
    const rawReqF = typeof req.query.f === 'string' ? req.query.f : undefined;
    const rawHeaderAccept = typeof req.headers['x-client-accept'] === 'string' ? req.headers['x-client-accept'] : undefined;
    let rawFormat = (rawReqF || rawHeaderAccept || 'webp').toLowerCase();
    if (ua_family === 'MSIE') {
        rawFormat = 'jpg';
    }
    const format = SUPPORTED_OUTPUT_FORMATS.includes(rawFormat) ? rawFormat : 'webp';

    // Quality: 1 - 100
    let quality = typeof req.query.q === 'string' ? parseInt(req.query.q, 10) : NaN;
    if (isNaN(quality) || quality < 1 || quality > 100) {
        switch (device_type.toLowerCase()) {
            case 'desktop':
                quality = 60;
                break;
            case 'tablet':
            case 'smart_tv':
            case 'game_console':
            case 'set_top_box':
                quality = 40;
                break;
            case 'wearable':
            case 'smart_speaker':
            case 'mobile':
                quality = 20;
                break;
            default:
                quality = 40;
        }
    }

    // Gravity / Position
    const positionQuery = typeof req.query.p === 'string' ? req.query.p : '';
    let position = 'center';
    switch (positionQuery) {
        case 'top':
            position = 'top';
            break;
        case 'right_top':
            position = 'right top';
            break;
        case 'right':
            position = 'right';
            break;
        case 'right_bottom':
            position = 'right bottom';
            break;
        case 'bottom':
            position = 'bottom';
            break;
        case 'left_bottom':
            position = 'left bottom';
            break;
        case 'left':
            position = 'left';
            break;
        case 'left_top':
            position = 'left top';
            break;
        case 'center':
        case 'centre':
            position = 'center';
            break;
        default:
            position = 'center';
    }

    // Fit mode
    const fitQuery = typeof req.query.fit === 'string' ? req.query.fit : '';
    let fit = 'cover';
    switch (fitQuery) {
        case 'cover':
            fit = 'cover';
            break;
        case 'contain':
            fit = 'contain';
            break;
        case 'fill':
            fit = 'fill';
            break;
        case 'inside':
            fit = 'inside';
            break;
        case 'outside':
            fit = 'outside';
            break;
        default:
            fit = 'cover';
    }

    // Construct LRU-Cache CacheKey based on transformations
    const key = `f:${format}-q:${quality}-w:${width}-h:${height}-position:${position}-fit:${fit}:${req.baseUrl}${req.path}`;

    // LRU cache lookup
    const cachedBody = lru_cache.get(key);

    // Cache-Hit Scenario
    if (cachedBody) {
      console.log(`[lru-cache]${req.method} ${req.originalUrl}`);
      console.log(`[lru-cache]Cache hit for ${key}`);
      res.header('X-IO-Cache', 'HIT');
      res.header('X-IO-Cache-Key', `${key}`);
      if (format === 'jp2') {
          res.type('image/jp2');
      } else if (format === 'jxl') {
          res.type('image/jxl');
      } else {
          res.type(format);
      }
      res.send(cachedBody);
      return;
    } else {
      // Cache-Miss Scenario
      console.log(`[lru-cache]${req.method} ${req.originalUrl}`);
      console.log(`[lru-cache]Cache miss for ${key}`);
      const sendResponse = res.send.bind(res);
      // @ts-ignore monkey-patching send to intercept cache write
      res.send = (body) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && Buffer.isBuffer(body)) {
              lru_cache.set(key, body);
              res.header('X-IO-Cache', 'MISS');
              res.header('X-IO-Cache-Key', `${key}`);
          }
          return sendResponse(body);
      };
      next();
    }
  };
};

/**
 * Image processing function invoking Sharp with transformations
 * @param {Buffer} image - Raw image buffer
 * @param {number | undefined} width - Output width
 * @param {number | undefined} height - Output height
 * @param {keyof import('sharp').FormatEnum | string} format - Target output format
 * @param {number} quality - Quality level (1-100)
 * @param {string} [in_fit] - Fit mode ('cover', 'contain', 'fill', 'inside', 'outside')
 * @param {string} [in_position] - Crop position
 * @returns {Promise<import('sharp').Sharp>}
 */
async function processImage(image, width, height, format, quality, in_fit, in_position) {
   /** @type {import('sharp').ResizeOptions} */
   const resizeParams = {};

   if (width) {
       resizeParams.width = width;
   }

   if (height) {
       resizeParams.height = height;
   }

   if (in_fit) {
        switch (in_fit) {
            case 'cover':
                resizeParams.fit = 'cover';
                break;
            case 'contain':
                resizeParams.fit = 'contain';
                break;
            case 'fill':
                resizeParams.fit = 'fill';
                break;
            case 'inside':
                resizeParams.fit = 'inside';
                break;
            case 'outside':
                resizeParams.fit = 'outside';
                break;
            default:
                resizeParams.fit = 'cover';
        }
    }

    if (in_position) {
        switch (in_position) {
            case 'top':
                resizeParams.position = 'top';
                break;
            case 'right_top':
                resizeParams.position = 'right top';
                break;
            case 'right':
                resizeParams.position = 'right';
                break;
            case 'right_bottom':
                resizeParams.position = 'right bottom';
                break;
            case 'bottom':
                resizeParams.position = 'bottom';
                break;
            case 'left_bottom':
                resizeParams.position = 'left bottom';
                break;
            case 'left':
                resizeParams.position = 'left';
                break;
            case 'left_top':
                resizeParams.position = 'left top';
                break;
            case 'center':
            case 'centre':
                resizeParams.position = 'center';
                break;
            default:
                resizeParams.position = 'center';
        }
    }

    /** @type {import('sharp').OutputOptions | import('sharp').JpegOptions | import('sharp').WebpOptions | import('sharp').PngOptions} */
    const formatParam = {
        quality: quality
    };

    console.log(`[image optimizer]parameters: ${JSON.stringify(resizeParams)}, ${format}, ${JSON.stringify(formatParam)}`);

    return sharp(image).resize(resizeParams).toFormat(/** @type {any} */ (format), formatParam).rotate();
}

// Express web server configuration
// Only listen to /images/* path
app.get('/images/*path', cache(), async (req, res, next) => {
    try {
        // Extract User-Agent & Device Type
        const rawDeviceType = req.headers['x-client-device-type'];
        const device_type = typeof rawDeviceType === 'string' ? rawDeviceType : 'others';
        const rawUaFamily = req.headers['x-client-ua-family'];
        const ua_family = typeof rawUaFamily === 'string' ? rawUaFamily : 'others';

        // Parse image parameters from incoming query strings
        const parsedW = typeof req.query.w === 'string' ? parseInt(req.query.w, 10) : NaN;
        const parsedH = typeof req.query.h === 'string' ? parseInt(req.query.h, 10) : NaN;
        const width = (!isNaN(parsedW) && parsedW > 0 && parsedW <= 4096) ? parsedW : undefined;
        const height = (!isNaN(parsedH) && parsedH > 0 && parsedH <= 4096) ? parsedH : undefined;

        // Validate requested output format
        if (typeof req.query.f === 'string') {
            const requestedF = req.query.f.toLowerCase();
            if (requestedF === 'avif') {
                return res.status(400).json({
                    error_message: "Error: AVIF output format is currently disabled",
                    requested_format: req.query.f
                });
            }
            if (!SUPPORTED_OUTPUT_FORMATS.includes(requestedF)) {
                return res.status(400).json({
                    error_message: `Error: Unsupported output format '${req.query.f}'. Supported formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`,
                    requested_format: req.query.f
                });
            }
        }

        // Set default image format to webp, except MSIE browser
        const rawReqF = typeof req.query.f === 'string' ? req.query.f : undefined;
        const rawHeaderAccept = typeof req.headers['x-client-accept'] === 'string' ? req.headers['x-client-accept'] : undefined;
        let rawFormat = (rawReqF || rawHeaderAccept || 'webp').toLowerCase();
        if (ua_family === 'MSIE') {
            rawFormat = 'jpg';
        }
        const format = SUPPORTED_OUTPUT_FORMATS.includes(rawFormat) ? rawFormat : 'webp';

        // Quality: 1 - 100
        let quality = typeof req.query.q === 'string' ? parseInt(req.query.q, 10) : NaN;
        if (isNaN(quality) || quality < 1 || quality > 100) {
            switch (device_type.toLowerCase()) {
                case 'desktop':
                    quality = 60;
                    break;
                case 'tablet':
                case 'smart_tv':
                case 'game_console':
                case 'set_top_box':
                    quality = 40;
                    break;
                case 'wearable':
                case 'smart_speaker':
                case 'mobile':
                    quality = 20;
                    break;
                default:
                    quality = 40;
            }
        }

        const position = typeof req.query.p === 'string' ? req.query.p : undefined;
        const fit = typeof req.query.fit === 'string' ? req.query.fit : undefined;

        // Construct image url using the x-client-host header populated by WASM / CDN
        const origin_host = req.header('x-client-host') || req.header('host');
        const image_url = `${req.protocol}://${origin_host}${req.path.replace("images", "original")}`;

        // Fetch original image
        const startDownload = Date.now();
        const response = await fetch(image_url, { headers: { 'User-Agent': UA_String } });
        const response_arrayBuffer = await response.arrayBuffer();
        const response_status_code = response.status;
        const data = Buffer.from(response_arrayBuffer);
        const endDownload = Date.now();
        console.log(`[express]Image Download Time: ${endDownload - startDownload} ms`);

        // Error handling in case origin image is not available
        if (response_status_code !== 200) {
            return res.status(response_status_code).json({
                error_message: "Error: Failed to retrieve original image",
                image_origin_url: image_url,
                error_response_code: response_status_code
            });
        }

        // Validate input image format using Sharp metadata
        let metadata;
        try {
            metadata = await sharp(data).metadata();
        } catch (err) {
            return res.status(415).json({
                error_message: "Error: Input image is corrupted or unsupported format",
                image_origin_url: image_url,
                details: /** @type {Error} */ (err).message
            });
        }

        if (!metadata || !metadata.format || !SUPPORTED_INPUT_FORMATS.includes(metadata.format.toLowerCase())) {
            return res.status(415).json({
                error_message: `Error: Unsupported input image format '${metadata ? metadata.format : 'unknown'}'. Supported input formats: ${SUPPORTED_INPUT_FORMATS.join(', ')}`,
                image_origin_url: image_url,
                detected_format: metadata ? metadata.format : 'unknown'
            });
        }

        // Call Image Processing function
        const startProcess = Date.now();
        const image = await processImage(data, width, height, format, quality, fit, position);
        const buffer = await image.toBuffer();
        const endProcess = Date.now();
        console.log(`[express]Image Process Time: ${endProcess - startProcess} ms`);

        // Respond to client with correct content-type
        if (format === 'jp2') {
            res.type('image/jp2');
        } else if (format === 'jxl') {
            res.type('image/jxl');
        } else {
            res.type(format);
        }
        return res.send(buffer);
    } catch (err) {
        return next(err);
    }
});

// Block any request not matching /images/*
app.get('/*others', (_req, res) => {
    res.status(403).send("Access Denied: invalid request - not /images/*");
});

const port = parseInt(process.env.PORT || '8080', 10);
let server;
if (require.main === module) {
    server = app.listen(port, () => {
        console.log(`Image Optimizer: listening on port ${port}`);
    });
}

module.exports = {
    app,
    server,
    processImage,
    cache,
    lru_cache,
    SUPPORTED_INPUT_FORMATS,
    SUPPORTED_OUTPUT_FORMATS
};
