require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Review = require('../models/Review');
const { registerUser } = require('./helpers');

const IMG = (n) => `https://example.com/anh-${n}.jpg`;

async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({
    title: 'Điện thoại test',
    slug: 'dien-thoai-test',
    categoryId: category._id,
    price: 1,
    variants: [{ color: 'Đen', price: 1000000 }]
  });
  const token = (await registerUser()).body.accessToken;
  const created = await request(app)
    .post(`/api/products/${product._id}/reviews`)
    .set('Authorization', `Bearer ${token}`)
    .send({ rating: 2, message: 'Tạm được', images: [IMG(1)] });
  return { product, token, review: created.body.data };
}

const edit = (product, reviewId, token, body) =>
  request(app).put(`/api/products/${product._id}/reviews/${reviewId}`).set('Authorization', `Bearer ${token}`).send(body);

describe('Sửa đánh giá sản phẩm', () => {
  test('TC-42: Khách sửa được số sao, nội dung và ảnh của đánh giá mình; điểm trung bình được tính lại', async () => {
    const { product, token, review } = await setup();
    expect((await Product.findById(product._id)).ratingAverage).toBe(2);
    const res = await edit(product, review._id, token, { rating: 5, message: 'Dùng lâu thấy rất tốt', images: [IMG(2), IMG(3)] });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.rating).toBe(5);
    expect(res.body.data.message).toBe('Dùng lâu thấy rất tốt');
    expect(res.body.data.images).toEqual([IMG(2), IMG(3)]);
    expect(res.body.data.editedAt).toBeTruthy();
    expect((await Product.findById(product._id)).ratingAverage).toBe(5);
  });

  test('TC-43: Không sửa được đánh giá của người khác', async () => {
    const { product, review } = await setup();
    const other = (await registerUser()).body.accessToken;
    const res = await edit(product, review._id, other, { rating: 1 });
    expect(res.statusCode).toBe(403);
    expect((await Review.findById(review._id)).rating).toBe(2);
  });

  test('TC-44: Không sửa được đánh giá đã bị quản trị viên ẩn', async () => {
    const { product, token, review } = await setup();
    await Review.updateOne({ _id: review._id }, { status: 'hidden' });
    const res = await edit(product, review._id, token, { message: 'Sửa lại nội dung vi phạm' });
    expect(res.statusCode).toBe(403);
  });

  test('TC-45: Từ chối số sao ngoài 1-5 và quá 3 ảnh (cả khi viết mới lẫn khi sửa)', async () => {
    const { product, token, review } = await setup();
    expect((await edit(product, review._id, token, { rating: 6 })).statusCode).toBe(400);
    expect((await edit(product, review._id, token, { images: [IMG(1), IMG(2), IMG(3), IMG(4)] })).statusCode).toBe(400);
    const other = (await registerUser()).body.accessToken;
    const create = await request(app)
      .post(`/api/products/${product._id}/reviews`)
      .set('Authorization', `Bearer ${other}`)
      .send({ rating: 0, message: 'x' });
    expect(create.statusCode).toBe(400);
    expect((await Review.findById(review._id)).rating).toBe(2);
  });
});
