// Đọc bài viết từ tinhte.vn (dùng cho "Nhập từ link" ở trang Quản lý tin tức). Chỉ PHÂN TÍCH HTML, không gọi mạng.
//
// Trang bài viết của tinhte.vn là ứng dụng Next.js: dữ liệu bài nằm trong <script id="__NEXT_DATA__">
// (props.pageProps.apiData.jobs.*): thread (tiêu đề, tác giả, ảnh bìa...) và posts (bài đầu tiên = nội dung chính,
// kèm HTML và danh sách ảnh đính kèm). Dự phòng: JSON-LD DiscussionForumPosting / thẻ og:.
// Nội dung lưu dạng văn bản; ảnh giữ LINK GỐC của tinhte và chèn bằng dòng "![mô tả](https://...)" - trang chi
// tiết tin tức hiển thị các dòng này thành ảnh (không lưu HTML của nguồn -> không có nguy cơ chèn mã độc).

const PAGE_HOST_RE = /^(www\.)?tinhte\.vn$/i;
const IMAGE_HOST_RE = /(^|\.)tinhte\.vn$/i;
const MAX_IMAGES = 30;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#39);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

// Link bài viết: https://tinhte.vn/thread/<tieu-de>.<số>/
function validateTinhteUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    return { error: 'Link không hợp lệ' };
  }
  if (!['https:', 'http:'].includes(u.protocol) || !PAGE_HOST_RE.test(u.hostname)) return { error: 'Chỉ hỗ trợ link bài viết của tinhte.vn' };
  if (u.username || u.password || (u.port && !['80', '443'].includes(u.port))) return { error: 'Link không hợp lệ' };
  const m = u.pathname.match(/^\/thread\/([a-z0-9-]+\.\d+)\/?/i);
  if (!m) return { error: 'Đây không phải link bài viết (VD: tinhte.vn/thread/ten-bai-viet.1234567/)' };
  return { url: `https://tinhte.vn/thread/${m[1]}/` };
}

// Link ảnh hợp lệ (https, thuộc *.tinhte.vn). Ảnh qua imgproxy -> lấy link ảnh gốc phía sau "/plain/".
function cleanImageUrl(raw) {
  let url = decodeEntities(String(raw || '').trim());
  if (!url) return null;
  if (url.startsWith('//')) url = `https:${url}`;
  const plain = url.match(/\/plain\/(https?:\/\/.+)$/i);
  if (plain) url = decodeURIComponent(plain[1]);
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !IMAGE_HOST_RE.test(u.hostname)) return null;
    if (/\/(static|styles|emoji|smilies)\//i.test(u.pathname)) return null; // biểu tượng, emoji
    return u.href;
  } catch {
    return null;
  }
}

// HTML bài viết -> văn bản; <img> thành dòng "![](link)". usedImages: ghi lại ảnh đã chèn.
// attachmentUrls: mã ảnh đính kèm -> link ảnh cố định (photo*.tinhte.vn). Ảnh trong bài thường trỏ tới
// ".../attachments/<mã>/data&oauth_token=..." - link này HẾT HẠN sau một thời gian nên phải đổi sang link cố định.
function htmlToText(html, usedImages, attachmentUrls = new Map()) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Bỏ khối trích dẫn bài khác (quote) - không phải nội dung chính
  s = s.replace(/<div[^>]*class="[^"]*(bbCodeQuote|bdPostTree_ParentQuote)[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi, '');
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = decodeEntities(tag.match(/\b(?:data-src|data-url|src)="([^"]+)"/i)?.[1] || '');
    const attachmentId = src.match(/attachments\/(?:[^/]*\.)?(\d+)\/data/i)?.[1] || tag.match(/data-attachment-id="(\d+)"/i)?.[1];
    const url = (attachmentId && attachmentUrls.get(attachmentId)) || (/oauth_token=/i.test(src) ? null : cleanImageUrl(src));
    if (!url || usedImages.has(url)) return '';
    usedImages.add(url);
    const alt = decodeEntities(tag.match(/\balt="([^"]*)"/i)?.[1] || '').replace(/[[\]]/g, '').slice(0, 100);
    return `\n![${alt}](${url})\n`;
  });
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|blockquote|ul|ol|table|tr)>/gi, '\n\n');
  s = s.replace(/<li[^>]*>/gi, '• ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s).normalize('NFC');
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Tìm đối tượng trong JSON lồng nhau thỏa điều kiện (duyệt theo chiều rộng, giới hạn số nút)
function findDeep(root, test, limit = 20000) {
  const queue = [root];
  let seen = 0;
  while (queue.length && seen < limit) {
    const node = queue.shift();
    seen++;
    if (!node || typeof node !== 'object') continue;
    if (test(node)) return node;
    for (const v of Object.values(node)) if (v && typeof v === 'object') queue.push(v);
  }
  return null;
}

function readNextData(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function readJsonLdPosting(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const items = (Array.isArray(data) ? data : [data]).flatMap((x) => x?.['@graph'] || [x]);
      const found = items.find((x) => ['DiscussionForumPosting', 'NewsArticle', 'Article', 'BlogPosting'].includes(x?.['@type']));
      if (found) return found;
    } catch {
      /* bỏ qua khối lỗi */
    }
  }
  return null;
}

