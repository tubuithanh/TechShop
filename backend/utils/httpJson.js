const https = require('https');
const tls = require('tls');

// Use OS trust roots as well as Node's bundled roots (corporate Windows CA included).
// Certificate validation stays enabled. Never log headers or request bodies.
function httpJson(url, { method = 'GET', headers = {}, body, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const ca = tls.getCACertificates ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : undefined;
    const data = body === undefined ? null : JSON.stringify(body);
    const req = https.request(url, { method, ca, headers: { Accept: 'application/json', 'User-Agent': 'TechShop/1.0 (https://github.com/tubuithanh/TechShop)', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, res => {
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > 5 * 1024 * 1024) req.destroy(new Error('Response too large')); else chunks.push(c); });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(new Error('Invalid response from external service')); }
      });
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error('External service timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
module.exports = { httpJson };
