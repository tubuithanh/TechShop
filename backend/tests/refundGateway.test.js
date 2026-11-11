require('./setup');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Notification = require('../models/Notification');
const vnpay = require('../utils/vnpay');
const momo = require('../utils/momo');

// Khóa giả - mọi lời gọi tới VNPay / MoMo đều được giả lập, không gọi ra ngoài
const KEYS = {
  VNP_TMN_CODE: 'TESTTMN', VNP_HASH_SECRET: 'TESTVNPAYSECRETTESTVNPAYSECRET12',
  MOMO_PARTNER_CODE: 'TESTPARTNER', MOMO_ACCESS_KEY: 'TESTACCESS', MOMO_SECRET_KEY: 'TESTSECRET'
};
const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
let calls;
let vnpReply; // (body) => object trả về cho lệnh refund VNPay
let momoReply;

// Phản hồi VNPay có chữ ký đúng như VNPay ký
function signedVnpResponse(fields) {
  const data = { vnp_ResponseId: 'R1', vnp_Command: 'refund', vnp_TmnCode: KEYS.VNP_TMN_CODE, vnp_BankCode: 'NCB', vnp_PayDate: '20261110100000', vnp_TransactionType: '02', vnp_TransactionStatus: '05', vnp_OrderInfo: 'x', ...fields };
  const raw = [data.vnp_ResponseId, data.vnp_Command, data.vnp_ResponseCode, data.vnp_Message, data.vnp_TmnCode, data.vnp_TxnRef, data.vnp_Amount, data.vnp_BankCode,
    data.vnp_PayDate, data.vnp_TransactionNo, data.vnp_TransactionType, data.vnp_TransactionStatus, data.vnp_OrderInfo].map((v) => v ?? '').join('|');
  return { ...data, vnp_SecureHash: crypto.createHmac('sha512', KEYS.VNP_HASH_SECRET).update(raw).digest('hex') };
}

beforeEach(() => {
  Object.assign(process.env, KEYS);
  vnpay.clearPaymentConfigCache();
  momo.clearMomoConfigCache();
  calls = [];
  vnpReply = (b) => signedVnpResponse({ vnp_ResponseCode: '00', vnp_Message: 'Refund success', vnp_TxnRef: b.vnp_TxnRef, vnp_Amount: String(b.vnp_Amount), vnp_TransactionNo: '99887766' });
  momoReply = (b) => ({ resultCode: 0, message: 'Thành công.', orderId: b.orderId, transId: 555000111, amount: Number(b.amount) });
  const realFetch = global.fetch;
  jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
    const u = String(url);
    if (u.includes('/merchant_webapi/api/transaction')) {
      const body = JSON.parse(opts.body);
      calls.push({ gateway: 'vnpay', url: u, body });
      return new Response(JSON.stringify(vnpReply(body)), { status: 200 });
    }
    if (u.includes('/v2/gateway/api/refund')) {
      const body = JSON.parse(opts.body);
      calls.push({ gateway: 'momo', url: u, body });
      return new Response(JSON.stringify(momoReply(body)), { status: 200 });
    }
    return realFetch(url, opts);
  });
});
afterEach(() => {
  Object.keys(KEYS).forEach((k) => delete process.env[k]);
  jest.restoreAllMocks();
});

async function setup() {
  await Admin.create({ name: 'Admin', email: 'adminrf@example.com', password: 'admin123', role: 'admin' });
  const token = (await request(app).post('/api/auth/login').send({ email: 'adminrf@example.com', password: 'admin123' })).body.accessToken;
  const store = await Store.create({ name: 'CN RF' });
  const userId = (await Admin.findOne())._id; // chỉ cần 1 ObjectId cho thông báo
  const base = { userId, storeId: store._id, status: 'cancelled', paymentStatus: 'paid', refundStatus: 'pending', items: [], itemsTotal: 2500000, grandTotal: 2500000 };
  const vnpOrder = await Order.create({
    ...base, orderCode: 'DHVNP1', paymentMode: 'vnpay',
    paymentInfo: { txnRef: 'DHVNP1123456', txnRefs: ['DHVNP1123456'], transactionNo: '14123456', createDates: { DHVNP1123456: '20261109153000' } }
  });
  const momoOrder = await Order.create({ ...base, orderCode: 'DHMOMO1', paymentMode: 'momo', paymentInfo: { txnRef: 'DHMOMO1MM1', txnRefs: ['DHMOMO1MM1'], transactionNo: '4088123456' } });
  const refund = (order, body) => auth(request(app).post(`/api/orders/${order._id}/confirm-refund`), token).send({ confirmed: true, ...body });
  return { token, vnpOrder, momoOrder, refund };
}

