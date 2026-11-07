require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Voucher = require('../models/Voucher');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const { transactionsSupported } = require('../utils/transaction');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(async () => {
  jest.restoreAllMocks();
  delete process.env.MONGO_TRANSACTIONS;
  await flushEmails();
});

// Đặt hàng mà bước LƯU ĐƠN (bước cuối, sau khi đã trừ kho + giữ lượt mã + làm trống giỏ) bị lỗi
async function placeOrderThatFailsAtSave() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy lỗi', slug: 'may-loi', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000000 }] });
  const store = await Store.create({ name: 'CN' });
  const inv = await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
  await Voucher.create({ code: 'TX1', discountType: 'fixed', discountValue: 1000, usageLimit: 5, startDate: new Date(Date.now() - 864e5), endDate: new Date(Date.now() + 864e5), isActive: true });
  const reg = await registerUser();
  const token = reg.body.accessToken;
  await auth(request(app).post('/api/cart/items'), token).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 2 });

  jest.spyOn(Order, 'create').mockRejectedValueOnce(new Error('Mất kết nối cơ sở dữ liệu (giả lập)'));
  const res = await auth(request(app).post('/api/orders'), token).send({
    storeId: store._id, voucherCode: 'TX1', deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
  });
  return {
    res,
    stock: (await StoreInventory.findById(inv._id)).stock,
    used: (await Voucher.findOne({ code: 'TX1' })).usedCount,
    cartItems: (await Cart.findOne({ userId: reg.body.user._id })).items.length,
    orders: await Order.countDocuments()
  };
}

describe('Transaction khi đặt hàng', () => {
  test('TC-143: Có transaction: lỗi ở bước cuối thì kho, lượt mã, giỏ hàng tự trở về như cũ', async () => {
    delete process.env.MONGO_TRANSACTIONS; // test riêng nhánh có transaction, kể cả khi cả lượt chạy ép tắt
    expect(await transactionsSupported()).toBe(true); // môi trường test là replica set giống Atlas
    const r = await placeOrderThatFailsAtSave();
    expect(r.res.statusCode).toBe(500);
    expect(r).toMatchObject({ stock: 5, used: 0, cartItems: 1, orders: 0 });
  });

  test('TC-144: Không có transaction (MongoDB đơn lẻ): hoàn tác thủ công cho cùng kết quả', async () => {
    process.env.MONGO_TRANSACTIONS = 'off';
    expect(await transactionsSupported()).toBe(false);
    const r = await placeOrderThatFailsAtSave();
    expect(r.res.statusCode).toBe(500);
    expect(r).toMatchObject({ stock: 5, used: 0, cartItems: 1, orders: 0 });
  });
});
