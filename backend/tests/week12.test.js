require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Voucher = require('../models/Voucher');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Post = require('../models/Post');
const AuditLog = require('../models/AuditLog');
const PermissionGroup = require('../models/PermissionGroup');
const { dateRange } = require('../utils/dateRange');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const DAY = 864e5;

async function setup() {
  await Admin.create({ name: 'Admin', email: 'admin12@example.com', password: 'admin123', role: 'admin' });
  const group = await PermissionGroup.create({ name: 'Nội dung', permissions: ['articles.manage', 'vouchers.view'] });
  await Admin.create({ name: 'NV', email: 'nv12@example.com', password: 'abc12345', role: 'staff', groupIds: [group._id] });
  const reg = await registerUser();
  return {
    admin: await login('admin12@example.com', 'admin123'),
    staff: await login('nv12@example.com', 'abc12345'),
    customer: reg.body.accessToken,
    userId: reg.body.user._id
  };
}
const voucher = (over = {}) => ({ code: 'SALE10', discountType: 'percent', discountValue: 10, maxDiscountAmount: 200000, endDate: new Date(Date.now() + 7 * DAY).toISOString(), ...over });

describe('Tuần 12: trang quản trị', () => {
  test('TC-168: Tạo / sửa mã giảm giá được kiểm tra; không sửa được số lượt đã dùng; trùng mã báo 409', async () => {
    const ctx = await setup();
    const create = (body, t = ctx.admin) => auth(request(app).post('/api/vouchers'), t).send(body);
    expect((await create(voucher(), ctx.staff)).statusCode).toBe(403); // chỉ xem

    const bad = [
      { discountValue: 150 }, { discountValue: -5 }, { discountValue: 0 }, { code: 'a' }, { code: 'GIẢM GIÁ' },
      { minOrderValue: -1 }, { usageLimit: 1.5 }, { discountType: 'free' },
      { startDate: new Date(Date.now() + 2 * DAY).toISOString(), endDate: new Date(Date.now() + DAY).toISOString() }
    ];
    for (const over of bad) expect((await create(voucher(over))).statusCode).toBe(400);

    const ok = await create(voucher({ code: ' sale10 ', usedCount: 999, searchTokens: ['x'] }));
    expect(ok.statusCode).toBe(201);
    expect(ok.body.data).toMatchObject({ code: 'SALE10', usedCount: 0 });
    expect((await create(voucher())).statusCode).toBe(409);

    const id = ok.body.data._id;
    await Voucher.updateOne({ _id: id }, { usedCount: 3 });
    const update = (body) => auth(request(app).put(`/api/vouchers/${id}`), ctx.admin).send(body);
    expect((await update({ usageLimit: 2 })).statusCode).toBe(400); // nhỏ hơn số đã dùng
    expect((await update({ code: 'KHAC' })).statusCode).toBe(400); // đã có đơn dùng -> không đổi tên
    const changed = await update({ discountValue: 15, usedCount: 0 });
    expect(changed.statusCode).toBe(200);
    expect(changed.body.data).toMatchObject({ discountValue: 15, usedCount: 3 });
    // Đổi sang giảm cố định thì bỏ "giảm tối đa"
    expect((await update({ discountType: 'fixed', discountValue: 50000 })).body.data.maxDiscountAmount).toBeUndefined();
  });

  test('TC-169: Mã hết lượt không hiện ở trang khuyến mãi; "Áp dụng" mã cố định không giảm quá tiền hàng', async () => {
    const ctx = await setup();
    const end = new Date(Date.now() + DAY);
    await Voucher.create([
      { code: 'CONLUOT', discountType: 'fixed', discountValue: 500000, endDate: end, usageLimit: 5, usedCount: 4 },
      { code: 'HETLUOT', discountType: 'fixed', discountValue: 50000, endDate: end, usageLimit: 5, usedCount: 5 }
    ]);
    const active = (await request(app).get('/api/vouchers/active')).body.data.map((v) => v.code);
    expect(active).toEqual(['CONLUOT']);

    const validate = (body) => auth(request(app).post('/api/vouchers/validate'), ctx.customer).send(body);
    expect((await validate({ code: 'conluot', orderValue: 300000 })).body.data.discountAmount).toBe(300000);
    expect((await validate({ code: 'CONLUOT', orderValue: 'abc' })).statusCode).toBe(400);
    expect((await validate({ orderValue: 300000 })).statusCode).toBe(400);
  });

  test('TC-170: Lọc theo ngày hiểu theo giờ Việt Nam (đơn lúc 1h sáng 07/11 thuộc ngày 07/11)', async () => {
    const ctx = await setup();
    const range = dateRange('2026-11-07', '2026-11-07');
    expect(range.$gte.toISOString()).toBe('2026-11-06T17:00:00.000Z');
    expect(range.$lte.toISOString()).toBe('2026-11-07T16:59:59.999Z');

    const store = await Store.create({ name: 'CN' });
    const at = new Date('2026-11-07T01:00:00+07:00');
    await Order.collection.insertOne({ orderCode: 'DEM1', userId: ctx.userId, storeId: store._id, status: 'pending', paymentMode: 'cod', paymentStatus: 'pending', items: [], itemsTotal: 1, grandTotal: 1, createdAt: at });
    const list = async (q) => (await auth(request(app).get('/api/orders/admin/all').query(q), ctx.admin)).body.data.map((o) => o.orderCode);
    expect(await list({ from: '2026-11-07', to: '2026-11-07' })).toEqual(['DEM1']);
    expect(await list({ to: '2026-11-06' })).toEqual([]);

    await AuditLog.create({ adminId: ctx.userId, adminName: 'A', action: 'Thử', method: 'POST', path: '/x', createdAt: at });
    const logs = (await auth(request(app).get('/api/audit-logs').query({ from: '2026-11-07', to: '2026-11-07', q: 'Thử' }), ctx.admin)).body.data;
    expect(logs).toHaveLength(1);
  });

  test('TC-171: Tin tức: bắt buộc tiêu đề; bình luận được kiểm tra, không bình luận bài chưa đăng', async () => {
    const ctx = await setup();
    expect((await auth(request(app).post('/api/posts'), ctx.staff).send({ title: '   ', content: 'x' })).statusCode).toBe(400);
    const post = (await auth(request(app).post('/api/posts'), ctx.staff).send({ title: 'Ra mắt máy mới', content: 'Nội dung', isPublished: true })).body.data;
    expect((await auth(request(app).put(`/api/posts/${post._id}`), ctx.staff).send({ title: '' })).statusCode).toBe(400);

    const comment = (id, message) => auth(request(app).post(`/api/posts/${id}/comments`), ctx.customer).send({ message });
    expect((await comment(post._id, '  ')).statusCode).toBe(400);
    expect((await comment(post._id, 'x'.repeat(1001))).statusCode).toBe(400);
    expect((await comment('khong-hop-le', 'Hay')).statusCode).toBe(404);
    expect((await comment(post._id, '  Hay quá ')).body.data.message).toBe('Hay quá');

    await Post.updateOne({ _id: post._id }, { isPublished: false });
    expect((await comment(post._id, 'Hay')).statusCode).toBe(404);
    expect((await request(app).get('/api/posts?limit=100000')).statusCode).toBe(200);
  });
});
