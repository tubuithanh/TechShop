// Đọc thông tin sản phẩm từ trang chi tiết thegioididong.com (dùng cho "Nhập từ link" ở trang Quản lý sản phẩm).
// Chỉ PHÂN TÍCH HTML (không gọi mạng) - việc tải trang và tải ảnh nằm ở controllers/productImportController.js.
//
// Nguồn dữ liệu trong trang:
// - JSON-LD <script type="application/ld+json"> kiểu Product: tên, thương hiệu, giá, ảnh đại diện, thông số
//   (additionalProperty - nhưng thông số nhiều giá trị chỉ ghi giá trị đầu tiên)
// - Bảng thông số HTML (<li><aside><strong>Tên:</strong></aside><aside>giá trị...</aside></li>): đầy đủ giá trị
// - Các nút chọn màu (.box03.color .box03__item): tên màu + mã màu
// - Ảnh gallery: cdn(v2).tgdd.vn/.../Products/Images/<nhóm>/<mã sp>/...
// Trang của họ có thể đổi cấu trúc bất cứ lúc nào -> mọi bước đều có dự phòng, thiếu thì bỏ qua kèm cảnh báo.

const ALLOWED_HOSTS = ['thegioididong.com', 'www.thegioididong.com'];

// Đoạn đường dẫn đầu tiên của link TGDD -> slug danh mục của TechShop
const CATEGORY_BY_PATH = {
  dtdd: 'dien-thoai',
  laptop: 'laptop',
  'may-tinh-bang': 'may-tinh-bang',
  'dong-ho-thong-minh': 'dong-ho-thong-minh',
  'dong-ho-dinh-vi-tre-em': 'dong-ho-thong-minh',
  'tai-nghe': 'tai-nghe-loa',
  'tai-nghe-bluetooth': 'tai-nghe-loa',
  'loa-laptop': 'tai-nghe-loa',
  loa: 'tai-nghe-loa',
  'man-hinh-may-tinh': 'man-hinh',
  'sac-dtdd': 'phu-kien',
  'sac-dtdd-du-phong': 'phu-kien',
  'pin-sac-du-phong': 'phu-kien',
  'cap-dien-thoai': 'phu-kien',
  'op-lung-flipcover': 'phu-kien',
  'chuot-may-tinh': 'phu-kien',
  'ban-phim': 'phu-kien',
  'phu-kien': 'phu-kien'
};

