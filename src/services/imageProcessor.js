const sharp = require('sharp');
const { resolvePosition, resolveFit } = require('./paramParser');

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
        resizeParams.fit = /** @type {keyof import('sharp').FitEnum} */ (resolveFit(in_fit));
    }

    if (in_position) {
        resizeParams.position = resolvePosition(in_position);
    }

    /** @type {import('sharp').OutputOptions | import('sharp').JpegOptions | import('sharp').WebpOptions | import('sharp').PngOptions} */
    const formatParam = {
        quality: quality
    };

    console.log(`[image optimizer]parameters: ${JSON.stringify(resizeParams)}, ${format}, ${JSON.stringify(formatParam)}`);

    return sharp(image)
        .resize(resizeParams)
        .toFormat(/** @type {any} */ (format), formatParam)
        .rotate();
}

module.exports = {
    processImage
};
