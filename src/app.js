const express = require('express');
const sharp = require('sharp');
const { UA_STRING, SUPPORTED_INPUT_FORMATS } = require('./config/constants');
const { cache } = require('./middlewares/cache');
const { parseImageParams } = require('./services/paramParser');
const { processImage } = require('./services/imageProcessor');

// Initialize express instance
const app = express();
app.disable('x-powered-by');

// Express web server configuration
// Only listen to /images/* path
app.get('/images/*path', cache(), async (req, res, next) => {
    try {
        // Retrieve pre-parsed parameters from cache middleware or parse fallback
        // @ts-ignore req.imageParams attached by cache middleware
        const params = req.imageParams || parseImageParams(req).params;
        const { width, height, format, quality, fit, position } = params;

        // Construct image url using the x-client-host header populated by WASM / CDN
        const originHost = req.header('x-client-host') || req.header('host');
        const imagePath = req.path.replace(/^\/images\//, '/original/');
        const imageUrl = `${req.protocol}://${originHost}${imagePath}`;

        // Fetch original image
        const startDownload = Date.now();
        const response = await fetch(imageUrl, { headers: { 'User-Agent': UA_STRING } });
        const responseArrayBuffer = await response.arrayBuffer();
        const responseStatusCode = response.status;
        const data = Buffer.from(responseArrayBuffer);
        const endDownload = Date.now();
        console.log(`[express]Image Download Time: ${endDownload - startDownload} ms`);

        // Error handling in case origin image is not available
        if (responseStatusCode !== 200) {
            return res.status(responseStatusCode).json({
                error_message: "Error: Failed to retrieve original image",
                image_origin_url: imageUrl,
                error_response_code: responseStatusCode
            });
        }

        // Validate input image format using Sharp metadata
        let metadata;
        try {
            metadata = await sharp(data).metadata();
        } catch (err) {
            return res.status(415).json({
                error_message: "Error: Input image is corrupted or unsupported format",
                image_origin_url: imageUrl,
                details: /** @type {Error} */ (err).message
            });
        }

        if (!metadata || !metadata.format || !SUPPORTED_INPUT_FORMATS.includes(metadata.format.toLowerCase())) {
            return res.status(415).json({
                error_message: `Error: Unsupported input image format '${metadata ? metadata.format : 'unknown'}'. Supported input formats: ${SUPPORTED_INPUT_FORMATS.join(', ')}`,
                image_origin_url: imageUrl,
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

module.exports = {
    app
};
