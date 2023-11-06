const sharp = require("sharp");
const express = require('express');
const app = express();
app.disable('x-powered-by');

// set user-agent
const UA =  'ImageOptimizer/CloudRun'

// add LRU
// set built-in LRU storage
const LRU_CACHE_LIMIT_IN_GB = 4
const { LRUCache } = require('lru-cache');
const options = {
    // Cache Limit in GB
    maxSize: LRU_CACHE_LIMIT_IN_GB * 1024 * 1024 * 1024,
    sizeCalculation: (value, key) => {
        return Buffer.byteLength(value)
      }
    }
const lru_cache = new LRUCache(options)

// lru-cache funciton
var cache = () => {
  return (req, res, next) => {

    // cache key construction
    // extract device_type & ua_family
    const device_type = req.headers['x-client-device-type'] || 'device_type';
    const ua_family = req.headers['x-client-ua-family'] || 'ua_family';

    // extract width & height & format
    var width = parseInt(req.query.w) || 'none';
    var height = parseInt(req.query.h) || 'none';

    // set default image format to webp, except MSIE browser
    var format = req.query.f || req.headers['x-client-accept'] || 'webp';
    if (ua_family == 'MSIE') {format = 'jpg'};

    // selection image qualiy
    var quality = parseInt(req.query.q) || 'none';
    if (quality == 'none') {
        switch (device_type.toLowerCase()) {
            case 'desktop':
                quality = 60;
                break;
            case 'tablet':
            case 'smart_tv':
            case 'game_console':
            case 'set_top_box':   
                quality  = 40;
                break;
            case 'wearable':
            case 'smart_speaker':
            case 'mobile':
                quality  = 20;
                break;
            default:
                quality  = 40;
        }
    }

    // gravity
    // [options.gravity] string 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'center'
    var position = req.query.p;
    switch (position) {
        case 'top':
            position = 'top';
            break;
        case 'right_top':
            position  = 'right top';
            break;
        case 'right':
            position  = 'right';
            break;
        case 'right_bottom':
            position  = 'right bottom';
            break;
        case 'bottom':
            position  = 'bottom';
            break;
        case 'left_bottom':
            position  = 'left bottom';
            break;
        case 'left':
            position  = 'left';
            break;
        case 'left_top':
            position  = 'left top';
            break;
        case 'center':
            position  = 'center';
            break;
        case 'centre':
            position  = 'center';
            break;
        default:
            position  = 'center';
    }

    // fit
    // [options.fit] string 'cover', 'contain', 'fill', 'inside', 'outside'
    var fit = req.query.fit;
    switch (fit) {
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
    // Add transformation type into the cache key
    let key = `f:${format}-q:${quality}-w:${width}-h:${height}-position:${position}-fit:${fit}:${req.baseUrl}${req.path}`;

    let cachedBody = lru_cache.get(key);
    
    if (cachedBody) {
      console.log(`[lru-cache]${req.method} ${req.originalUrl}`);
      console.log(`[lru-cache]Cache hit for ${key}`);
      // add Cache-Status header
      res.header('X-IO-Cache', 'HIT');
      res.header('X-IO-Cache-Key', `${key}`);
      if (format == 'avif') {res.type('image/avif')} else if (format == 'jp2') {res.type('image/jp2')} else if (format == 'jxl') {res.type('image/jxl')} else {res.type(format)};
      res.send(cachedBody);
      return
    } else {
        console.log(`[lru-cache]${req.method} ${req.originalUrl}`);
        console.log(`[lru-cache]Cache miss for ${key}`);
        res.sendResponse = res.send;
        res.send = (body) => {
            lru_cache.set(key, body);
            // add Cache-Status header
            res.header('X-IO-Cache', 'MISS');
            res.header('X-IO-Cache-Key', `${key}`);
            res.sendResponse(body);
      }
      next();
    }
  }
}

// Image Processing function by calling sharp
async function processImage(image, width, height, format, quality, in_fit, in_position) {
   let resizeParams = {};
   let formatParam = {};

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
                resizeParams.position  = 'right top';
                break;
            case 'right':
                resizeParams.position  = 'right';
                break;
            case 'right_bottom':
                resizeParams.position  = 'right bottom';
                break;
            case 'bottom':
                resizeParams.position  = 'bottom';
                break;
            case 'left_bottom':
                resizeParams.position  = 'left bottom';
                break;
            case 'left':
                resizeParams.position  = 'left';
                break;
            case 'left_top':
                resizeParams.position  = 'left top';
                break;
            case 'center':
                resizeParams.position  = 'center';
                break;
            case 'centre':
                resizeParams.position  = 'center';
                break;
            default:
                resizeParams.position  = 'center';
        }
    }
    


   const format_out = format;

   formatParam.quality = quality;

   console.log(`[image optimizer]parameters: ${JSON.stringify(resizeParams)}, ${format_out}, ${JSON.stringify(formatParam)}`)

    return await sharp(image).resize(resizeParams).toFormat(format_out, formatParam); //.crop(sharp.gravity.center)

}