// Tên thông số của TGDD -> các khóa thông số của TechShop (utils/specTemplates.js), thử lần lượt và dùng khóa
// ĐẦU TIÊN có trong mẫu của danh mục. Không khớp khóa nào thì giữ nguyên tên của TGDD (vào "Thông số khác").
const SPEC_MAP = {
  'Độ phân giải màn hình': ['Độ phân giải'],
  'Độ phân giải': ['Độ phân giải'],
  'Độ sáng tối đa': ['Độ sáng tối đa', 'Độ sáng'],
  'Mặt kính cảm ứng': ['Kính bảo vệ', 'Chất liệu mặt'],
  'Chip xử lý (CPU)': ['Chip xử lý'],
  'Công nghệ CPU': ['Chip xử lý'],
  'Tốc độ CPU': ['Tốc độ CPU'],
  'Chip đồ họa (GPU)': ['GPU', 'Card đồ họa'],
  'Card màn hình': ['Card đồ họa', 'GPU'],
  RAM: ['RAM'],
  'Loại RAM': ['Loại RAM'],
  'Hỗ trợ RAM tối đa': ['Hỗ trợ RAM tối đa'],
  'Dung lượng lưu trữ': ['Bộ nhớ trong', 'Ổ cứng'],
  'Ổ cứng': ['Ổ cứng', 'Bộ nhớ trong'],
  'Thẻ nhớ': ['Thẻ nhớ ngoài'],
  'Độ phân giải camera sau': ['Camera sau', 'Camera'],
  'Quay phim camera sau': ['Quay video'],
  'Tính năng camera sau': ['Tính năng camera'],
  'Độ phân giải camera trước': ['Camera trước'],
  'Dung lượng pin': ['Pin', 'Thời lượng pin'],
  'Thông tin Pin': ['Pin'],
  'Thời gian sử dụng': ['Thời lượng pin', 'Pin'],
  'Thời gian sạc đầy': ['Thời gian sạc'],
  'Thời gian sạc': ['Thời gian sạc'],
  'Hỗ trợ sạc tối đa': ['Sạc nhanh', 'Công suất sạc'],
  'Công suất sạc': ['Công suất sạc', 'Sạc nhanh'],
  'Sạc không dây': ['Sạc không dây'],
  'Mạng di động': ['Mạng di động'],
  SIM: ['SIM'],
  Wifi: ['Wifi'],
  'Kết nối không dây': ['Wifi', 'Kết nối'],
  Bluetooth: ['Bluetooth', 'Kết nối'],
  'Cổng kết nối/sạc': ['Cổng sạc'],
  'Cổng sạc': ['Cổng sạc'],
  'Cổng giao tiếp': ['Cổng kết nối'],
  'Cổng kết nối': ['Cổng kết nối'],
  'Hệ điều hành': ['Hệ điều hành'],
  'Bảo mật nâng cao': ['Bảo mật'],
  'Bảo mật': ['Bảo mật'],
  'Kháng nước, bụi': ['Kháng nước'],
  'Kháng nước': ['Kháng nước'],
  'Chất liệu': ['Chất liệu', 'Chất liệu mặt'],
  'Chất liệu dây': ['Chất liệu dây/Kích thước'],
  Webcam: ['Webcam'],
  'Tấm nền': ['Tấm nền'],
  'Tần số quét': ['Tần số quét'],
  'Kích thước màn hình': ['Kích thước màn hình', 'Màn hình', 'Kích thước'],
  'Đèn bàn phím': ['Bàn phím'],
  'Độ phủ màu': ['Độ phủ màu'],
  'Thời gian phản hồi': ['Thời gian phản hồi'],
  'Công nghệ chống ồn': ['Chống ồn chủ động (ANC)'],
  'Tương thích': ['Tương thích'],
  'Tiện ích': ['Tính năng đặc biệt']
};

for (const k of Object.keys(SPEC_MAP)) SPEC_MAP[k.normalize('NFC')] = SPEC_MAP[k];

// Thông số vô nghĩa với khách hàng / trùng thông tin khác -> bỏ
const SKIP_LABELS = new Set([
  'Hãng',
  'Danh bạ',
  'Ghi âm',
  'Xem phim',
  'Nghe nhạc',
  'Dung lượng còn lại (khả dụng) khoảng',
  'Radio',
  'Jack tai nghe',
  'Thời điểm ra mắt',
  'Số nhân GPU',
  'Tốc độ Bus RAM',
  'Tản nhiệt'
]);
const EMPTY_VALUES = /^(hãng không công bố|đang cập nhật|không có thông tin|-)$/i;

// ===== Tiện ích xử lý chuỗi HTML =====
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#39);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ');
// Chuẩn hóa Unicode (NFC) - chữ có dấu có thể được mã hóa theo 2 cách, so sánh tên thông số phải khớp
const clean = (s) => decodeEntities(stripTags(s)).normalize('NFC').replace(/\s+/g, ' ').trim();

// Kiểm tra link người dùng dán vào. Trả về { url } (đã chuẩn hóa, bỏ query/hash) hoặc { error }
function validateTgddUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    return { error: 'Link không hợp lệ' };
  }
  if (!['https:', 'http:'].includes(u.protocol) || !ALLOWED_HOSTS.includes(u.hostname.toLowerCase())) {
    return { error: 'Chỉ hỗ trợ link sản phẩm của thegioididong.com' };
  }
  if (u.username || u.password || (u.port && u.port !== '443' && u.port !== '80')) return { error: 'Link không hợp lệ' };
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return { error: 'Đây không phải link trang chi tiết sản phẩm (VD: thegioididong.com/dtdd/iphone-16-pro-max)' };
  return { url: `https://www.thegioididong.com/${segments.map(encodeURIComponent).join('/')}`, pathGroup: segments[0].toLowerCase() };
}

