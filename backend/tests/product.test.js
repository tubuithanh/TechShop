require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function seedProduct() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({
    name: 'Sản phẩm test',
    slug: 'san-pham-test',
    brand: 'TestBrand',
    category: category._id,
    basePrice: 1000000,
    stock: 10,
    images: []
  });
  return { category, product };
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
    const { product } = await seedProduct();
    const res = await request(app).get(`/api/products/${product.slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Sản phẩm test');
  });

  test('TC-11: Trả về 404 khi sản phẩm không tồn tại', async () => {
    const res = await request(app).get('/api/products/khong-ton-tai');
    expect(res.statusCode).toBe(404);
  });

  test('TC-12: Không cho phép tạo sản phẩm khi chưa đăng nhập (401)', async () => {
    const res = await request(app).post('/api/products').send({ name: 'Test' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Cart API (yêu cầu đăng nhập)', () => {
  async function getAuthToken() {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Cart Tester',
      email: 'carttest@example.com',
      password: '123456'
    });
    return res.body.accessToken;
  }

  test('TC-13: Thêm sản phẩm vào giỏ hàng thành công', async () => {
    const { product } = await seedProduct();
    const token = await getAuthToken();

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, quantity: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].quantity).toBe(2);
  });

  test('TC-14: Không cho thêm vào giỏ hàng khi vượt quá tồn kho', async () => {
    const { product } = await seedProduct(); // stock = 10
    const token = await getAuthToken();

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, quantity: 999 });

    expect(res.statusCode).toBe(400);
  });

  test('TC-15: Cập nhật số lượng = 0 sẽ xóa sản phẩm khỏi giỏ hàng', async () => {
    const { product } = await seedProduct();
    const token = await getAuthToken();

    const addRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, quantity: 1 });
    const itemId = addRes.body.data.items[0]._id;

    const updateRes = await request(app)
      .put(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 0 });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.data.items.length).toBe(0);
  });
});
