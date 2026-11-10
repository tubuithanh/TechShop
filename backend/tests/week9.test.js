require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Order = require('../models/Order');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(() => flushEmails());
const login = async (email, password = 'abc12345') => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;

async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy T9', slug: 'may-t9', categoryId: category._id, price: 1, warrantyMonths: 12, variants: [{ color: 'Đen', price: 1000000 }] });
  const [store1, store2] = await Store.create([{ name: 'CN 1' }, { name: 'CN 2' }]);
  const reviews = await PermissionGroup.create({ name: 'Đánh giá', permissions: ['reviews.manage'] });
  const ship = await PermissionGroup.create({ name: 'Giao hàng', permissions: ['deliveries.perform'] });
  const warranty = await PermissionGroup.create({ name: 'Bảo hành', permissions: ['warranties.manage'] });
  const dash = await PermissionGroup.create({ name: 'Thống kê', permissions: ['dashboard.view'] });
  const mk = (email, groupIds, storeId) => Admin.create({ name: email.split('@')[0], email, password: 'abc12345', role: 'staff', groupIds, storeId });
  const tech = await mk('kythuat@example.com', [warranty._id]);
  await mk('cskh9@example.com', [reviews._id]);
  await mk('ship9@example.com', [ship._id]);
  await mk('ql1@example.com', [dash._id], store1._id);
  await Admin.create({ name: 'Admin', email: 'admin9@example.com', password: 'abc12345', role: 'admin' });
  const reg = await registerUser();
  const t = {
    customer: reg.body.accessToken,
    admin: await login('admin9@example.com'),
    cskh: await login('cskh9@example.com'),
    ship: await login('ship9@example.com'),
    tech: await login('kythuat@example.com'),
    ql1: await login('ql1@example.com')
  };
  // Đơn đã giao của khách để gửi bảo hành / đánh giá
  const deliveredOrder = (storeId, qty, total, createdAt = new Date()) =>
    Order.create({
      orderCode: `T9${Math.random().toString().slice(2, 8)}`, userId: reg.body.user._id, storeId, paymentMode: 'cod', status: 'delivered', paymentStatus: 'paid',
      items: [{ productId: product._id, variantId: product.variants[0]._id, quantity: qty, unitPrice: total / qty, name: product.title }],
      itemsTotal: total, grandTotal: total, createdAt, statusHistory: [{ status: 'delivered', changedAt: new Date() }]
    });
  return { product, store1, store2, tech, t, userId: reg.body.user._id, deliveredOrder };
}

