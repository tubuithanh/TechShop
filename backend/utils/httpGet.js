const https = require('https');
const zlib = require('zlib');

// Tải 1 địa chỉ HTTPS qua IPv4. Trên Render, kết nối IPv6 ra ngoài thường không đi được và fetch() mặc định
// có thể thử IPv6 trước -> lỗi UND_ERR_CONNECT_TIMEOUT (cùng lý do utils/mailer.js phải ép IPv4 cho SMTP).
// - allowHost(hostname): chỉ cho phép kết nối (và chuyển hướng) tới các máy chủ hợp lệ
// - maxRedirects: số lần đi theo chuyển hướng (0 = không đi theo)
// - maxBytes: giới hạn dung lượng tải về (tính sau giải nén)
// Trả về { status, url (sau chuyển hướng), headers, body: Buffer }.
function httpGet(url, { headers = {}, timeoutMs = 20000, maxBytes = 8 * 1024 * 1024, maxRedirects = 3, allowHost = () => true } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(Object.assign(new Error('Địa chỉ không hợp lệ'), { code: 'EINVALIDURL' }));
    }
    if (u.protocol !== 'https:' || !allowHost(u.hostname)) {
      return reject(Object.assign(new Error('Máy chủ không được phép'), { code: 'EHOSTNOTALLOWED' }));
    }
    const req = https.get(
      u,
      { family: 4, headers: { 'accept-encoding': 'gzip, deflate, br', ...headers }, timeout: timeoutMs },
      (res) => {
        const { statusCode, headers: h } = res;
        if (statusCode >= 300 && statusCode < 400 && h.location) {
          res.resume();
          if (maxRedirects <= 0) return resolve({ status: statusCode, url: u.href, headers: h, body: Buffer.alloc(0) });
          const next = new URL(h.location, u).href;
          return httpGet(next, { headers, timeoutMs, maxBytes, maxRedirects: maxRedirects - 1, allowHost }).then(resolve, reject);
        }
        let stream = res;
        const enc = String(h['content-encoding'] || '').toLowerCase();
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const chunks = [];
        let size = 0;
        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            stream.destroy();
            reject(Object.assign(new Error('Dữ liệu quá lớn'), { code: 'ETOOLARGE' }));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ status: statusCode, url: u.href, headers: h, body: Buffer.concat(chunks) }));
        stream.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('Hết thời gian chờ kết nối'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
  });
}

module.exports = { httpGet };
