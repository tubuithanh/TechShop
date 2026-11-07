const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');
const { validateTgddUrl, parseTgddProduct } = require('../utils/tgddImport');
const { SPEC_TEMPLATES } = require('../utils/specTemplates');
const { normalizeSearch } = require('../utils/search');
const httpClient = require('../utils/httpGet');
const { storeImage } = require('./uploadController');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PAGE_HOST_RE = /^(www\.)?thegioididong\.com$/i;
const IMAGE_HOST_RE = /^[a-z0-9.-]+\.tgdd\.vn$/i;
const NETWORK_ERRORS = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'];

const blockedHint =
  'Máy chủ không kết nối được tới thegioididong.com - trang nguồn có thể đang chặn truy cập từ máy chủ ở nước ngoài. ' +
  'Hãy dùng cách "Dán mã nguồn trang" bên dưới.';

// Tải trang sản phẩm (qua IPv4, thử lại 1 lần khi lỗi mạng). Chỉ đi theo chuyển hướng trong thegioididong.com.
async function fetchPage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await httpClient.httpGet(url, {
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'vi-VN,vi;q=0.9', accept: 'text/html,application/xhtml+xml' },
        timeoutMs: 20000,
        maxBytes: MAX_PAGE_BYTES,
        maxRedirects: 3,
        allowHost: (h) => PAGE_HOST_RE.test(h)
      });
      if (res.status === 404) throw Object.assign(new Error('Không tìm thấy trang sản phẩm (404) - kiểm tra lại link'), { status: 400 });
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw Object.assign(new Error(`thegioididong.com từ chối truy cập (HTTP ${res.status}). ${blockedHint}`), { status: 502 });
      }
      if (res.status !== 200) throw Object.assign(new Error(`thegioididong.com trả về HTTP ${res.status}`), { status: 502 });
      return res.body.toString('utf8');
    } catch (err) {
      if (err.status) throw err;
      if (err.code === 'EHOSTNOTALLOWED') throw Object.assign(new Error('Link bị chuyển hướng ra ngoài thegioididong.com'), { status: 400 });
      if (err.code === 'ETOOLARGE') throw Object.assign(new Error('Trang quá lớn, không đọc được'), { status: 422 });
      lastErr = err;
      if (!NETWORK_ERRORS.includes(err.code)) break;
    }
  }
  throw Object.assign(new Error(`${blockedHint} (${lastErr?.code || lastErr?.message})`), { status: 502, blocked: true });
}

// Nhận dạng ảnh theo nội dung file (không tin phần mở rộng / content-type)
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mimetype: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimetype: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mimetype: 'image/webp', ext: 'webp' };
  if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') return { mimetype: 'image/gif', ext: 'gif' };
  return null;
}

// Tải 1 ảnh từ CDN của TGDD (*.tgdd.vn). Không đi theo chuyển hướng (tránh bị dẫn sang máy chủ khác).
async function downloadImage(url) {
  const res = await httpClient.httpGet(url, {
    headers: { 'user-agent': USER_AGENT, referer: 'https://www.thegioididong.com/' },
    timeoutMs: 15000,
    maxBytes: MAX_IMAGE_BYTES,
    maxRedirects: 0,
    allowHost: (h) => IMAGE_HOST_RE.test(h)
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const type = sniffImage(res.body);
  if (!type) throw new Error('Không phải file ảnh');
  const base = (new URL(url).pathname.split('/').pop() || 'anh').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-]/gi, '-').slice(0, 60);
  return { buffer: res.body, mimetype: type.mimetype, originalname: `${base}.${type.ext}` };
}

// Tải và lưu các ảnh (tối đa `limit`), chạy song song 4 ảnh/lượt. Ảnh lỗi thì bỏ qua.
async function importImages(sources, req, limit) {
  const picked = sources.slice(0, limit);
  const results = new Array(picked.length).fill(null);
  let failed = 0;
  for (let i = 0; i < picked.length; i += 4) {
    await Promise.all(
      picked.slice(i, i + 4).map(async (src, j) => {
        try {
          results[i + j] = await storeImage(await downloadImage(src), req, 'techshop/products');
        } catch {
          failed++;
        }
      })
    );
  }
  return { urls: results.filter(Boolean), failed };
}

