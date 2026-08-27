const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const {
  app,
  processImage,
  lru_cache,
  SUPPORTED_INPUT_FORMATS,
  SUPPORTED_OUTPUT_FORMATS
} = require('../index.js');

describe('Image Optimizer Service Tests', () => {
  let appServer;
  let appPort;
  let originServer;
  let originPort;

  // Load sample image
  const sampleImagePath = path.join(__dirname, '../images/moo.jpg');
  const sampleImageBuffer = fs.readFileSync(sampleImagePath);

  before(async () => {
    // 1. Start mock origin server
    originServer = http.createServer((req, res) => {
      if (req.url === '/original/valid.jpg') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(sampleImageBuffer);
      } else if (req.url === '/original/corrupted.jpg') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('this is not an image');
      } else if (req.url === '/original/404.jpg') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise((resolve) => {
      originServer.listen(0, () => {
        originPort = originServer.address().port;
        resolve();
      });
    });

    // 2. Start Express app server on random port
    await new Promise((resolve) => {
      appServer = app.listen(0, () => {
        appPort = appServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (appServer) {
      await new Promise((resolve) => appServer.close(resolve));
    }
    if (originServer) {
      await new Promise((resolve) => originServer.close(resolve));
    }
  });

  describe('Unit Tests: processImage function', () => {
    it('should resize an image to specified width and height', async () => {
      const result = await processImage(sampleImageBuffer, 120, 80, 'jpeg', 80, 'cover', 'center');
      const buffer = await result.toBuffer();
      const meta = await sharp(buffer).metadata();

      assert.strictEqual(meta.width, 120);
      assert.strictEqual(meta.height, 80);
      assert.strictEqual(meta.format, 'jpeg');
    });

    it('should convert an image to WebP format', async () => {
      const result = await processImage(sampleImageBuffer, 100, undefined, 'webp', 75, 'cover', 'center');
      const buffer = await result.toBuffer();
      const meta = await sharp(buffer).metadata();

      assert.strictEqual(meta.format, 'webp');
      assert.strictEqual(meta.width, 100);
    });

    it('should convert an image to PNG format', async () => {
      const result = await processImage(sampleImageBuffer, 100, 100, 'png', 80, 'contain', 'center');
      const buffer = await result.toBuffer();
      const meta = await sharp(buffer).metadata();

      assert.strictEqual(meta.format, 'png');
      assert.strictEqual(meta.width, 100);
      assert.strictEqual(meta.height, 100);
    });

    it('should respect different fit modes (fill, inside, outside)', async () => {
      for (const fit of ['fill', 'inside', 'outside']) {
        const result = await processImage(sampleImageBuffer, 80, 80, 'webp', 60, fit, 'center');
        const buffer = await result.toBuffer();
        assert.ok(Buffer.isBuffer(buffer));
        assert.ok(buffer.length > 0);
      }
    });

    it('should respect different crop positions (top, bottom, left, right)', async () => {
      for (const pos of ['top', 'bottom', 'left', 'right', 'right_top', 'left_bottom']) {
        const result = await processImage(sampleImageBuffer, 80, 80, 'webp', 60, 'cover', pos);
        const buffer = await result.toBuffer();
        assert.ok(Buffer.isBuffer(buffer));
        assert.ok(buffer.length > 0);
      }
    });
  });

  describe('Integration Tests: Express Routes & Middleware', () => {
    it('should respond with 200 OK and status JSON on /healthz', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/healthz`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'ok');
      assert.ok(typeof json.timestamp === 'number');
    });

    it('should reject non-/images/ paths with 403 Access Denied', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/not-images/foo.jpg`);
      assert.strictEqual(res.status, 403);
      const text = await res.text();
      assert.ok(text.includes('Access Denied'));
    });

    it('should reject invalid output format ?f=bmp with 400 Bad Request', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/images/valid.jpg?f=bmp`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`
        }
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error_message.includes('Unsupported output format'));
    });

    it('should reject disabled AVIF format ?f=avif with 400 Bad Request', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/images/valid.jpg?f=avif`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`
        }
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error_message.includes('AVIF output format is currently disabled'));
    });

    it('should return error when origin image is not found (404)', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/images/404.jpg`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`
        }
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error_response_code, 404);
      assert.ok(json.error_message.includes('Failed to retrieve original image'));
    });

    it('should return 415 error when origin returns corrupted or non-image data', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/images/corrupted.jpg`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`
        }
      });
      assert.strictEqual(res.status, 415);
      const json = await res.json();
      assert.ok(json.error_message.includes('Input image is corrupted or unsupported format'));
    });

    it('should optimize image, return 200, and populate LRU cache headers', async () => {
      lru_cache.clear();

      // First Request: Cache MISS
      const res1 = await fetch(`http://127.0.0.1:${appPort}/images/valid.jpg?w=150&h=100&f=webp`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`
        }
      });

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.headers.get('content-type'), 'image/webp');
      assert.strictEqual(res1.headers.get('x-io-cache'), 'MISS');
      const buf1 = Buffer.from(await res1.arrayBuffer());
      const meta1 = await sharp(buf1).metadata();
      assert.strictEqual(meta1.width, 150);
      assert.strictEqual(meta1.height, 100);
      assert.strictEqual(meta1.format, 'webp');

      // Second Request: Cache HIT
      const res2 = await fetch(`http://127.0.0.1:${appPort}/images/valid.jpg?w=150&h=100&f=webp`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`
        }
      });

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.headers.get('x-io-cache'), 'HIT');
      const buf2 = Buffer.from(await res2.arrayBuffer());
      assert.strictEqual(buf1.length, buf2.length);
    });

    it('should override format to jpg when User-Agent is MSIE', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/images/valid.jpg?w=100&h=100`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`,
          'x-client-ua-family': 'MSIE'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'image/jpeg');
    });

    it('should adapt quality for mobile device type', async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/images/valid.jpg?w=80`, {
        headers: {
          'x-client-host': `127.0.0.1:${originPort}`,
          'x-client-device-type': 'mobile'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('x-io-cache-key').includes('q:20'));
    });
  });

  describe('Supported Formats Constants', () => {
    it('should define expected input and output formats', () => {
      assert.ok(SUPPORTED_INPUT_FORMATS.includes('jpeg'));
      assert.ok(SUPPORTED_INPUT_FORMATS.includes('png'));
      assert.ok(SUPPORTED_INPUT_FORMATS.includes('webp'));
      assert.ok(SUPPORTED_OUTPUT_FORMATS.includes('webp'));
      assert.ok(SUPPORTED_OUTPUT_FORMATS.includes('jpeg'));
      assert.ok(SUPPORTED_OUTPUT_FORMATS.includes('jxl'));
      assert.ok(SUPPORTED_OUTPUT_FORMATS.includes('jp2'));
    });
  });
});
