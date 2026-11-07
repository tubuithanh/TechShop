require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const { validateTgddUrl, parseTgddProduct } = require('../utils/tgddImport');
const { SPEC_TEMPLATES } = require('../utils/specTemplates');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const keysFor = (slug) => new Set((SPEC_TEMPLATES[slug] || []).flatMap((g) => g.fields.map((f) => f.key)));

// Trang mẫu TỰ DỰNG theo cấu trúc trang chi tiết của thegioididong.com (không chứa nội dung thật của họ)
const SKU = '999001';
const PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Điện thoại Demo X 256GB giá tốt">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Điện thoại Demo X Pro 256GB",
 "image":{"@type":"ImageObject","contentUrl":"https://cdn.tgdd.vn/Products/Images/42/${SKU}/demo-x-thumb-600x600.png"},
 "sku":"${SKU}","brand":{"@type":"Brand","name":["Demo (DemoCorp)"]},
 "offers":{"@type":"Offer","priceCurrency":"VND","price":19990000},
 "additionalProperty":[{"@type":"PropertyValue","name":"Hệ điều hành","value":"Android 15"},
  {"@type":"PropertyValue","name":"RAM","value":"12 GB"}]}</script>
</head><body>
<div class="box03 color group desk">
 <a href="?code=1" class="box03__item item"><i style="background-color:#1A1A1A"></i> &#x110;en Nh&#xE1;m</a>
 <a href="?code=2" class="box03__item item act"><i style="background-color:#F5F5F0"></i> Tr&#x1EAF;ng</a>
</div>
<div class="box-price"><p class="box-price-present">17.990.000&#x20AB;</p><p class="box-price-old">19.990.000&#x20AB;</p></div>
<img src="//cdnv2.tgdd.vn/mwg-static/tgdd/Products/Images/42/${SKU}/demo-x-den-1-1111.jpg">
<img src="https://cdnv2.tgdd.vn/mwg-static/tgdd/Products/Images/42/${SKU}/demo-x-den-1-1111-180x125.jpg">
<img src="https://cdnv2.tgdd.vn/mwg-static/tgdd/Products/Images/42/${SKU}/demo-x-den-2-2222.jpg">
<img src="https://cdn.tgdd.vn/Products/Images/42/123456/san-pham-khac.jpg">
<ul class="box-specifi">
 <li><aside><a class="tzLink" href="#">Chip xử lý (CPU):</a></aside><aside><span>Snapdragon Demo</span></aside></li>
 <li><aside><strong>Dung lượng lưu trữ:</strong></aside><aside><span>256 GB</span></aside></li>
 <li><aside><strong>Quay phim camera sau:</strong></aside><aside><a href="#">4K 2160p@60fps</a><a href="#">FullHD 1080p@30fps</a></aside></li>
 <li><aside><strong>Màn hình rộng:</strong></aside><aside><span>6.8" - Tần số quét <a href="#">120 Hz</a></span></aside></li>
 <li><aside><strong>Công nghệ màn hình:</strong></aside><aside><span>AMOLED</span></aside></li>
 <li><aside><strong>Tốc độ CPU:</strong></aside><aside><span>Hãng không công bố</span></aside></li>
 <li><aside><strong>Cổng kết nối/sạc:</strong></aside><aside><span>Type-C</span></aside></li>
 <li><aside><strong>Kết nối khác:</strong></aside><aside><span>NFC</span></aside></li>
 <li><aside><strong>Kích thước, khối lượng:</strong></aside><aside><span>Dài 160 mm - Ngang 75 mm - Dày 8 mm - Nặng 200 g</span></aside></li>
 <li><aside><strong>Danh bạ:</strong></aside><aside><span>Không giới hạn</span></aside></li>
 <li><aside><strong>Hãng:</strong></aside><aside><span>Demo</span></aside></li>