// express web server 
app.get('/images/*', cache(), async (req, res, next) => {    
    try{
        
        // extract User-Agent & Device Type
        const device_type = req.headers['x-client-device-type'] || 'others';
        const ua_family = req.headers['x-client-ua-family'] || 'others';

        // parse image parameters from incoming query strings
        const width = parseInt(req.query.w);
        const height = parseInt(req.query.h);

        // BEGIN: Transformation Settings
        // set default image format to webp, except MSIE browser
        //var format = req.query.f || 'webp'; 
        var format = req.query.f || req.headers['x-client-accept'] || 'webp';
        if (ua_family == 'MSIE') {format = 'jpg'};
        
        // selection image qualiy
        var quality = parseInt(req.query.q) || 'none';
        if (quality == 'none') {
            switch (device_type.toLowerCase()) {
                case 'desktop':
                    quality = 60;
                    break;
                case 'tablet':
                case 'smart_tv':
                case 'game_console':
                case 'set_top_box':   
                    quality  = 40;
                    break;
                case 'wearable':
                case 'smart_speaker':
                case 'mobile':
                    quality  = 20;
                    break;
                default:
                    quality  = 40;
            }
        }


        // To-do: add gravity, fit support
        // [options.fit] string 'cover', 'contain', 'fill', 'inside', 'outside'
        // [options.gravity] string 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'center'
        var position = req.query.p;
        var fit = req.query.fit;
        // END: Transformation Settings

        // construct image url
        // const image_url = `${req.protocol}://${req.header('host')}${req.path.replace("images","original")}`
        // Use the x-client-host header populated by WASM
        const origin_host = req.header('x-client-host') || req.header('host')
        const image_url = `${req.protocol}://${origin_host}${req.path.replace("images","original")}`

        // origin image fecthing
        var start = Date.now();
        const response = await fetch(image_url, {headers: {'User-Agent': 'ImageOptimizer/CloudRun'}});
        const response_arrayBuffer = await response.arrayBuffer();
        const response_status_code = await response.status;
        const data = Buffer.from(response_arrayBuffer, 'binary');
        var end = Date.now();
        console.log(`[express]Image Download Time: ${ end - start } ms`);
        // error handling in case origin images not available
        if (response_status_code != 200) { 
            res.status(response_status_code).end(`{"error_message": "Origin Error", "origin_url": "${image_url}", "origin_response_code":${response.status}}`); 
        }
        else {
            // call Image Processing function
            start = Date.now();
            const image = await processImage(data, width, height, format, quality, fit, position);
            const buffer = await image.toBuffer();
            end = Date.now();
            console.log(`[express]Image Process Time: ${ end - start } ms`);
        
            // respond to client with correct content-type
            if (format == 'avif') {res.type('image/avif')} else if (format == 'jp2') {res.type('image/jp2')} else if (format == 'jxl') {res.type('image/jxl')} else {res.type(format)};
            res.send(buffer);
        }
    } catch (err){
        next(err)
    }

});

// please comment this section before upload to Cloud Run
app.get('/original/*', async (req, res) => {
    res.sendFile(`${__dirname}${req.path.replace("original","images")}`);
});

// block any request not coming with /images/ 
app.get('/*', async (req, res) => {
    res.status(403).send("Image Optimizer only responds to path under /images/");
});

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
 console.log(`Image Optimizer: listening on port ${port}`);
});