describe('Hoàn tiền qua cổng thanh toán VNPay / MoMo', () => {
  test('RF-1: Hoàn qua VNPay: gửi đúng lệnh refund có chữ ký, thành công thì đơn thành "đã hoàn tiền" + báo khách', async () => {
    const c = await setup();
    const res = await c.refund(c.vnpOrder, { method: 'gateway' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ paymentStatus: 'refunded', refundStatus: 'completed', refundInfo: { method: 'gateway', gateway: 'vnpay', amount: 2500000, gatewayTransNo: '99887766' } });

    expect(calls).toHaveLength(1);
    const b = calls[0].body;
    expect(calls[0].url).toBe('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction');
    expect(b).toMatchObject({ vnp_Command: 'refund', vnp_TmnCode: 'TESTTMN', vnp_TransactionType: '02', vnp_TxnRef: 'DHVNP1123456', vnp_Amount: 250000000, vnp_TransactionNo: '14123456', vnp_TransactionDate: '20261109153000' });
    const raw = [b.vnp_RequestId, b.vnp_Version, b.vnp_Command, b.vnp_TmnCode, b.vnp_TransactionType, b.vnp_TxnRef, b.vnp_Amount, b.vnp_TransactionNo,
      b.vnp_TransactionDate, b.vnp_CreateBy, b.vnp_CreateDate, b.vnp_IpAddr, b.vnp_OrderInfo].join('|');
    expect(b.vnp_SecureHash).toBe(crypto.createHmac('sha512', KEYS.VNP_HASH_SECRET).update(raw).digest('hex'));

    expect(await Notification.exists({ title: 'Đã hoàn tiền' })).toBeTruthy();
    // Không hoàn lần 2
    expect((await c.refund(c.vnpOrder, { method: 'gateway' })).statusCode).toBe(409);
    expect(calls).toHaveLength(1);
  });

  test('RF-2: Hoàn qua MoMo: chữ ký đúng; MoMo từ chối thì đơn vẫn "chờ hoàn", lưu lần thử, hoàn thủ công được', async () => {
    const c = await setup();
    momoReply = () => ({ resultCode: 1081, message: 'Transaction was refunded' });
    const fail = await c.refund(c.momoOrder, { method: 'gateway' });
    expect(fail.statusCode).toBe(502);
    expect(fail.body.message).toMatch(/MoMo: .*đã được hoàn tiền hoặc không thể hoàn/);
    const after = await Order.findById(c.momoOrder._id).lean();
    expect(after).toMatchObject({ refundStatus: 'pending', paymentStatus: 'paid' });
    expect(after.refundInfo.attempts[0]).toMatchObject({ ok: false, code: '1081', gateway: 'momo' });

    const b = calls[0].body;
    const raw = `accessKey=${KEYS.MOMO_ACCESS_KEY}&amount=${b.amount}&description=${b.description}&orderId=${b.orderId}&partnerCode=${KEYS.MOMO_PARTNER_CODE}&requestId=${b.requestId}&transId=${b.transId}`;
    expect(b.signature).toBe(crypto.createHmac('sha256', KEYS.MOMO_SECRET_KEY).update(raw).digest('hex'));
    expect(b).toMatchObject({ partnerCode: 'TESTPARTNER', amount: '2500000', transId: 4088123456 });
    expect(b.orderId).not.toBe('DHMOMO1MM1'); // mã giao dịch hoàn tiền là mã MỚI

    // Thử lại thành công
    momoReply = (body) => ({ resultCode: 0, message: 'Thành công.', orderId: body.orderId, transId: 777 });
    const ok = await c.refund(c.momoOrder, { method: 'gateway', note: 'Thử lại' });
    expect(ok.body.data).toMatchObject({ paymentStatus: 'refunded', refundInfo: { gateway: 'momo', gatewayTransNo: '777' } });
    expect(ok.body.data.refundInfo.attempts).toHaveLength(2);
  });

  test('RF-3: Lỗi mạng / chữ ký phản hồi sai -> không ghi nhận đã hoàn; đơn COD không hoàn qua cổng; hoàn thủ công cần ghi chú', async () => {
    const c = await setup();
    global.fetch.mockImplementationOnce(async () => { throw Object.assign(new Error('timeout'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); });
    const net = await c.refund(c.vnpOrder, { method: 'gateway' });
    expect(net.statusCode).toBe(502);
    expect(net.body.message).toMatch(/chưa biết kết quả/);
    expect((await Order.findById(c.vnpOrder._id)).refundStatus).toBe('pending');

    vnpReply = (body) => ({ ...signedVnpResponse({ vnp_ResponseCode: '00', vnp_TxnRef: body.vnp_TxnRef }), vnp_SecureHash: 'gia-mao' });
    const forged = await c.refund(c.vnpOrder, { method: 'gateway' });
    expect(forged.statusCode).toBe(502);
    expect(forged.body.message).toMatch(/Chữ ký phản hồi/);

    vnpReply = () => signedVnpResponse({ vnp_ResponseCode: '91', vnp_Message: 'Not found' });
    expect((await c.refund(c.vnpOrder, { method: 'gateway' })).body.message).toMatch(/Không tìm thấy giao dịch gốc/);

    const cod = await Order.create({ orderCode: 'DHCOD1', storeId: (await Store.findOne())._id, paymentMode: 'cod', status: 'returned', paymentStatus: 'paid', refundStatus: 'pending', items: [], itemsTotal: 1, grandTotal: 1 });
    expect((await c.refund(cod, { method: 'gateway' })).statusCode).toBe(400);
    expect((await c.refund(cod, {})).statusCode).toBe(400); // thủ công thiếu ghi chú
    const manual = await c.refund(cod, { note: 'Trả tiền mặt tại quầy' });
    expect(manual.body.data).toMatchObject({ paymentStatus: 'refunded', refundInfo: { method: 'manual', note: 'Trả tiền mặt tại quầy' } });
  });
});
