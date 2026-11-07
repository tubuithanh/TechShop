require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Post = require('../models/Post');
const { detectImageMime } = require('../controllers/uploadController');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-sec@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-sec@example.com', password: 'admin123' })).body.accessToken;
}

describe('Bảo mật đầu vào', () => {
  test('TC-137: Có header bảo mật; toán tử MongoDB ($ne, $gt...) trong dữ liệu gửi lên bị bỏ', async () => {
    const health = await request(app).get('/api/health');
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-powered-by']).toBeUndefined();
    expect(health.headers['cross-origin-resource-policy']).toBe('cross-origin');

    await registerUser({ email: 'nan-nhan@example.com', password: 'matkhau123' });
    // Kiểu tấn công kinh điển: { "$ne": null } khớp mọi giá trị
    const injected = await request(app).post('/api/auth/login').send({ email: 'nan-nhan@example.com', password: { $ne: null } });
    expect(injected.statusCode).toBe(400);
    const injectedEmail = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: 'matkhau123' });
    expect(injectedEmail.statusCode).toBe(400);
    // Tham số query dạng ?categoryId[$ne]=x cũng bị bỏ toán tử
    const q = await request(app).get('/api/products?categoryId[$ne]=x');
    expect(q.statusCode).toBe(400); // toán tử bị bỏ -> giá trị rỗng không hợp lệ, không chạy truy vấn $ne
  });

  test('TC-138: Thêm bài viết chỉ nhận trường nội dung (không tự đặt lượt xem, bình luận)', async () => {
    const admin = await adminToken();
    const res = await auth(request(app).post('/api/posts'), admin).send({
      title: 'Bài thử', content: 'Nội dung', viewCount: 99999, comments: [{ displayName: 'Giả', message: 'bình luận giả' }]
    });
    expect(res.statusCode).toBe(201);
    const post = await Post.findById(res.body.data._id);
    expect(post.viewCount || 0).toBe(0);
    expect(post.comments).toHaveLength(0);
    expect(post.content).toBe('Nội dung');
  });

  test('TC-139: Tải ảnh: nhận diện theo nội dung tệp, tệp giả đổi đuôi .png bị từ chối', async () => {
    expect(detectImageMime(PNG)).toBe('image/png');
    expect(detectImageMime(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    const admin = await adminToken();
    const fake = await auth(request(app).post('/api/uploads'), admin)
      .attach('images', Buffer.from('<svg onload="alert(1)"></svg>      '), { filename: 'anh.png', contentType: 'image/png' });
    expect(fake.statusCode).toBe(400);
    const ok = await auth(request(app).post('/api/uploads'), admin).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(ok.statusCode).toBe(201);
  });
});
