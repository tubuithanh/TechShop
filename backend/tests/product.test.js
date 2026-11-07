require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const { registerUser } = require('./helpers');

async function seedProduct(stock = 10) {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({
    title: 'Sản phẩm test',
    slug: 'san-pham-test',
    categoryId: category._id,
    price: 1000000,
    variants: [
      { color: 'Đen', storage: '128GB', price: 1000000 },
      { color: 'Đen', storage: '256GB', price: 1200000, salePrice: 1100000 }
    ]
  });
  const store = await Store.create({ name: 'Cửa hàng test' });
  const variant = product.variants[0];
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: variant._id, stock });
  return { category, product, store, variant };
}

describe('Product API', () => {
  test('TC-08: Lấy danh sách sản phẩm trả về mảng rỗng khi chưa có dữ liệu', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  test('TC-09: Lấy danh sách sản phẩm sau khi seed dữ liệu', async () => {
    await seedProduct();
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test('TC-10: Lấy chi tiết sản phẩm theo slug', async () => {
    const { product, variant } = await seedProduct();
    const res = await request(app).get(`/api/products/${product.slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.title).toBe('Sản phẩm test');
  });

  test('TC-11: Trả về 404 khi sản phẩm không tồn tại', async () => {
    const res = await request(app).get('/api/products/khong-ton-tai');
    expect(res.statusCode).toBe(404);
  });

  test('TC-12: Không cho phép tạo sản phẩm khi chưa đăng nhập (401)', async () => {
    const res = await request(app).post('/api/products').send({ title: 'Test' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Cart API (yêu cầu đăng nhập)', () => {
  async function getAuthToken() {
    const res = await registerUser({ email: 'carttest@example.com' });
    return res.body.accessToken;
  }

  test('TC-13: Thêm sản phẩm vào giỏ hàng thành công', async () => {
    const { product, variant } = await seedProduct();
    const token = await getAuthToken();

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, variantId: variant._id, quantity: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].quantity).toBe(2);
  });

  test('TC-14: Không cho thêm vào giỏ hàng khi vượt quá tồn kho', async () => {
    const { product, variant } = await seedProduct(10); // stock = 10
    const token = await getAuthToken();

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, variantId: variant._id, quantity: 999 });

    expect(res.statusCode).toBe(400);
  });

  test('TC-15: Cập nhật số lượng = 0 sẽ xóa sản phẩm khỏi giỏ hàng', async () => {
    const { product, variant } = await seedProduct();
    const token = await getAuthToken();

    const addRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, variantId: variant._id, quantity: 1 });
    const itemId = addRes.body.data.items[0]._id;

    const updateRes = await request(app)
      .put(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 0 });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.data.items.length).toBe(0);
  });
});

describe('Phiên bản sản phẩm (màu/dung lượng)', () => {
  async function getAuthToken() {
    const res = await registerUser({ email: `variant${Date.now()}@example.com` });
    return res.body.accessToken;
  }

  test('TC-16: Giá cấp sản phẩm = phiên bản đang bán rẻ nhất', async () => {
    const { product } = await seedProduct();
    expect(product.effectivePrice).toBe(1000000);
    product.variants[0].isActive = false;
    await product.save();
    expect(product.effectivePrice).toBe(1100000); // chỉ còn phiên bản 256GB đang bán (giá KM 1.100.000)
  });

  test('TC-17: Không cho thêm vào giỏ khi không chọn phiên bản', async () => {
    const { product } = await seedProduct();
    const token = await getAuthToken();
    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${token}`).send({ productId: product._id, quantity: 1 });
    expect(res.statusCode).toBe(400);
  });

  test('TC-18: Tồn kho tính riêng theo phiên bản (phiên bản không có hàng -> 400)', async () => {
    const { product } = await seedProduct(10); // chỉ phiên bản 128GB có tồn kho
    const token = await getAuthToken();
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, variantId: product.variants[1]._id, quantity: 1 });
    expect(res.statusCode).toBe(400);
  });

  test('TC-19: Không cho tạo 2 phiên bản trùng màu + dung lượng', async () => {
    const category = await Category.create({ name: 'Laptop', slug: 'laptop' });
    await expect(
      Product.create({ title: 'X', slug: 'x', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1 }, { color: 'đen', price: 2 }] })
    ).rejects.toThrow(/trùng/);
  });

  test('TC-20: Không cho tạo sản phẩm không có phiên bản', async () => {
    await expect(Product.create({ title: 'Y', slug: 'y', price: 1 })).rejects.toThrow(/ít nhất 1 phiên bản/);
  });
});
