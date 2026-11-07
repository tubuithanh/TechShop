require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function seed() {
  const phone = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const laptop = await Category.create({ name: 'Laptop', slug: 'laptop' });
  const mk = (title, categoryId, price, specs, isActive = true) =>
    Product.create({ title, slug: title.toLowerCase().replace(/\s+/g, '-'), categoryId, price: 1, isActive, variants: [{ color: 'Đen', price }], specifications: specs });
  await mk('Phone A', phone._id, 3000000, { RAM: '4 GB' });
  await mk('Phone B', phone._id, 12000000, { RAM: '8 GB' });
  await mk('Phone C', phone._id, 33990000, { RAM: '12 GB' });
  await mk('Phone Ẩn', phone._id, 99000000, { RAM: '24 GB' }, false); // đang ẩn -> không tính
  await mk('Laptop X', laptop._id, 25000000, { RAM: '16 GB' });
  return { phone, laptop };
}

describe('Khoảng lọc cho thanh kéo', () => {
  test('TC-119: Trả khoảng giá và thông số thực tế theo danh mục (bỏ sản phẩm đang ẩn); lọc giá theo khoảng kéo', async () => {
    const { phone } = await seed();
    const res = await request(app).get('/api/products/filter-ranges').query({ categoryId: String(phone._id), keys: 'RAM,KhongCo' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ count: 3, price: { min: 3000000, max: 33990000 }, specs: { RAM: { min: 4, max: 12 } } });

    const all = await request(app).get('/api/products/filter-ranges');
    expect(all.body.data.price).toEqual({ min: 3000000, max: 33990000 > 25000000 ? 33990000 : 25000000 });
    expect(all.body.data.count).toBe(4);

    // Kéo giá 5 - 30 triệu -> chỉ Phone B
    const list = await request(app).get('/api/products').query({ categoryId: String(phone._id), minPrice: 5000000, maxPrice: 30000000 });
    expect(list.body.data.map((p) => p.title)).toEqual(['Phone B']);
    // Thông số RAM 8 - 16 GB
    const ram = await request(app).get('/api/products').query({ categoryId: String(phone._id), specFilters: JSON.stringify([{ key: 'RAM', min: 8, max: 16 }]) });
    expect(ram.body.data.map((p) => p.title).sort()).toEqual(['Phone B', 'Phone C']);
  });

  test('TC-120: Tham số lạ không gây lỗi (danh mục không hợp lệ, giá không phải số, không có sản phẩm)', async () => {
    await seed();
    expect((await request(app).get('/api/products/filter-ranges').query({ categoryId: 'abc', keys: '$where' })).statusCode).toBe(200);
    const empty = await request(app).get('/api/products/filter-ranges').query({ keyword: 'khongtontai' });
    expect(empty.body.data).toEqual({ count: 0, price: null, specs: {} });
    expect((await request(app).get('/api/products').query({ minPrice: 'abc', maxPrice: 'xyz' })).statusCode).toBe(200);
  });
});
