require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Post = require('../models/Post');
const httpClient = require('../utils/httpGet');
const { validateTinhteUrl, parseTinhteArticle } = require('../utils/tinhteImport');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

// Trang mẫu TỰ DỰNG theo cấu trúc trang bài viết của tinhte.vn (Next.js, __NEXT_DATA__) - không chứa nội dung thật
const PHOTO = (n) => `https://photo2.tinhte.vn/data/attachment-files/2026/09/100${n}_demo-${n}.jpg`;
const NEXT = {
  props: {
    pageProps: {
      apiData: {
        jobs: {
          abc: {
            thread: {
              thread_id: 1,
              thread_title: 'Trên tay Demo Phone X: thiết kế mới &amp; pin lớn',
              creator_username: 'demo_writer',
              thread_image: { link: PHOTO(0), width: 1200, height: 675 }
            }
          },
          def: {
            posts: [
              {
                post_id: 11,
                post_is_first_post: true,
                poster_username: 'demo_writer',
                post_body_html:
                  '<span class="xf-body-paragraph">Demo Phone X vừa ra mắt với <a href="https://tinhte.vn/tag/pin">pin</a> 6000 mAh, thiết kế nhôm nguyên khối rất chắc chắn.<br />\n<br />\n' +
                  '<img src="https://tinhte.vn/appforo/index.php?attachments/501/data&amp;oauth_token=0%2C123" alt="demo-1.jpg" /><br />\n' +
                  'Màn hình 6.7 inch &quot;siêu sáng&quot;.<br />\n' +
                  '<img src="https://tinhte.vn/static/smilies/cuoi.png" /><script>alert(1)</script>' +
                  '<div class="bbCodeQuote"><div>Trích dẫn người khác</div></div></span>',
                attachments: [
                  { attachment_id: 500, links: { permalink: PHOTO(0) } },
                  { attachment_id: 501, links: { permalink: PHOTO(1) } },
                  { attachment_id: 502, links: { permalink: PHOTO(2) } },
                  { attachment_id: 503, links: { permalink: 'https://evil.example.com/x.jpg' } }
                ]
              },
              { post_id: 12, post_is_first_post: false, post_body_html: 'Bình luận không lấy' }
            ]
          }
        }
      }
    }
  }
};
const PAGE = `<!doctype html><html><head><meta property="og:title" content="Demo | Tinh tế"></head><body>${'<div></div>'.repeat(60)}
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(NEXT).replace(/</g, '\\u003c')}</script></body></html>`;
// (Next.js mã hóa "<" thành \u003c trong __NEXT_DATA__ - làm giống để thẻ <script> trong nội dung không phá khối JSON)

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-news@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-news@example.com', password: 'admin123' })).body.accessToken;
}

afterEach(() => jest.restoreAllMocks());

describe('Nhập bài viết từ link tinhte.vn', () => {
  test('TC-101: Chỉ nhận link bài viết của tinhte.vn', () => {
    expect(validateTinhteUrl('https://tinhte.vn/thread/tren-tay-demo.123456/?utm_source=x#post-1')).toEqual({
      url: 'https://tinhte.vn/thread/tren-tay-demo.123456/'
    });
    for (const bad of ['https://tinhte.vn/', 'https://tinhte.vn.evil.com/thread/a.1/', 'https://vnexpress.net/thread/a.1/', 'javascript:alert(1)', '']) {
      expect(validateTinhteUrl(bad).error).toBeTruthy();
    }
  });

  test('TC-102: Đọc tiêu đề, tác giả, ảnh bìa, nội dung; ảnh trong bài đổi sang link cố định, bỏ mã độc/trích dẫn/emoji/ảnh ngoài tinhte', () => {
    const { data, warnings } = parseTinhteArticle(PAGE, { url: 'https://tinhte.vn/thread/tren-tay-demo.123456/' });
    expect(warnings).toEqual([]);
    expect(data.title).toBe('Trên tay Demo Phone X: thiết kế mới & pin lớn');
    expect(data.nameAuthor).toBe('demo_writer (Tinhte.vn)');
    expect(data.featuredImage).toBe(PHOTO(0));
    expect(data.shortDescription).toMatch(/^Demo Phone X vừa ra mắt với pin 6000 mAh/);
    // Ảnh trong bài: link oauth hết hạn -> link cố định; ảnh đính kèm còn lại thêm cuối bài; ảnh bìa không lặp
    const imgs = [...data.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(imgs).toEqual([PHOTO(1), PHOTO(2)]);
    expect(data.content).toContain('![demo-1.jpg](' + PHOTO(1) + ')');
    expect(data.content).toContain('Màn hình 6.7 inch "siêu sáng".');
    expect(data.content).not.toMatch(/alert|script|Trích dẫn|smilies|oauth_token|evil\.example|Bình luận không lấy|<a|<span/);
    expect(data.content).toMatch(/Nguồn: Tinhte\.vn - demo_writer \(https:\/\/tinhte\.vn\/thread\/tren-tay-demo\.123456\/\)$/);
    expect(parseTinhteArticle('<html><body>trang lỗi</body></html>').error).toBeTruthy();
  });

  test('TC-103: API trả bản nháp, không tự tạo bài; bị chặn -> gợi ý dán mã nguồn và cách này vẫn nhập được; khách hàng không dùng được', async () => {
    const token = await adminToken();
    const url = 'https://tinhte.vn/thread/tren-tay-demo.123456/';
    jest.spyOn(httpClient, 'httpGet').mockResolvedValue({ status: 200, url, headers: {}, body: Buffer.from(PAGE) });
    const ok = await auth(request(app).post('/api/posts/import-url'), token).send({ url });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.data.title).toBe('Trên tay Demo Phone X: thiết kế mới & pin lớn');
    expect(await Post.countDocuments()).toBe(0);
    jest.restoreAllMocks();

    jest.spyOn(httpClient, 'httpGet').mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    const blocked = await auth(request(app).post('/api/posts/import-url'), token).send({ url });
    expect(blocked.statusCode).toBe(502);
    expect(blocked.body.blocked).toBe(true);
    expect(blocked.body.message).toMatch(/Dán mã nguồn trang/);

    const pasted = await auth(request(app).post('/api/posts/import-html'), token).send({ url, html: PAGE });
    expect(pasted.statusCode).toBe(200);
    expect(pasted.body.data.featuredImage).toBe(PHOTO(0));
    expect((await auth(request(app).post('/api/posts/import-html'), token).send({ url, html: 'ngắn' })).statusCode).toBe(400);

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).post('/api/posts/import-url'), customer).send({ url })).statusCode).toBe(403);
  });
});