// Các JSON-LD Product trong trang (bỏ qua khối lỗi cú pháp)
function findJsonLdProduct(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const items = (Array.isArray(data) ? data : [data]).flatMap((x) => (x && x['@graph'] ? x['@graph'] : [x]));
    const product = items.find((x) => x && (x['@type'] === 'Product' || (Array.isArray(x['@type']) && x['@type'].includes('Product'))));
    if (product) return product;
  }
  return null;
}

// Bảng thông số HTML -> [[tên, giá trị]] (giá trị nhiều mục nối bằng ", ")
function parseSpecList(html) {
  const out = [];
  const seen = new Set();
  // Tên thông số có thể nằm trong <strong> hoặc <a> (link giải thích thuật ngữ) -> lấy toàn bộ chữ của <aside> đầu
  for (const m of html.matchAll(/<li[^>]*>\s*<aside[^>]*>([\s\S]*?)<\/aside>\s*<aside[^>]*>([\s\S]*?)<\/aside>\s*<\/li>/gi)) {
    const label = clean(m[1]).replace(/:$/, '').trim();
    if (!label || seen.has(label)) continue;
    const parts = [...m[2].matchAll(/<(?:a|span)[^>]*>([\s\S]*?)<\/(?:a|span)>/gi)].map((x) => clean(x[1])).filter(Boolean);
    const value = (parts.length ? [...new Set(parts)].join(', ') : clean(m[2])).trim();
    if (!value) continue;
    seen.add(label);
    out.push([label, value]);
  }
  return out;
}

// Tách "Dài 163 mm - Ngang 77.6 mm - Dày 8.25 mm - Nặng 227 g" -> kích thước + trọng lượng
function splitSizeWeight(value) {
  const parts = value.split(/\s+-\s+/);
  const weightIdx = parts.findIndex((p) => /nặng|\b\d+([.,]\d+)?\s*(kg|g)\b/i.test(p) && !/dài|ngang|rộng|dày|cao/i.test(p));
  if (weightIdx === -1) return { size: value };
  const weight = parts[weightIdx].replace(/^nặng\s*/i, '').trim();
  const size = parts.filter((_, i) => i !== weightIdx).join(' - ');
  return { size, weight };
}

// Ghép thông số TGDD vào khóa của TechShop theo mẫu của danh mục. templateKeys: Set các khóa của danh mục.
function mapSpecifications(pairs, templateKeys) {
  const specs = {};
  const put = (key, value) => {
    const k = String(key).replace(/\./g, ',').trim(); // Map của Mongoose không cho khóa chứa dấu "."
    const v = String(value).trim();
    if (!k || !v || EMPTY_VALUES.test(v)) return;
    if (!specs[k]) specs[k] = v.slice(0, 500);
  };
  const target = (label) => (SPEC_MAP[label] || []).find((k) => templateKeys.has(k));
  const byLabel = Object.fromEntries(pairs);

  // Màn hình điện thoại/máy tính bảng: "6.9\" - Tần số quét 120 Hz" + "OLED" -> Màn hình "6.9\" OLED", Tần số quét "120 Hz"
  const wide = byLabel['Màn hình rộng'];
  if (wide) {
    const [sizePart, ...rest] = wide.split(/\s+-\s+/);
    const hz = rest.join(' ').match(/(\d+)\s*Hz/i);
    const tech = byLabel['Công nghệ màn hình'];
    if (templateKeys.has('Màn hình')) put('Màn hình', [sizePart, tech].filter(Boolean).join(' '));
    if (hz && templateKeys.has('Tần số quét')) put('Tần số quét', `${hz[1]}Hz`);
  }
  // Laptop: "Số nhân" + "Số luồng" -> "Số nhân/Số luồng"
  if (templateKeys.has('Số nhân/Số luồng') && byLabel['Số nhân']) {
    const threads = byLabel['Số luồng'];
    put('Số nhân/Số luồng', threads && !EMPTY_VALUES.test(threads) ? `${byLabel['Số nhân']} nhân / ${threads} luồng` : `${byLabel['Số nhân']} nhân`);
  }
  // NFC: "Kết nối khác" có chứa NFC
  if (templateKeys.has('NFC') && byLabel['Kết nối khác']) put('NFC', /nfc/i.test(byLabel['Kết nối khác']) ? 'Có' : 'Không');

  for (const [label, value] of pairs) {
    if (SKIP_LABELS.has(label) || ['Màn hình rộng', 'Số nhân', 'Số luồng', 'Kết nối khác'].includes(label)) continue;
    if (label === 'Công nghệ màn hình' && wide) continue; // đã gộp vào "Màn hình"
    if (/^Kích thước(, khối lượng)?$/.test(label)) {
      const { size, weight } = splitSizeWeight(value);
      put(templateKeys.has('Kích thước') ? 'Kích thước' : label, size);
      if (weight) put(templateKeys.has('Trọng lượng') ? 'Trọng lượng' : 'Trọng lượng', weight);
      continue;
    }
    if (label === 'Khối lượng' || label === 'Trọng lượng') {
      put('Trọng lượng', value);
      continue;
    }
    put(target(label) || label, value);
  }
  return specs;
}