describe('Tuần 9: đánh giá, hỏi đáp, bảo hành, dashboard, nhân viên', () => {
  test('TC-149: Chỉ khách hàng đánh giá sản phẩm; nội dung và trả lời đánh giá được kiểm tra', async () => {
    const { product, t } = await setup();
    const review = (token, body) => auth(request(app).post(`/api/products/${product._id}/reviews`), token).send(body);
    expect((await review(t.admin, { rating: 5, message: 'Tuyệt' })).statusCode).toBe(403);
    expect((await review(t.cskh, { rating: 5, message: 'Tuyệt' })).statusCode).toBe(403);
    expect((await review(t.customer, { rating: 5, message: 'x'.repeat(2001) })).statusCode).toBe(400);
    expect((await auth(request(app).post('/api/products/000000000000000000000000/reviews'), t.customer).send({ rating: 4 })).statusCode).toBe(404);
    const ok = await review(t.customer, { rating: 4, message: '  Máy tốt  ' });
    expect(ok.statusCode).toBe(201);
    expect((await Product.findById(product._id)).ratingAverage).toBe(4);

    const reply = (content) => auth(request(app).post(`/api/reviews/${ok.body.data._id}/reply`), t.cskh).send({ content });
    expect((await reply('   ')).statusCode).toBe(400);
    expect((await reply('Cảm ơn bạn')).statusCode).toBe(200);
  });

  test('TC-150: Câu trả lời "Cửa hàng" cần quyền reviews.manage; khách hỏi / đáp được kiểm tra nội dung', async () => {
    const { product, t } = await setup();
    expect((await auth(request(app).post(`/api/products/${product._id}/questions`), t.cskh).send({ content: 'Hỏi?' })).statusCode).toBe(403);
    expect((await auth(request(app).post(`/api/products/${product._id}/questions`), t.customer).send({ content: '  ' })).statusCode).toBe(400);
    const q = (await auth(request(app).post(`/api/products/${product._id}/questions`), t.customer).send({ content: 'Pin dùng bao lâu?' })).body.data;
    const answer = (token) => auth(request(app).post(`/api/products/questions/${q._id}/answers`), token).send({ content: 'Khoảng 1 ngày' });

    expect((await answer(t.ship)).statusCode).toBe(403); // nhân viên giao hàng không trả lời thay cửa hàng
    const shop = await answer(t.cskh);
    expect(shop.statusCode).toBe(201);
    expect(shop.body.data.answers.at(-1).isFromShop).toBe(true);
    const fromCustomer = await answer(t.customer);
    expect(fromCustomer.body.data.answers.at(-1).isFromShop).toBe(false);
  });

  test('TC-151: Phiếu bảo hành: đúng quy trình, không mở trùng, đánh giá khi xong, người phụ trách hợp lệ', async () => {
    const { product, store1, tech, t, deliveredOrder } = await setup();
    const order = await deliveredOrder(store1._id, 1, 1000000);
    const create = () => auth(request(app).post('/api/warranties'), t.customer).send({ orderId: order._id, productId: String(product._id), issueDescription: 'Loa rè' });
    const w = (await create()).body.data;
    expect((await create()).statusCode).toBe(409); // đang có phiếu chưa xong

    const status = (s, extra = {}) => auth(request(app).put(`/api/warranties/${w._id}/status`), t.tech).send({ status: s, ...extra });
    expect((await status('done')).statusCode).toBe(400); // không nhảy cóc
    expect((await status('checking', { cost: -5 })).statusCode).toBe(400);
    expect((await status('checking', { assignedTo: String(w.userId) })).statusCode).toBe(400); // khách hàng không phụ trách được
    expect((await status('checking', { assignedTo: String(tech._id) })).statusCode).toBe(200);

    const feedback = (rating) => auth(request(app).put(`/api/warranties/${w._id}/feedback`), t.customer).send({ rating, feedback: 'ok' });
    expect((await feedback(5)).statusCode).toBe(400); // chưa xong
    expect((await status('repairing')).statusCode).toBe(200);
    expect((await status('done', { cost: 0 })).statusCode).toBe(200);
    expect((await feedback(9)).statusCode).toBe(400);
    expect((await feedback(5)).statusCode).toBe(200);
    expect((await status('returned')).statusCode).toBe(200);
    expect((await status('received')).statusCode).toBe(400); // đã trả máy thì không mở lại
    expect((await create()).statusCode).toBe(201); // phiếu cũ đã xong -> được mở phiếu mới
  });

  test('TC-152: Dashboard: doanh thu theo ngày chỉ tính đơn đã giao; "bán chạy" của quản lý theo chi nhánh; tham số được giới hạn', async () => {
    const { product, store1, store2, t, deliveredOrder, userId } = await setup();
    await deliveredOrder(store1._id, 2, 2000000);
    await deliveredOrder(store2._id, 5, 5000000);
    await Order.create({ orderCode: 'T9PEND', userId, storeId: store1._id, paymentMode: 'vnpay', status: 'pending', items: [], itemsTotal: 9000000, grandTotal: 9000000 });

    const byDay = (await auth(request(app).get('/api/dashboard/revenue-by-day?days=abc'), t.admin)).body.data;
    expect(byDay.reduce((sum, d) => sum + d.revenue, 0)).toBe(7000000); // không cộng đơn chờ thanh toán
    expect(byDay.reduce((sum, d) => sum + d.orderCount, 0)).toBe(3);
    const summary = (await auth(request(app).get('/api/dashboard/summary'), t.admin)).body.data;
    expect(summary.totalRevenue).toBe(7000000);

    const mine = (await auth(request(app).get('/api/dashboard/best-selling-products?limit=-3'), t.ql1)).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: product.title, soldCount: 2 }); // chỉ chi nhánh 1
  });

  test('TC-152b: Dashboard: doanh thu theo tháng (đủ 12 tháng) và theo chi nhánh có lọc năm/tháng', async () => {
    const { store1, store2, t, deliveredOrder } = await setup();
    await deliveredOrder(store1._id, 2, 2000000);
    await deliveredOrder(store2._id, 5, 5000000);
    // Đơn đã giao từ 3 năm trước - không được tính vào năm nay
    await Order.create({ orderCode: 'T9OLD', storeId: store1._id, paymentMode: 'cod', status: 'delivered', items: [], itemsTotal: 1000000, grandTotal: 1000000, createdAt: new Date('2023-05-10T12:00:00+07:00') });

    const year = new Date().getFullYear();
    const months = (await auth(request(app).get(`/api/dashboard/revenue-by-month?year=${year}`), t.admin)).body.data;
    expect(months).toHaveLength(12);
    expect(months.reduce((s, m) => s + m.revenue, 0)).toBe(7000000);
    const old = (await auth(request(app).get('/api/dashboard/revenue-by-month?year=2023'), t.admin)).body.data;
    expect(old[4]).toMatchObject({ month: 5, revenue: 1000000, orderCount: 1 });

    const all = (await auth(request(app).get('/api/dashboard/revenue-by-store'), t.admin)).body.data;
    expect(all.reduce((s, x) => s + x.revenue, 0)).toBe(8000000); // toàn thời gian
    const thisYear = (await auth(request(app).get(`/api/dashboard/revenue-by-store?year=${year}`), t.admin)).body.data;
    expect(thisYear.reduce((s, x) => s + x.revenue, 0)).toBe(7000000);
    const may2023 = (await auth(request(app).get('/api/dashboard/revenue-by-store?year=2023&month=5'), t.admin)).body.data;
    expect(may2023).toHaveLength(1);
    expect(may2023[0].revenue).toBe(1000000);

    // Quản lý chi nhánh 1 chỉ thấy doanh thu chi nhánh mình
    const mine = (await auth(request(app).get(`/api/dashboard/revenue-by-month?year=${year}`), t.ql1)).body.data;
    expect(mine.reduce((s, m) => s + m.revenue, 0)).toBe(2000000);
    // Khách hàng không xem được
    expect((await auth(request(app).get('/api/dashboard/revenue-by-month'), t.customer)).statusCode).toBe(403);
  });

  test('TC-152c: Trang Phân tích: so sánh cùng kỳ, khoảng giá, top khách, nhân viên, phạm vi chi nhánh', async () => {
    const { store1, store2, t, deliveredOrder, userId, product } = await setup();
    await deliveredOrder(store1._id, 2, 2000000); // đơn giá 1tr
    await deliveredOrder(store2._id, 1, 25000000); // đơn giá 25tr
    // Đơn POS do admin tạo, đã giao
    const adminId = (await auth(request(app).get('/api/auth/me'), t.admin)).body.user._id;
    await Order.create({ orderCode: 'T9POS', source: 'pos', createdBy: adminId, createdByName: 'Admin', storeId: store1._id, paymentMode: 'cash', status: 'delivered', paymentStatus: 'paid',
      items: [{ productId: product._id, quantity: 1, unitPrice: 7000000 }], itemsTotal: 7000000, grandTotal: 7000000 });
    await Order.create({ orderCode: 'T9CAN', userId, storeId: store1._id, paymentMode: 'cod', status: 'cancelled', items: [], itemsTotal: 1, grandTotal: 1 });

    const res = await auth(request(app).get('/api/dashboard/analytics'), t.admin);
    expect(res.statusCode).toBe(200);
    const d = res.body.data;
    expect(d.compare.current.revenue).toBe(34000000);
    expect(d.compare.current.orders).toBe(3);
    expect(d.compare.previous.revenue).toBe(0);
    expect(d.priceBuckets.find((b) => b.label === 'Dưới 5 triệu').quantity).toBe(2);
    expect(d.priceBuckets.find((b) => b.label === '5 - 10 triệu').quantity).toBe(1);
    expect(d.priceBuckets.find((b) => b.label === '20 - 40 triệu').quantity).toBe(1);
    expect(d.topCustomers[0]).toMatchObject({ spent: 27000000, orders: 2 });
    expect(d.staff[0]).toMatchObject({ revenue: 7000000, orders: 1 });
    expect(d.monthly.reduce((s, m) => s + m.pos, 0)).toBe(7000000);
    expect(d.customers.reduce((s, m) => s + m.newCustomers, 0)).toBe(1);
    expect(d.heatmap.reduce((s, h) => s + h.count, 0)).toBe(3);

    // Quản lý chi nhánh 1: không xem được chi nhánh 2 dù gửi storeId
    const mine = (await auth(request(app).get(`/api/dashboard/analytics?storeId=${store2._id}`), t.ql1)).body.data;
    expect(mine.compare.current.revenue).toBe(9000000);
    // Admin lọc theo chi nhánh 2
    const s2 = (await auth(request(app).get(`/api/dashboard/analytics?storeId=${store2._id}`), t.admin)).body.data;
    expect(s2.compare.current.revenue).toBe(25000000);
    // Khoảng ngày trong quá khứ -> không có doanh thu
    const old = (await auth(request(app).get('/api/dashboard/analytics?from=2020-01-01&to=2020-12-31'), t.admin)).body.data;
    expect(old.compare.current.revenue).toBe(0);
    expect((await auth(request(app).get('/api/dashboard/analytics'), t.customer)).statusCode).toBe(403);
  });

  test('TC-153: Email nhân viên không được trùng email khách hàng', async () => {
    const { t } = await setup();
    await registerUser({ email: 'trung@example.com' });
    const res = await auth(request(app).post('/api/staff'), t.admin).send({ name: 'NV', email: 'TRUNG@example.com', password: 'abc12345', role: 'staff' });
    expect(res.statusCode).toBe(409);
  });
test('TC-154: Gửi bảo hành lại nhiều lần được khi phiếu trước đã hoàn tất; đang có phiếu xử lý thì chặn dù khác lý do', async () => {
    const { product, store1, t, deliveredOrder } = await setup();
    const order = await deliveredOrder(store1._id, 1, 1000000);
    const create = (returnReason) => auth(request(app).post('/api/warranties'), t.customer)
      .send({ orderId: order._id, productId: String(product._id), issueDescription: 'Lỗi', returnReason });
    const finish = async (id) => {
      for (const s of ['checking', 'done']) await auth(request(app).put(`/api/warranties/${id}/status`), t.tech).send({ status: s });
    };
    for (let lan = 1; lan <= 3; lan++) {
      const w = await create('loi_nha_san_xuat');
      expect(w.statusCode).toBe(201);
      expect((await create('thieu_phu_kien')).statusCode).toBe(409); // khác lý do vẫn chặn khi đang xử lý
      await finish(w.body.data._id); // hoàn tất (chưa cần trả máy) là gửi lại được
    }
  });
});