</ul></body></html>`;

// Ảnh PNG 1x1 hợp lệ
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// Giả lập mạng: thay httpGet (tải qua IPv4) - test không gọi ra Internet
const httpClient = require('../utils/httpGet');
function mockNetwork({ pageStatus = 200, redirectTo, pageError } = {}) {
  return jest.spyOn(httpClient, 'httpGet').mockImplementation(async (url, opts = {}) => {
    const host = new URL(url).hostname;
    if (opts.allowHost && !opts.allowHost(host)) throw Object.assign(new Error('not allowed'), { code: 'EHOSTNOTALLOWED' });
    if (host.endsWith('thegioididong.com')) {
      if (pageError) throw Object.assign(new Error('timeout'), { code: pageError });
      if (redirectTo) {
        if (!opts.allowHost(new URL(redirectTo).hostname)) throw Object.assign(new Error('not allowed'), { code: 'EHOSTNOTALLOWED' });
      }
      return { status: pageStatus, url, headers: {}, body: Buffer.from(PAGE) };
    }
    if (url.includes('demo-x-den-2')) return { status: 200, url, headers: {}, body: Buffer.from('<html>not image</html>') }; // ảnh hỏng
    return { status: 200, url, headers: {}, body: PNG };
  });
}

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-import@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-import@example.com', password: 'admin123' })).body.accessToken;
}

afterEach(() => jest.restoreAllMocks());

describe('Nhập sản phẩm từ link thegioididong.com', () => {
  test('TC-94: Chỉ nhận link trang sản phẩm của thegioididong.com', () => {
    expect(validateTgddUrl('https://www.thegioididong.com/dtdd/demo-x?code=1#top')).toEqual({
      url: 'https://www.thegioididong.com/dtdd/demo-x',
      pathGroup: 'dtdd'
    });
    expect(validateTgddUrl('https://thegioididong.com/laptop/abc').url).toBe('https://www.thegioididong.com/laptop/abc');
    for (const bad of [
      'https://www.dienmayxanh.com/dtdd/x',
      'https://thegioididong.com.evil.com/dtdd/x',
      'http://127.0.0.1/dtdd/x',
      'https://www.thegioididong.com/',
      'https://user:pass@www.thegioididong.com/dtdd/x',
      'javascript:alert(1)',
      ''
    ]) {
      expect(validateTgddUrl(bad).error).toBeTruthy();
    }
  });

  test('TC-95: Đọc đúng tên, giá, màu, thông số (ghép vào mẫu danh mục), ảnh của đúng sản phẩm', () => {
    const { data, warnings } = parseTgddProduct(PAGE, { pathGroup: 'dtdd', templateKeysFor: keysFor });
    expect(data.title).toBe('Demo X Pro 256GB');
    expect(data.categorySlug).toBe('dien-thoai');
    expect(data.brandCandidates).toEqual(['Demo (DemoCorp)', 'DemoCorp', 'Demo']);
    expect(data.variants).toEqual([
      { color: 'Đen Nhám', colorHex: '#1a1a1a', storage: '256GB', price: 19990000, salePrice: 17990000 },
      { color: 'Trắng', colorHex: '#f5f5f0', storage: '256GB', price: 19990000, salePrice: 17990000 }
    ]);
    expect(data.specifications).toMatchObject({
      'Chip xử lý': 'Snapdragon Demo', // tên thông số nằm trong thẻ <a>
      'Bộ nhớ trong': '256 GB',
      'Quay video': '4K 2160p@60fps, FullHD 1080p@30fps', // đủ nhiều giá trị
      'Màn hình': '6.8" AMOLED',
      'Tần số quét': '120Hz',
      'Cổng sạc': 'Type-C',
      NFC: 'Có',
      'Kích thước': 'Dài 160 mm - Ngang 75 mm - Dày 8 mm',
      'Trọng lượng': '200 g',
      'Hệ điều hành': 'Android 15', // bổ sung từ JSON-LD
      RAM: '12 GB'
    });
    expect(data.specifications).not.toHaveProperty('Tốc độ CPU'); // "Hãng không công bố"
    expect(data.specifications).not.toHaveProperty('Danh bạ');
    expect(data.specifications).not.toHaveProperty('Hãng');
    expect(data.imageSources).toEqual([
      `https://cdn.tgdd.vn/Products/Images/42/${SKU}/demo-x-thumb-600x600.png`,
      `https://cdnv2.tgdd.vn/mwg-static/tgdd/Products/Images/42/${SKU}/demo-x-den-1-1111.jpg`,
      `https://cdnv2.tgdd.vn/mwg-static/tgdd/Products/Images/42/${SKU}/demo-x-den-2-2222.jpg`
    ]); // bỏ ảnh nhỏ 180x125 và ảnh của sản phẩm khác
    expect(warnings).toEqual([]);
    expect(parseTgddProduct('<html><body>Trang lỗi</body></html>', { pathGroup: 'dtdd' }).error).toBeTruthy();
  });

  test('TC-96: API trả bản nháp: ghép thương hiệu/danh mục có sẵn, tải ảnh về kho ảnh, ảnh hỏng bị bỏ qua; không tự tạo sản phẩm', async () => {
    const token = await adminToken();
    const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
    const brand = await Brand.create({ name: 'DemoCorp' });
    mockNetwork();

    const res = await auth(request(app).post('/api/products/import-url'), token).send({ url: 'https://www.thegioididong.com/dtdd/demo-x' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({
      title: 'Demo X Pro 256GB',
      brandId: String(brand._id),
      categoryId: String(category._id),
      sourceUrl: 'https://www.thegioididong.com/dtdd/demo-x'
    });
    expect(res.body.data.imageURLs).toHaveLength(2);
    res.body.data.imageURLs.forEach((u) => expect(u).toMatch(/\/uploads\/.+\.png$/)); // ảnh đã lưu vào kho ảnh của TechShop
    // Dọn ảnh vừa lưu vào backend/uploads
    const fs = require('fs');
    const path = require('path');
    const { UPLOAD_DIR } = require('../controllers/uploadController');
    res.body.data.imageURLs.forEach((u) => fs.rmSync(path.join(UPLOAD_DIR, path.basename(u)), { force: true }));
    expect(res.body.warnings.join(' ')).toMatch(/1 ảnh không tải được/);
    const Product = require('../models/Product');
    expect(await Product.countDocuments()).toBe(0);
  });

  test('TC-97: Chặn link ngoài / bị chuyển hướng ra ngoài; báo lỗi rõ khi trang nguồn từ chối; khách hàng không dùng được', async () => {
    const token = await adminToken();
    const call = (url) => auth(request(app).post('/api/products/import-url'), token).send({ url });

    expect((await call('https://example.com/dtdd/x')).statusCode).toBe(400);

    mockNetwork({ redirectTo: 'https://evil.example.com/landing' });
    expect((await call('https://www.thegioididong.com/dtdd/demo-x')).body.message).toMatch(/chuyển hướng/);
    jest.restoreAllMocks();

    mockNetwork({ pageStatus: 403 });
    const blocked = await call('https://www.thegioididong.com/dtdd/demo-x');
    expect(blocked.statusCode).toBe(502);
    expect(blocked.body.message).toMatch(/từ chối/);
    jest.restoreAllMocks();

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).post('/api/products/import-url'), customer).send({ url: 'https://www.thegioididong.com/dtdd/demo-x' })).statusCode).toBe(403);
  });

  test('TC-98: Máy chủ không kết nối được -> thử lại rồi báo gợi ý; "Dán mã nguồn trang" vẫn nhập được', async () => {
    const token = await adminToken();
    await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
    const spy = mockNetwork({ pageError: 'ETIMEDOUT' });
    const res = await auth(request(app).post('/api/products/import-url'), token).send({ url: 'https://www.thegioididong.com/dtdd/demo-x' });
    expect(res.statusCode).toBe(502);
    expect(res.body.blocked).toBe(true);
    expect(res.body.message).toMatch(/Dán mã nguồn trang/);
    expect(spy.mock.calls.filter(([u]) => u.includes('thegioididong.com'))).toHaveLength(2); // đã thử lại 1 lần

    const pasted = await auth(request(app).post('/api/products/import-html'), token).send({
      url: 'https://www.thegioididong.com/dtdd/demo-x',
      html: PAGE
    });
    expect(pasted.statusCode).toBe(200);
    expect(pasted.body.data.title).toBe('Demo X Pro 256GB');
    expect(pasted.body.data.imageURLs.length).toBeGreaterThan(0);
    const fs = require('fs');
    const path = require('path');
    const { UPLOAD_DIR } = require('../controllers/uploadController');
    pasted.body.data.imageURLs.forEach((u) => fs.rmSync(path.join(UPLOAD_DIR, path.basename(u)), { force: true }));

    // Dán thiếu / sai link
    expect((await auth(request(app).post('/api/products/import-html'), token).send({ url: 'https://www.thegioididong.com/dtdd/demo-x', html: '<html>' })).statusCode).toBe(400);
    expect((await auth(request(app).post('/api/products/import-html'), token).send({ url: 'https://evil.com/dtdd/x', html: PAGE })).statusCode).toBe(400);
  });
});