async function matchBrand(candidates) {
  if (!candidates.length) return null;
  const brands = await Brand.find().select('name').lean();
  const norm = (s) => normalizeSearch(s).replace(/[^a-z0-9]/g, '');
  for (const c of candidates) {
    const found = brands.find((b) => norm(b.name) === norm(c));
    if (found) return found;
  }
  return null;
}

// HTML trang sản phẩm -> bản nháp cho form (ghép thương hiệu/danh mục, tải ảnh về kho ảnh)
async function buildDraft(html, { url, pathGroup }, req, res) {
  const templateKeysFor = (slug) => new Set((SPEC_TEMPLATES[slug] || []).flatMap((g) => g.fields.map((f) => f.key)));
  const parsed = parseTgddProduct(html, { pathGroup, templateKeysFor });
  if (parsed.error) return res.status(422).json({ message: parsed.error });
  const { data, warnings } = parsed;

  const category = data.categorySlug ? await Category.findOne({ slug: data.categorySlug }).select('_id').lean() : null;
  if (data.categorySlug && !category) warnings.push(`Chưa có danh mục phù hợp (${data.categorySlug}) - vui lòng chọn danh mục`);
  const brand = await matchBrand(data.brandCandidates);
  if (!brand && data.brandCandidates.length) {
    warnings.push(`Chưa có thương hiệu "${data.brandCandidates[0]}" trong hệ thống - vui lòng chọn thương hiệu`);
  }
  if (await Product.exists({ title: data.title })) warnings.push(`Đã có sản phẩm cùng tên "${data.title}" - kiểm tra để tránh trùng`);

  const setting = await Setting.findOne().select('maxImagesPerProduct').lean();
  const { urls, failed } = await importImages(data.imageSources, req, setting?.maxImagesPerProduct || 10);
  if (failed) warnings.push(`${failed} ảnh không tải được và đã được bỏ qua`);
  if (!urls.length && data.imageSources.length) warnings.push('Không tải được ảnh nào - vui lòng tải ảnh lên thủ công');

  return res.json({
    message: `Đã lấy thông tin "${data.title}" - vui lòng kiểm tra lại trước khi lưu`,
    data: {
      title: data.title,
      brandId: brand?._id || '',
      brandName: data.brandCandidates[0] || '',
      categoryId: category?._id || '',
      variants: data.variants,
      description: data.description,
      specifications: data.specifications,
      imageURLs: urls,
      sourceUrl: url
    },
    warnings
  });
}

// @route POST /api/products/import-url  { url } - máy chủ tự tải trang sản phẩm thegioididong.com.
// KHÔNG tạo sản phẩm: trả về bản nháp để admin xem lại / sửa trong form rồi mới lưu.
const importFromUrl = asyncHandler(async (req, res) => {
  const target = validateTgddUrl(req.body.url);
  if (target.error) return res.status(400).json({ message: target.error });
  let html;
  try {
    html = await fetchPage(target.url);
  } catch (err) {
    return res.status(err.status || 502).json({ message: err.message, blocked: Boolean(err.blocked) });
  }
  return buildDraft(html, target, req, res);
});

// @route POST /api/products/import-html  { url, html } - phương án dự phòng khi máy chủ bị trang nguồn chặn:
// admin mở trang sản phẩm trên trình duyệt của mình, copy mã nguồn trang (Ctrl+U -> Ctrl+A -> Ctrl+C) và dán vào.
const importFromHtml = asyncHandler(async (req, res) => {
  const target = validateTgddUrl(req.body.url);
  if (target.error) return res.status(400).json({ message: target.error });
  const html = typeof req.body.html === 'string' ? req.body.html : '';
  if (html.length < 500) return res.status(400).json({ message: 'Vui lòng dán TOÀN BỘ mã nguồn trang sản phẩm' });
  if (Buffer.byteLength(html) > MAX_PAGE_BYTES) return res.status(413).json({ message: 'Mã nguồn quá lớn' });
  return buildDraft(html, target, req, res);
});

module.exports = { importFromUrl, importFromHtml, sniffImage, downloadImage };
