require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Admin = require('../models/Admin');
const { registerUser } = require('./helpers');

// 7 sản phẩm, nhiều sản phẩm trùng giá / lượt bán / điểm để kiểm tra tiêu chí phụ _id của con trỏ
async function seedProducts() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const specs = [
    [5000000, 10, 4.5], [5000000, 10, 4.5], [7000000, 3, 5], [3000000, 10, 4],
    [7000000, 0, 0], [9000000, 25, 4.5], [5000000, 3, 4]
  ];
  for (const [i, [price, soldCount, ratingAverage]] of specs.entries()) {
    await Product.create({ title: `Máy ${i}`, slug: `may-${i}`, categoryId: category._id, price, soldCount, ratingAverage, variants: [{ color: 'Đen', price }] });
  }
  await Product.create({ title: 'Máy ngừng bán', slug: 'may-ngung-ban', categoryId: category._id, price: 1, isActive: false, variants: [{ color: 'Đen', price: 1 }] });
  return category;
}

describe('Tuần 10: trang khách hàng (danh sách, chi tiết, so sánh)', () => {
  test('TC-155: "Xem thêm" theo con trỏ đi hết danh sách, không trùng, không sót, đúng thứ tự với mọi cách sắp xếp', async () => {
    await seedProducts();
    for (const sort of ['newest', 'price_asc', 'price_desc', 'best_selling', 'top_rated']) {
      const all = (await request(app).get('/api/products').query({ sort, limit: 50 })).body.data.map((p) => p._id);
      expect(all).toHaveLength(7); // sản phẩm ngừng bán không hiện

      const seen = [];
      let cursor;
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/api/products').query({ sort, limit: 3, ...(cursor ? { cursor } : {}) });
        expect(res.body.total).toBe(7); // tổng không đổi giữa các lần "Xem thêm"
        seen.push(...res.body.data.map((p) => p._id));
        cursor = res.body.nextCursor;
        if (!cursor) break;
      }
      expect(seen).toEqual(all);
    }
  });

  test('TC-156: Lọc giá + "Xem thêm" giữ nguyên bộ lọc; con trỏ hỏng thì trả lại từ đầu', async () => {
    await seedProducts();
    const q = { sort: 'price_asc', minPrice: 5000000, maxPrice: 7000000, limit: 2 };
    const first = (await request(app).get('/api/products').query(q)).body;
    expect(first.total).toBe(5);
    const second = (await request(app).get('/api/products').query({ ...q, cursor: first.nextCursor })).body;
    const prices = [...first.data, ...second.data].map((p) => p.effectivePrice);
    expect(prices).toEqual([5000000, 5000000, 5000000, 7000000]);

    const broken = await request(app).get('/api/products').query({ ...q, cursor: 'khong-hop-le' });
    expect(broken.statusCode).toBe(200);
    expect(broken.body.data.map((p) => p._id)).toEqual(first.data.map((p) => p._id));
  });

  test('TC-157: Chi tiết sản phẩm ngừng bán / không tồn tại trả 404; so sánh cần 2 - 4 sản phẩm hợp lệ', async () => {
    await seedProducts();
    expect((await request(app).get('/api/products/may-ngung-ban')).statusCode).toBe(404);
    expect((await request(app).get('/api/products/khong-co')).statusCode).toBe(404);
    expect((await request(app).get('/api/products/may-0')).statusCode).toBe(200);

    const ids = (await request(app).get('/api/products').query({ limit: 5 })).body.data.map((p) => p._id);
    const compare = (list) => request(app).post('/api/products/compare').send({ ids: list });
    expect((await compare(ids.slice(0, 1))).statusCode).toBe(400);
    expect((await compare(ids.slice(0, 5))).statusCode).toBe(400);
    const ok = await compare(ids.slice(0, 3));
    expect(ok.statusCode).toBe(200);
    expect(ok.body.data).toHaveLength(3);
  });

  test('TC-158: Giỏ hàng chỉ dành cho khách hàng; nhân viên / admin bị từ chối ngay ở giỏ hàng', async () => {
    await seedProducts();
    await Admin.create({ name: 'Admin', email: 'admin10@example.com', password: 'abc12345', role: 'admin' });
    const adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin10@example.com', password: 'abc12345' })).body.accessToken;
    const customerToken = (await registerUser()).body.accessToken;
    const getCart = (token) => request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect((await getCart(adminToken)).statusCode).toBe(403);
    expect((await getCart(customerToken)).statusCode).toBe(200);
    expect((await request(app).get('/api/cart')).statusCode).toBe(401);
  });
});
