const { app } = require('./app');
const { DEFAULT_PORT, SUPPORTED_INPUT_FORMATS, SUPPORTED_OUTPUT_FORMATS } = require('./config/constants');
const { cache, lru_cache } = require('./middlewares/cache');
const { processImage } = require('./services/imageProcessor');
const { parseImageParams } = require('./services/paramParser');

const port = parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);
let server;

if (require.main === module) {
    server = app.listen(port, () => {
        console.log(`Image Optimizer: listening on port ${port}`);
    });

    // Graceful shutdown handling for Cloud Run and container runtimes
    const shutdown = (signal) => {
        console.log(`${signal} received: closing HTTP server gracefully...`);
        if (server) {
            server.close(() => {
                console.log('HTTP server closed.');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
    app,
    server,
    processImage,
    cache,
    lru_cache,
    parseImageParams,
    SUPPORTED_INPUT_FORMATS,
    SUPPORTED_OUTPUT_FORMATS
};