const firstParagraph = (text) =>
  (text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('![') && l.length > 40) || '')
    .slice(0, 300);

// HTML trang bài viết -> bản nháp tin tức
function parseTinhteArticle(html, { url } = {}) {
  const warnings = [];
  const next = readNextData(html);
  const thread = next && findDeep(next, (o) => typeof o.thread_title === 'string' && 'thread_id' in o);
  const firstPost = next && findDeep(next, (o) => o.post_is_first_post === true && typeof o.post_body_html === 'string');
  const ld = readJsonLdPosting(html);

  const title = decodeEntities(thread?.thread_title || ld?.headline || html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1] || '')
    .replace(/\s*\|\s*Tinh tế.*$/i, '')
    .trim();
  if (!title) return { error: 'Không đọc được bài viết từ trang này (có thể không phải trang bài viết của tinhte.vn)' };

  const used = new Set();
  const attachmentUrls = new Map(
    (firstPost?.attachments || [])
      .map((a) => [String(a?.attachment_id), cleanImageUrl(a?.links?.permalink)])
      .filter(([id, u]) => id && u)
  );
  let body = firstPost ? htmlToText(firstPost.post_body_html, used, attachmentUrls) : decodeEntities(ld?.description || '').trim();
  if (!firstPost) warnings.push('Không đọc được toàn bộ nội dung - chỉ lấy được đoạn mô tả ngắn');

  // Ảnh đính kèm chưa có trong nội dung -> thêm vào cuối bài
  const attachments = [...attachmentUrls.values()];
  const cover = cleanImageUrl(thread?.thread_image?.link || thread?.thread_thumbnail?.link || ld?.image?.url) || attachments[0] || null;
  const extra = attachments.filter((u) => !used.has(u) && u !== cover).slice(0, Math.max(0, MAX_IMAGES - used.size));
  if (extra.length) body += `\n\n${extra.map((u) => `![](${u})`).join('\n\n')}`;
  if (!cover) warnings.push('Không tìm thấy ảnh bìa - vui lòng nhập link ảnh bìa');

  if (body.length < 50) warnings.push('Nội dung bài viết rất ngắn - kiểm tra lại link');
  const author = decodeEntities(thread?.creator_username || firstPost?.poster_username || ld?.author?.name || '').trim();
  const sourceUrl = url || ld?.url || '';
  const content = `${body}\n\nNguồn: Tinhte.vn${author ? ` - ${author}` : ''}${sourceUrl ? ` (${sourceUrl})` : ''}`;

  return {
    data: {
      title: title.slice(0, 200),
      shortDescription: firstParagraph(body),
      content,
      featuredImage: cover || '',
      nameAuthor: author ? `${author} (Tinhte.vn)` : 'Tinhte.vn',
      imageCount: used.size + extra.length,
      sourceUrl
    },
    warnings
  };
}

module.exports = { validateTinhteUrl, parseTinhteArticle, htmlToText, cleanImageUrl, PAGE_HOST_RE };
