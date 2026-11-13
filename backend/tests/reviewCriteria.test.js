// Đánh giá nhiều tiêu chí sau khi nhận hàng: điểm tiêu chí, thẻ nhận xét, ẩn danh, phân loại, tổng quan, lọc, "Hữu ích"
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const { registerUser } = require('./helpers');

const IMG = (n) => `https://example.com/rv-${n}.jpg`;

async function setup() {
  const category = await Category.create({ name: 'ĐT', slug: `dt-${Math.random()}` });
  const product = await Product.create({ title: 'Máy đánh giá', slug: `may-rv-${Math.random()}`, categoryId: category._id, price: 1, variants: [{ color: 'Đen', storage: '256GB', price: 1000000 }] });
  await Review.init();
  // Mỗi khách đã nhận hàng (đơn đã giao có phân loại Đen - 256GB)
  const buyer = async (displayName) => {
    const reg = await registerUser({ displayName });
    const token = reg.body.accessToken;
    await Order.create({
      orderCode: `RV-${Math.random()}`, userId: jwt.decode(token).id, storeId: new mongoose.Types.ObjectId(), status: 'delivered', paymentMode: 'cod',
      items: [{ productId: product._id, variantLabel: 'Đen - 256GB', name: product.title, quantity: 1, unitPrice: 1000000 }], itemsTotal: 1000000, grandTotal: 1000000
    });
    return token;
  };
  const review = (token, body) => request(app).post(`/api/products/${product._id}/reviews`).set('Authorization', `Bearer ${token}`).send(body);
  return { product, buyer, review };
}

describe('Đánh giá nhiều tiêu chí', () => {
  test('RVC-1: Lưu điểm tiêu chí, thẻ, phân loại đã mua; từ chối điểm / thẻ không hợp lệ; ẩn danh che tên', async () => {
    const c = await setup();
    const opts = (await request(app).get('/api/reviews/options')).body.data;
    expect(opts.criteria.map((x) => x.key)).toEqual(['quality', 'accuracy', 'packaging', 'delivery', 'service']);
    expect(opts.maxImages).toBe(5);

    const a = await c.buyer('Nguyễn Văn An');
    expect((await c.review(a, { rating: 5, criteria: { quality: 6 } })).statusCode).toBe(400);
    expect((await c.review(a, { rating: 5, tags: ['Tự bịa ra'] })).statusCode).toBe(400);
    expect((await c.review(a, { rating: 5, isAnonymous: 'yes' })).statusCode).toBe(400);

    const ok = await c.review(a, {
      rating: 5, message: 'Máy tốt', criteria: { quality: 5, accuracy: 5, packaging: 4, delivery: 3, service: 5 },
      tags: ['Đóng gói cẩn thận', 'Đáng tiền'], isAnonymous: true, images: [IMG(1), IMG(2)]
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.data).toMatchObject({ criteria: { quality: 5, delivery: 3 }, tags: ['Đóng gói cẩn thận', 'Đáng tiền'], variantLabel: 'Đen - 256GB', isAnonymous: true });

    const list = (await request(app).get(`/api/products/${c.product._id}/reviews`)).body;
    expect(list.data[0].displayName).toBe('N***n'); // ẩn danh
    expect(JSON.stringify(list.data[0])).not.toContain('Nguyễn Văn An');
    expect(list.data[0].helpfulBy).toBeUndefined();
  });

  test('RVC-2: Tổng quan (sao, tiêu chí, thẻ), lọc theo sao / có ảnh, sắp xếp hữu ích; bấm "Hữu ích" không tự bấm cho mình', async () => {
    const c = await setup();
    const [a, b, d] = [await c.buyer('Khách A'), await c.buyer('Khách B'), await c.buyer('Khách D')];
    const ra = (await c.review(a, { rating: 5, criteria: { quality: 5, delivery: 4 }, tags: ['Giao hàng nhanh'], images: [IMG(1)] })).body.data;
    const rb = (await c.review(b, { rating: 3, criteria: { quality: 3, delivery: 2 }, tags: ['Giao hàng chậm', 'Đúng mô tả'] })).body.data;
    await c.review(d, { rating: 4, tags: ['Giao hàng nhanh'] });

    const res = (await request(app).get(`/api/products/${c.product._id}/reviews`)).body;
    expect(res.summary).toMatchObject({ average: 4, count: 3, withImages: 1, stars: { 5: 1, 4: 1, 3: 1, 2: 0, 1: 0 } });
    const crit = Object.fromEntries(res.summary.criteria.map((x) => [x.key, x]));
    expect(crit.quality).toMatchObject({ average: 4, count: 2 });
    expect(crit.delivery).toMatchObject({ average: 3, count: 2 });
    expect(crit.packaging.average).toBeNull();
    expect(res.summary.tags[0]).toMatchObject({ tag: 'Giao hàng nhanh', count: 2, negative: false });
    expect(res.summary.tags.find((t) => t.tag === 'Giao hàng chậm').negative).toBe(true);

    expect((await request(app).get(`/api/products/${c.product._id}/reviews?star=3`)).body.data.map((r) => r._id)).toEqual([rb._id]);
    expect((await request(app).get(`/api/products/${c.product._id}/reviews?withImages=true`)).body.data.map((r) => r._id)).toEqual([ra._id]);

    const helpful = (token, id) => request(app).post(`/api/products/${c.product._id}/reviews/${id}/helpful`).set('Authorization', `Bearer ${token}`);
    expect((await helpful(b, rb._id)).statusCode).toBe(400); // không tự bấm cho mình
    expect((await helpful(a, rb._id)).body.data).toMatchObject({ helped: true, helpfulCount: 1 });
    expect((await helpful(d, rb._id)).body.data.helpfulCount).toBe(2);
    expect((await helpful(a, rb._id)).body.data).toMatchObject({ helped: false, helpfulCount: 1 }); // bấm lại = bỏ
    const top = (await request(app).get(`/api/products/${c.product._id}/reviews?sort=helpful`)).body.data;
    expect(top[0]._id).toBe(rb._id);

    // Sửa đánh giá: đổi tiêu chí / thẻ, giữ phân loại
    const edited = await request(app).put(`/api/products/${c.product._id}/reviews/${ra._id}`).set('Authorization', `Bearer ${a}`).send({ criteria: { quality: 4 }, tags: [] });
    expect(edited.body.data).toMatchObject({ criteria: { quality: 4 }, tags: [], variantLabel: 'Đen - 256GB' });
  });
});
