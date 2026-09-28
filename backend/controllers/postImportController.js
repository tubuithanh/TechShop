const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');
const httpClient = require('../utils/httpGet');
const { validateTinhteUrl, parseTinhteArticle, PAGE_HOST_RE } = require('../utils/tinhteImport');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const NETWORK_ERRORS = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH'];
const blockedHint =
  'Máy chủ không kết nối được tới tinhte.vn - trang nguồn có thể đang chặn truy cập từ máy chủ ở nước ngoài. ' +
  'Hãy dùng cách "Dán mã nguồn trang" bên dưới.';

// Tải trang bài viết (qua IPv4, thử lại 1 lần khi lỗi mạng). Chỉ đi theo chuyển hướng trong tinhte.vn.
async function fetchArticle(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await httpClient.httpGet(url, {
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'vi-VN,vi;q=0.9', accept: 'text/html' },
        timeoutMs: 20000,
        maxBytes: MAX_PAGE_BYTES,
        maxRedirects: 3,
        allowHost: (h) => PAGE_HOST_RE.test(h)
      });
      if (res.status === 404) throw Object.assign(new Error('Không tìm thấy bài viết (404) - kiểm tra lại link'), { status: 400 });
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw Object.assign(new Error(`tinhte.vn từ chối truy cập (HTTP ${res.status}). ${blockedHint}`), { status: 502, blocked: true });
      }
      if (res.status !== 200) throw Object.assign(new Error(`tinhte.vn trả về HTTP ${res.status}`), { status: 502 });
      return res.body.toString('utf8');
    } catch (err) {
      if (err.status) throw err;
      if (err.code === 'EHOSTNOTALLOWED') throw Object.assign(new Error('Link bị chuyển hướng ra ngoài tinhte.vn'), { status: 400 });
      if (err.code === 'ETOOLARGE') throw Object.assign(new Error('Trang quá lớn, không đọc được'), { status: 422 });
      lastErr = err;
      if (!NETWORK_ERRORS.includes(err.code)) break;
    }
  }
  throw Object.assign(new Error(`${blockedHint} (${lastErr?.code || lastErr?.message})`), { status: 502, blocked: true });
}

async function buildDraft(html, url, res) {
  const parsed = parseTinhteArticle(html, { url });
  if (parsed.error) return res.status(422).json({ message: parsed.error });
  const { data, warnings } = parsed;
  if (await Post.exists({ title: data.title })) warnings.push(`Đã có bài viết cùng tiêu đề "${data.title}" - kiểm tra để tránh trùng`);
  return res.json({
    message: `Đã lấy bài viết "${data.title}"${data.imageCount ? ` (${data.imageCount} ảnh trong bài)` : ''} - vui lòng kiểm tra lại trước khi lưu`,
    data,
    warnings
  });
}

// @route POST /api/posts/import-url { url } - máy chủ tự tải bài viết tinhte.vn. KHÔNG tạo bài: trả bản nháp cho form.
const importPostFromUrl = asyncHandler(async (req, res) => {
  const target = validateTinhteUrl(req.body.url);
  if (target.error) return res.status(400).json({ message: target.error });
  let html;
  try {
    html = await fetchArticle(target.url);
  } catch (err) {
    return res.status(err.status || 502).json({ message: err.message, blocked: Boolean(err.blocked) });
  }
  return buildDraft(html, target.url, res);
});

// @route POST /api/posts/import-html { url, html } - dự phòng khi máy chủ bị chặn: admin dán mã nguồn trang
const importPostFromHtml = asyncHandler(async (req, res) => {
  const target = validateTinhteUrl(req.body.url);
  if (target.error) return res.status(400).json({ message: target.error });
  const html = typeof req.body.html === 'string' ? req.body.html : '';
  if (html.length < 500) return res.status(400).json({ message: 'Vui lòng dán TOÀN BỘ mã nguồn trang bài viết' });
  if (Buffer.byteLength(html) > MAX_PAGE_BYTES) return res.status(413).json({ message: 'Mã nguồn quá lớn' });
  return buildDraft(html, target.url, res);
});

module.exports = { importPostFromUrl, importPostFromHtml };
