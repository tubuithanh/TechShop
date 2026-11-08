require('./setup');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Review = require('../models/Review');
const User = require('../models/User');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function token(role) {
  const email = `${role}-del@example.com`;
  await Admin.create({ name: role, email, password: 'admin123', role });
  return (await request(app).post('/api/auth/login').send({ email, password: 'admin123' })).body.accessToken;
}

async function seed() {
  const category = await Category.create({ name: 'Phụ kiện', slug: 'phu-kien' });
  const product = await Product.create({
    title: 'Sản phẩm tạo nhầm',
    slug: 'san-pham-tao-nham',
    categoryId: category._id,
    price: 100000,
    variants: [{ color: 'Đen', storage: '', price: 100000 }]
  });
  const store = await Store.create({ name: 'CH test' });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
  return product;
}

describe('Xóa vĩnh viễn sản phẩm', () => {
  test('Nhân viên (staff) không được xóa vĩnh viễn', async () => {
    const product = await seed();
    const t = await token('staff');
    const res = await auth(request(app).delete(`/api/products/${product._id}/permanent`), t).send({ confirm: product.title });
    expect(res.statusCode).toBe(403);
    expect(await Product.exists({ _id: product._id })).toBeTruthy();
  });

  test('Sai tên xác nhận -> 400, sản phẩm còn nguyên', async () => {
    const product = await seed();
    const t = await token('admin');
    const res = await auth(request(app).delete(`/api/products/${product._id}/permanent`), t).send({ confirm: 'sai ten' });
    expect(res.statusCode).toBe(400);
    expect(await Product.exists({ _id: product._id })).toBeTruthy();
  });

  test('Sản phẩm chưa có giao dịch -> xóa hẳn cùng tồn kho và gỡ khỏi yêu thích', async () => {
    const product = await seed();
    const user = await User.create({
      displayName: 'Khách',
      email: 'khach-del@example.com',
      phoneNumber: '0911111111',
      password: 'matkhau123',
      favoriteProductIds: [product._id]
    });
    const t = await token('admin');

    const check = await auth(request(app).get(`/api/products/${product._id}/delete-check`), t);
    expect(check.statusCode).toBe(200);
    expect(check.body.data.deletable).toBe(true);

    const res = await auth(request(app).delete(`/api/products/${product._id}/permanent`), t).send({ confirm: product.title });
    expect(res.statusCode).toBe(200);
    expect(await Product.exists({ _id: product._id })).toBeNull();
    expect(await StoreInventory.countDocuments({ productId: product._id })).toBe(0);
    expect((await User.findById(user._id)).favoriteProductIds).toHaveLength(0);
  });

  test('Sản phẩm đã có đánh giá -> 409, không xóa', async () => {
    const product = await seed();
    await Review.create({ userId: new mongoose.Types.ObjectId(), productId: product._id, rating: 5, message: 'Tốt' });
    const t = await token('admin');

    const check = await auth(request(app).get(`/api/products/${product._id}/delete-check`), t);
    expect(check.body.data).toMatchObject({ deletable: false, reviews: 1 });

    const res = await auth(request(app).delete(`/api/products/${product._id}/permanent`), t).send({ confirm: product.title });
    expect(res.statusCode).toBe(409);
    expect(await Product.exists({ _id: product._id })).toBeTruthy();
    expect(await StoreInventory.countDocuments({ productId: product._id })).toBe(1);
  });
});
