// Thống kê đánh giá cho admin: tổng quan, tiêu chí, thẻ chê, sản phẩm cần chú ý, lọc chi nhánh; danh sách lọc thẻ chê
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const Review = require('../models/Review');

const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);

test('RVS-1: Thống kê đánh giá + lọc chi nhánh + danh sách có thẻ chê', async () => {
  const admin = await Admin.create({ name: 'Admin', email: 'rvs@test.vn', password: '12345678', role: 'admin' });
  const [storeA, storeB] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const pBad = new mongoose.Types.ObjectId();
  const pGood = new mongoose.Types.ObjectId();
  const mk = async (storeId, productId, rating, extra = {}) => {
    const userId = new mongoose.Types.ObjectId();
    const order = await Order.create({ orderCode: `S-${Math.random()}`, userId, storeId, status: 'delivered', paymentMode: 'cod', items: [{ productId, quantity: 1, unitPrice: 1 }], itemsTotal: 1, grandTotal: 1 });
    return Review.create({ userId, productId, orderId: order._id, rating, ...extra });
  };
  await mk(storeA, pBad, 1, { tags: ['Giao hàng chậm'], criteria: { delivery: 1 } });
  await mk(storeA, pBad, 2, { tags: ['Thiếu phụ kiện'], criteria: { delivery: 2 }, reply: { content: 'Xin lỗi' } });
  await mk(storeB, pGood, 5, { tags: ['Đáng tiền'], criteria: { delivery: 5 }, images: ['https://example.com/a.jpg'] });
  await mk(storeB, pGood, 5);

  const get = (q = '') => request(app).get(`/api/reviews/admin/stats${q}`).set('Authorization', `Bearer ${token(admin)}`);
  const all = (await get()).body.data;
  expect(all).toMatchObject({ total: 4, average: 3.3, satisfiedRate: 50, unreplied: 3, negativeCount: 2, withImagesRate: 25 });
  expect(all.criteria.find((c) => c.key === 'delivery').average).toBeCloseTo(2.7);
  expect(all.tags.negative.map((t) => t.tag).sort()).toEqual(['Giao hàng chậm', 'Thiếu phụ kiện']);
  expect(all.worstProducts[0]).toMatchObject({ productId: String(pBad), average: 1.5, low: 2 });
  expect(all.bestProducts[0].productId).toBe(String(pGood));
  expect(all.stores).toHaveLength(2);

  const onlyB = (await get(`?storeId=${storeB}`)).body.data;
  expect(onlyB).toMatchObject({ total: 2, average: 5 });

  const neg = await request(app).get('/api/reviews/admin/all?negative=true').set('Authorization', `Bearer ${token(admin)}`);
  expect(neg.body.total).toBe(2);
  expect(neg.body.data[0].orderId.orderCode).toMatch(/^S-/);

  const customer = await request(app).get('/api/reviews/admin/stats').set('Authorization', `Bearer ${jwt.sign({ id: String(new mongoose.Types.ObjectId()), role: 'customer' }, process.env.JWT_ACCESS_SECRET)}`);
  expect([401, 403]).toContain(customer.statusCode);
});

test('RVS-2: Xếp hạng nhân viên giao hàng (cao / thấp) và đơn vị vận chuyển', async () => {
  const admin = await Admin.create({ name: 'Admin', email: 'rvs2@test.vn', password: '12345678', role: 'admin' });
  const good = await Admin.create({ name: 'Shipper Tốt', email: 'good@test.vn', password: '12345678', role: 'staff' });
  const bad = await Admin.create({ name: 'Shipper Chậm', email: 'bad@test.vn', password: '12345678', role: 'staff' });
  const mk = async (orderExtra, rating, extra = {}) => {
    const userId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const order = await Order.create({ orderCode: `D-${Math.random()}`, userId, storeId: new mongoose.Types.ObjectId(), status: 'delivered', paymentMode: 'cod', items: [{ productId, quantity: 1, unitPrice: 1 }], itemsTotal: 1, grandTotal: 1, ...orderExtra });
    return Review.create({ userId, productId, orderId: order._id, rating, ...extra });
  };
  await mk({ shipperId: good._id }, 5, { criteria: { delivery: 5 }, tags: ['Giao hàng nhanh'] });
  await mk({ shipperId: good._id }, 4); // không chấm tiêu chí -> dùng điểm chung
  await mk({ shipperId: bad._id }, 4, { criteria: { delivery: 1 }, tags: ['Giao hàng chậm'] });
  await mk({ shipment: { provider: 'GHN', environment: 'simulation', phase: 'active' } }, 3, { criteria: { delivery: 3 } });
  await mk({ shipperId: bad._id, shipment: { provider: 'GHN', environment: 'simulation', phase: 'active' } }, 5, { criteria: { delivery: 5 } }); // giao qua GHN -> tính cho GHN

  const d = (await request(app).get('/api/reviews/admin/stats').set('Authorization', `Bearer ${token(admin)}`)).body.data;
  expect(d.topShippers).toEqual([expect.objectContaining({ name: 'Shipper Tốt', score: 4.5, count: 2, praise: 1, complaints: 0 })]);
  expect(d.lowShippers).toEqual([expect.objectContaining({ name: 'Shipper Chậm', score: 1, count: 1, low: 1, complaints: 1 })]);
  expect(d.carriers).toEqual([expect.objectContaining({ name: 'Giao Hàng Nhanh (GHN) · giả lập', score: 4, count: 2 })]);
});
