require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Slide = require('../models/Slide');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-slide@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-slide@example.com', password: 'admin123' })).body.accessToken;
}

describe('Slide trang chủ', () => {
  test('TC-116: Lần đầu tự nạp 3 slide mặc định (giống trang chủ cũ); xóa hết không tự tạo lại', async () => {
    const token = await adminToken();
    const pub = await request(app).get('/api/slides');
    expect(pub.statusCode).toBe(200);
    expect(pub.body.data.map((s) => s.title)).toEqual(['Chào mừng đến với TechShop', 'Flash Sale giảm đến 25%', 'Trả góp 0% lãi suất']);
    expect(pub.body.data[0].bgType).toBe('theme');
    expect((await request(app).get('/api/settings')).body.data).not.toHaveProperty('homeSlidesSeeded');

    const all = (await auth(request(app).get('/api/slides/admin'), token)).body.data;
    for (const s of all) await auth(request(app).delete(`/api/slides/${s._id}`), token);
    expect((await request(app).get('/api/slides')).body.data).toEqual([]);
    expect(await Slide.countDocuments()).toBe(0);
  });

  test('TC-117: Admin thêm/sửa/đổi thứ tự; slide tắt hoặc ngoài thời gian hiển thị không hiện công khai', async () => {
    const token = await adminToken();
    await request(app).get('/api/slides'); // nạp mặc định
    const created = await auth(request(app).post('/api/slides'), token).send({
      eyebrow: '🧧 Tết 2027',
      title: 'Lì xì đầu năm',
      subtitle: 'Giảm đến 30%',
      buttonText: 'Mua ngay',
      buttonLink: '/promotions',
      bgType: 'image',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/tet.jpg'
    });
    expect(created.statusCode).toBe(201);
    const id = created.body.data._id;
    let titles = (await request(app).get('/api/slides')).body.data.map((s) => s.title);
    expect(titles[titles.length - 1]).toBe('Lì xì đầu năm'); // thêm vào cuối

    // Đưa lên đầu
    const all = (await auth(request(app).get('/api/slides/admin'), token)).body.data.map((s) => s._id);
    const order = [id, ...all.filter((x) => x !== id)];
    expect((await auth(request(app).put('/api/slides/reorder'), token).send({ ids: order })).statusCode).toBe(200);
    expect((await request(app).get('/api/slides')).body.data[0].title).toBe('Lì xì đầu năm');

    // Tắt -> ẩn; bật lại nhưng hết hạn -> ẩn; trong thời hạn -> hiện
    await auth(request(app).put(`/api/slides/${id}`), token).send({ isActive: false });
    titles = (await request(app).get('/api/slides')).body.data.map((s) => s.title);
    expect(titles).not.toContain('Lì xì đầu năm');
    const day = 86400000;
    await auth(request(app).put(`/api/slides/${id}`), token).send({ isActive: true, startAt: new Date(Date.now() - 3 * day), endAt: new Date(Date.now() - day) });
    expect((await request(app).get('/api/slides')).body.data.map((s) => s.title)).not.toContain('Lì xì đầu năm');
    await auth(request(app).put(`/api/slides/${id}`), token).send({ endAt: new Date(Date.now() + day) });
    expect((await request(app).get('/api/slides')).body.data[0].title).toBe('Lì xì đầu năm');
    // Admin vẫn thấy mọi slide
    expect((await auth(request(app).get('/api/slides/admin'), token)).body.data).toHaveLength(4);
  });

  test('TC-118: Chặn dữ liệu sai (link javascript:, thiếu tiêu đề, nền ảnh thiếu ảnh, màu sai, thời gian ngược); khách không quản lý được', async () => {
    const token = await adminToken();
    const post = (body) => auth(request(app).post('/api/slides'), token).send(body);
    expect((await post({ title: '' })).statusCode).toBe(400);
    expect((await post({ title: 'A', buttonText: 'Xem', buttonLink: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await post({ title: 'A', buttonText: 'Xem', buttonLink: '//evil.com' })).statusCode).toBe(400);
    expect((await post({ title: 'A', bgType: 'image' })).statusCode).toBe(400);
    expect((await post({ title: 'A', bgType: 'image', imageUrl: 'javascript:x' })).statusCode).toBe(400);
    expect((await post({ title: 'A', bgType: 'gradient', colorFrom: 'red' })).statusCode).toBe(400);
    expect((await post({ title: 'A', startAt: '2027-02-10', endAt: '2027-02-01' })).statusCode).toBe(400);
    expect((await auth(request(app).put('/api/slides/reorder'), token).send({ ids: ['abc'] })).statusCode).toBe(400);

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).post('/api/slides'), customer).send({ title: 'Hack' })).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/slides/admin'), customer)).statusCode).toBe(403);
  });
});
