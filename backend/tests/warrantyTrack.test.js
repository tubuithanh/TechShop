require('./setup');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');
const Store = require('../models/Store');

async function setup() {
  const store = await Store.create({ name: 'Chi nhánh A' });
  const user = await User.create({ displayName: 'Khách', email: 'khach@example.com', password: 'matkhau123', phoneNumber: '0912345678' });
  const order = await Order.create({
    orderCode: 'DH0001',
    userId: user._id,
    storeId: store._id,
    items: [{ productId: user._id, quantity: 1, unitPrice: 100000, name: 'Điện thoại' }],
    deliveryAddress: { fullName: 'Người nhận', phone: '0987 654 321' },
    paymentMode: 'cod',
    itemsTotal: 100000,
    grandTotal: 100000,
    status: 'delivered'
  });
  await Warranty.create({
    ticketCode: 'BH1234567890',
    userId: user._id,
    orderId: order._id,
    productId: user._id,
    productName: 'Điện thoại',
    issueDescription: 'Mô tả lỗi riêng tư của khách',
    images: ['https://example.com/anh-rieng.jpg'],
    status: 'repairing',
    statusHistory: [{ status: 'received', note: 'Đã nhận máy' }, { status: 'repairing', note: 'Đang thay màn hình' }]
  });
}

const track = (code, phone) => request(app).get(`/api/warranties/track/${code}`).query(phone === undefined ? {} : { phone });

describe('Tra cứu bảo hành công khai', () => {
  test('TC-46: Tra cứu đúng mã + số điện thoại (của tài khoản hoặc người nhận) -> chỉ trả thông tin cần thiết', async () => {
    await setup();
    const byAccount = await track('bh1234567890', '+84 912 345 678'); // không phân biệt hoa thường, nhận +84
    expect(byAccount.statusCode).toBe(200);
    expect(byAccount.body.data.status).toBe('repairing');
    expect(byAccount.body.data.orderCode).toBe('DH0001');
    expect(byAccount.body.data.timeline.map((h) => h.status)).toEqual(['received', 'repairing']);
    // Không lộ thông tin riêng tư / nội bộ
    const raw = JSON.stringify(byAccount.body);
    expect(raw).not.toMatch(/Mô tả lỗi riêng tư|anh-rieng|userId|assignedTo|changedBy/);
    expect((await track('BH1234567890', '0987654321')).statusCode).toBe(200); // SĐT người nhận trên đơn
  });

  test('TC-47: Sai số điện thoại hoặc thiếu số điện thoại -> không xem được', async () => {
    await setup();
    const wrong = await track('BH1234567890', '0900000000');
    expect(wrong.statusCode).toBe(404);
    // Cùng thông báo với mã không tồn tại - không tiết lộ mã phiếu có tồn tại hay không
    expect((await track('BH0000000000', '0912345678')).body.message).toBe(wrong.body.message);
    expect((await track('BH1234567890')).statusCode).toBe(400);
  });
});