// Tên sản phẩm: bỏ tiền tố loại hàng ("Điện thoại iPhone 16" -> "iPhone 16")
function cleanTitle(name) {
  return clean(name).replace(/^(Điện thoại|Máy tính bảng|Laptop)\s+/i, '').trim();
}

// "iPhone (Apple)" -> ["iPhone (Apple)", "Apple", "iPhone"] để so với thương hiệu đang có
function brandCandidates(raw) {
  const name = clean(Array.isArray(raw) ? raw[0] : raw?.name ? (Array.isArray(raw.name) ? raw.name[0] : raw.name) : raw);
  if (!name) return [];
  const inParens = name.match(/\(([^)]+)\)/)?.[1];
  const outside = name.replace(/\([^)]*\)/g, '').trim();
  return [...new Set([name, inParens, outside].filter(Boolean))];
}

const toNumber = (s) => {
  const n = Number(String(s ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Giá: có giá gạch ngang (box-price-old) thì đó là giá gốc, giá hiện tại là giá khuyến mãi
function parsePrices(html, product) {
  const present = toNumber(clean(html.match(/class="box-price-present[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1]));
  const old = toNumber(clean(html.match(/class="box-price-old[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1]));
  const offer = product?.offers ? toNumber(Array.isArray(product.offers) ? product.offers[0]?.price : product.offers.price ?? product.offers.lowPrice) : null;
  const current = present || offer;
  if (old && current && old > current) return { price: old, salePrice: current };
  return { price: current || old || null, salePrice: null };
}

// Các màu: [{ color, colorHex }]
function parseColors(html) {
  const block = html.match(/<div class="box03[^"]*\bcolor\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const colors = [];
  for (const m of block.matchAll(/<a[^>]*class="[^"]*box03__item[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const hex = m[1].match(/background(?:-color)?\s*:\s*(#[0-9a-f]{6})/i)?.[1];
    const color = clean(m[1]);
    if (color && !colors.some((c) => c.color === color)) colors.push({ color, colorHex: (hex || '#9ca3af').toLowerCase() });
  }
  return colors;
}

// Ảnh gallery cỡ lớn của đúng sản phẩm (theo mã sản phẩm trong đường dẫn ảnh), ảnh đại diện lên đầu
function parseImages(html, product) {
  const main = typeof product?.image === 'string' ? product.image : product?.image?.contentUrl || (Array.isArray(product?.image) ? product.image[0]?.contentUrl || product.image[0] : null);
  const sku = String(product?.sku || '').trim() || main?.match(/\/Products\/Images\/\d+\/(\d+)\//)?.[1];
  const urls = [];
  const add = (u) => {
    if (!u) return;
    let url = u.startsWith('//') ? `https:${u}` : u;
    url = url.replace(/^http:/, 'https:');
    if (!/^https:\/\/[a-z0-9.-]+\.tgdd\.vn\//i.test(url)) return;
    if (!urls.includes(url)) urls.push(url);
  };
  add(main);
  if (sku) {
    const re = new RegExp(`(?:https?:)?//cdn(?:v2)?\\.tgdd\\.vn/[^"'\\s)]*?/Products/Images/\\d+/${sku}/[^"'\\s)]+?\\.(?:jpg|jpeg|png|webp)`, 'gi');
    for (const m of html.matchAll(re)) {
      const u = m[0];
      if (/-\d+x\d+\.(jpg|jpeg|png|webp)$/i.test(u) || /\/Slider\/|thumbvideo|-thumb-/i.test(u)) continue; // ảnh nhỏ / ảnh video
      add(u);
    }
  }
  return urls;
}

// Dung lượng (phiên bản) từ tên hoặc thông số: "iPhone 16 Pro Max 256GB" -> "256GB"
function parseStorage(title, pairs) {
  const fromTitle = title.match(/(\d+\s?(?:GB|TB))(?!\s*\/)\s*$/i)?.[1] || title.match(/\b(\d+\s?(?:GB|TB))\b(?!\/)/i)?.[1];
  const fromSpec = pairs.find(([l]) => l === 'Dung lượng lưu trữ')?.[1];
  const v = fromTitle || fromSpec || '';
  return v.replace(/\s+/g, '').toUpperCase();
}

// Mô tả ngắn tự soạn từ các thông số chính (không chép nguyên văn bài viết của trang nguồn)
function buildDescription(title, specs) {
  const keys = ['Màn hình', 'Chip xử lý', 'RAM', 'Bộ nhớ trong', 'Ổ cứng', 'Card đồ họa', 'Camera sau', 'Pin', 'Thời lượng pin', 'Hệ điều hành'];
  const parts = keys.filter((k) => specs[k]).map((k) => `${k}: ${specs[k]}`);
  return parts.length ? `${title} - ${parts.join('; ')}.` : title;
}

// HTML trang chi tiết -> bản nháp sản phẩm. templateKeysFor(categorySlug) trả về Set khóa thông số của danh mục.
function parseTgddProduct(html, { pathGroup, templateKeysFor = () => new Set() } = {}) {
  const warnings = [];
  const product = findJsonLdProduct(html);
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1];
  const title = cleanTitle(product?.name || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ogTitle || '');
  if (!title) return { error: 'Không đọc được thông tin sản phẩm từ trang này (có thể không phải trang chi tiết sản phẩm)' };

  const categorySlug = CATEGORY_BY_PATH[pathGroup] || null;
  if (!categorySlug) warnings.push('Không xác định được danh mục - vui lòng chọn danh mục');
  const templateKeys = templateKeysFor(categorySlug);

  // Bảng HTML có đủ giá trị; JSON-LD bổ sung những thông số bảng HTML thiếu
  const pairs = parseSpecList(html);
  if (Array.isArray(product?.additionalProperty)) {
    const have = new Set(pairs.map(([l]) => l));
    for (const p of product.additionalProperty) {
      const label = clean(p.name).replace(/:$/, '');
      const value = clean(p.value);
      if (label && value && !have.has(label)) {
        pairs.push([label, value]);
        have.add(label);
      }
    }
  }
  if (!pairs.length) warnings.push('Không tìm thấy bảng thông số kỹ thuật');
  const specifications = mapSpecifications(pairs, templateKeys);

  const { price, salePrice } = parsePrices(html, product);
  if (!price) warnings.push('Không đọc được giá bán (sản phẩm có thể đã ngừng kinh doanh) - vui lòng nhập giá');

  const storage = ['dien-thoai', 'may-tinh-bang'].includes(categorySlug) ? parseStorage(title, pairs) : '';
  let colors = parseColors(html);
  if (!colors.length) colors = [{ color: 'Tiêu chuẩn', colorHex: '#9ca3af' }];
  const variants = colors.map((c) => ({ ...c, storage, price: price || '', salePrice: salePrice || '' }));

  const images = parseImages(html, product);
  if (!images.length) warnings.push('Không tìm thấy ảnh sản phẩm');

  return {
    data: {
      title,
      brandCandidates: brandCandidates(product?.brand),
      categorySlug,
      price,
      salePrice,
      variants,
      specifications,
      description: buildDescription(title, specifications),
      imageSources: images
    },
    warnings
  };
}

module.exports = {
  validateTgddUrl,
  parseTgddProduct,
  // xuất thêm để kiểm thử
  decodeEntities,
  mapSpecifications,
  parseSpecList,
  parseColors,
  parseImages,
  parsePrices,
  brandCandidates,
  splitSizeWeight
};
