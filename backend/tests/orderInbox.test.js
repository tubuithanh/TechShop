// Trang Đơn hàng -> "Việc cần làm": chỉ đơn đang chờ xử lý, đúng nhóm việc, xếp theo mức gấp
require('./setup');
const request = require('supertest');
const app = require('../app');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const { ensureStoreManager, STORE_MANAGER_ACCOUNT } = require('../seed/storeManager');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const MIN = 60000;

async function setup() {
  const [a, b] = await Store.create([{ name: 'CN A' }, { name: 'CN B' }]);
  await Admin.create({ name: 'Admin', email: 'admininbox@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'admininbox@example.com', password: 'admin123' })).body.accessToken;
  await ensureStoreManager(a);
  const manager = (await request(app).post('/api/auth/login').send(STORE_MANAGER_ACCOUNT)).body.accessToken;
  const ago = (m) => new Date(Date.now() - m * MIN);
  const mk = (code, over, since) => ({
    orderCode: code, storeId: a._id, paymentMode: 'cod', status: 'pending', paymentStatus: 'pending', items: [], itemsTotal: 1, grandTotal: 1,
    statusHistory: [{ status: over.status || 'pending', changedAt: since }], createdAt: since, ...over
  });
  await Order.create([
    mk('IBCONF1', {}, ago(30)), // chờ xác nhận 30 phút (ngưỡng 60) -> chưa quá hạn
    mk('IBCONF2', {}, ago(180)), // chờ xác nhận 3 giờ -> quá hạn, gấp nhất nhóm
    mk('IBVNP', { paymentMode: 'vnpay' }, ago(500)), // online CHƯA trả tiền -> chờ khách, không phải việc của nhân viên
    mk('IBBANK', { paymentMode: 'bank_transfer' }, ago(60)), // chuyển khoản chưa xác nhận
    mk('IBREF', { status: 'cancelled', paymentStatus: 'paid', refundStatus: 'pending' }, ago(10)),
    mk('IBPREP', { status: 'confirmed' }, ago(100)),
    mk('IBRET', { status: 'returning' }, ago(10)),
    mk('IBDONE', { status: 'delivered', paymentStatus: 'paid' }, ago(1000)), // đã xong -> không hiện
    mk('IBCANCEL', { status: 'cancelled' }, ago(5)), // đã hủy, không chờ hoàn -> không hiện
    mk('IBOTHER', { storeId: b._id }, ago(400)) // chi nhánh khác
  ]);
  return { admin, manager };
}

describe('Việc cần làm (đơn hàng)', () => {
  test('INBOX-1: Chỉ đơn cần xử lý, đúng nhóm, đếm quá hạn, xếp theo mức gấp', async () => {
    const c = await setup();
    const res = await auth(request(app).get('/api/orders/admin/inbox'), c.admin);
    expect(res.statusCode).toBe(200);
    const codes = res.body.data.map((o) => o.orderCode);
    expect(codes).not.toContain('IBVNP');
    expect(codes).not.toContain('IBDONE');
    expect(codes).not.toContain('IBCANCEL');
    expect(res.body.counts).toMatchObject({
      confirm: { total: 3, overdue: 2 }, // IBCONF2 (3h) + IBOTHER (6.7h) quá hạn 60 phút
      payment: { total: 1, overdue: 0 },
      refund: { total: 1 },
      prepare: { total: 1, overdue: 0 },
      returns: { total: 1 }
    });
    // Gấp nhất trước: IBOTHER (400/60) > IBCONF2 (180/60) > ...
    expect(codes.slice(0, 2)).toEqual(['IBOTHER', 'IBCONF2']);
    const first = res.body.data[0];
    expect(first.inbox).toMatchObject({ category: 'confirm', label: 'Chờ xác nhận', overdue: true, limitMinutes: 60 });
    expect(first.inbox.waitedMinutes).toBeGreaterThanOrEqual(399);
    expect(first.storeId.name).toBe('CN B'); // đủ dữ liệu như danh sách thường

    const onlyRefund = await auth(request(app).get('/api/orders/admin/inbox?category=refund'), c.admin);
    expect(onlyRefund.body.data.map((o) => o.orderCode)).toEqual(['IBREF']);
    expect(onlyRefund.body.total).toBe(1);
  });

  test('INBOX-2: Quản lý chi nhánh chỉ thấy việc của chi nhánh mình; admin chỉnh ngưỡng quá hạn', async () => {
    const c = await setup();
    const mine = await auth(request(app).get('/api/orders/admin/inbox'), c.manager);
    expect(mine.body.data.map((o) => o.orderCode)).not.toContain('IBOTHER');
    expect(mine.body.counts.confirm.total).toBe(2);

    // Quản lý không được chỉnh ngưỡng
    expect((await auth(request(app).put('/api/orders/admin/inbox/sla'), c.manager).send({ confirm: 15 })).statusCode).toBe(403);
    expect((await auth(request(app).put('/api/orders/admin/inbox/sla'), c.admin).send({ confirm: 2 })).statusCode).toBe(400);
    expect((await auth(request(app).put('/api/orders/admin/inbox/sla'), c.admin).send({ confirm: 20 })).statusCode).toBe(200);
    const after = await auth(request(app).get('/api/orders/admin/inbox'), c.admin);
    expect(after.body.counts.confirm.overdue).toBe(3); // 30 phút giờ cũng quá ngưỡng 20 phút
    expect(after.body.categories.find((x) => x.key === 'confirm').limitMinutes).toBe(20);
  });
});
