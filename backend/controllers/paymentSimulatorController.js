// Trang thanh toán GIẢ LẬP của VNPay / MoMo (xem utils/paymentSimulator.js). Chỉ hoạt động khi admin chọn chế độ
// "Giả lập" cho cổng tương ứng; mọi dữ liệu đều được kiểm chữ ký bằng khóa bí mật của máy chủ.
const asyncHandler = require('../utils/asyncHandler');
const vnpay = require('../utils/vnpay');
const momo = require('../utils/momo');
const { renderPage, randomDigits } = require('../utils/paymentSimulator');
const { applyResult } = require('./paymentController');

const disabled = (res, gateway) => res.status(404).type('html').send(`<p style="font-family:sans-serif">Cổng ${gateway} giả lập đang tắt.</p>`);
const invalid = (res) => res.status(400).type('html').send('<p style="font-family:sans-serif">Link thanh toán không hợp lệ hoặc đã bị sửa.</p>');
const vnTime = (d) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
// Chính sách bảo mật riêng cho trang giả lập: helmet mặc định "form-action 'self'" - Chrome áp dụng cả cho bước
// chuyển hướng SAU khi gửi form, sẽ chặn việc quay về trang kết quả ở frontend (khác domain). Vẫn khóa mọi nguồn
// khác (không script, không tải tài nguyên ngoài), chỉ cho form gửi / chuyển về địa chỉ http(s).
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http: https:; base-uri 'none'; frame-ancestors 'none'";
const sendPage = (res, html) => res.set('Content-Security-Policy', PAGE_CSP).type('html').send(html);

// Chỉ cho quay về http(s) - không để link giả chuyển hướng tới giao thức lạ
const safeUrl = (u) => /^https?:\/\//i.test(String(u || ''));

// Kiểm tra query link VNPay giả lập (ký giống link VNPay thật)
async function verifyVnpayLink(query) {
  const cfg = await vnpay.getConfig();
  if (cfg.source !== 'simulator') return { off: true };
  const { vnp_SecureHash, ...params } = query;
  const { hash } = vnpay.signedQuery(params, cfg.hashSecret);
  if (!vnp_SecureHash || hash !== String(vnp_SecureHash).toLowerCase() || !safeUrl(params.vnp_ReturnUrl)) return { bad: true };
  return { cfg, params };
}

// @route GET /api/payments/simulator/vnpay?<tham số như VNPay>&vnp_SecureHash=
const vnpayPage = asyncHandler(async (req, res) => {
  const v = await verifyVnpayLink(req.query);
  if (v.off) return disabled(res, 'VNPay');
  if (v.bad) return invalid(res);
  const raw = new URLSearchParams(req.query).toString();
  sendPage(res, renderPage({
    gateway: 'VNPay', color: '#005baa', amount: Number(v.params.vnp_Amount) / 100, orderInfo: v.params.vnp_OrderInfo,
    txnRef: v.params.vnp_TxnRef, action: `${req.baseUrl}/simulator/vnpay/complete`, hidden: { q: raw }
  }));
});

// @route POST /api/payments/simulator/vnpay/complete { q: query gốc, result: success|fail }
// Ký kết quả như VNPay -> ghi nhận ngay (thay cho IPN) -> chuyển khách về Return URL kèm kết quả đã ký
const vnpayComplete = asyncHandler(async (req, res) => {
  const v = await verifyVnpayLink(Object.fromEntries(new URLSearchParams(String(req.body.q || ''))));
  if (v.off) return disabled(res, 'VNPay');
  if (v.bad) return invalid(res);
  const ok = req.body.result === 'success';
  const result = {
    vnp_Amount: v.params.vnp_Amount,
    vnp_BankCode: ok ? 'NCB' : '',
    vnp_CardType: ok ? 'ATM' : '',
    vnp_OrderInfo: v.params.vnp_OrderInfo,
    vnp_PayDate: vnTime(new Date()),
    vnp_ResponseCode: ok ? '00' : '24', // 24 = khách hủy giao dịch
    vnp_TmnCode: v.params.vnp_TmnCode,
    vnp_TransactionNo: ok ? randomDigits(8) : '0',
    vnp_TransactionStatus: ok ? '00' : '02',
    vnp_TxnRef: v.params.vnp_TxnRef
  };
  const { query, hash } = vnpay.signedQuery(result, v.cfg.hashSecret);
  const signed = { ...result, vnp_SecureHash: hash };
  // Ghi nhận như IPN của VNPay (đi qua đúng bước kiểm chữ ký)
  const verified = await vnpay.verifyReturn(signed);
  if (verified) await applyResult(verified, req.app.get('io'));
  res.redirect(303, `${v.params.vnp_ReturnUrl}?${query}&vnp_SecureHash=${hash}`);
});

async function verifyMomoLink(query) {
  const cfg = await momo.getConfig();
  if (cfg.source !== 'simulator') return { off: true };
  const p = { orderId: String(query.orderId || ''), amount: String(query.amount || ''), redirectUrl: String(query.redirectUrl || '') };
  if (!query.signature || momo.simulatorSignature(p, cfg) !== String(query.signature) || !safeUrl(p.redirectUrl) || !p.orderId) return { bad: true };
  return { cfg, params: { ...p, requestId: String(query.requestId || p.orderId), orderInfo: String(query.orderInfo || '') } };
}

// @route GET /api/payments/simulator/momo?partnerCode&orderId&requestId&amount&orderInfo&redirectUrl&signature
const momoPage = asyncHandler(async (req, res) => {
  const v = await verifyMomoLink(req.query);
  if (v.off) return disabled(res, 'MoMo');
  if (v.bad) return invalid(res);
  sendPage(res, renderPage({
    gateway: 'MoMo', color: '#a50064', amount: v.params.amount, orderInfo: v.params.orderInfo, txnRef: v.params.orderId,
    action: `${req.baseUrl}/simulator/momo/complete`, hidden: { q: new URLSearchParams(req.query).toString() }
  }));
});

// @route POST /api/payments/simulator/momo/complete { q, result }
const momoComplete = asyncHandler(async (req, res) => {
  const v = await verifyMomoLink(Object.fromEntries(new URLSearchParams(String(req.body.q || ''))));
  if (v.off) return disabled(res, 'MoMo');
  if (v.bad) return invalid(res);
  const ok = req.body.result === 'success';
  const result = {
    partnerCode: v.cfg.partnerCode,
    orderId: v.params.orderId,
    requestId: v.params.requestId,
    amount: v.params.amount,
    orderInfo: v.params.orderInfo,
    orderType: 'momo_wallet',
    transId: ok ? randomDigits(10) : '0',
    resultCode: ok ? '0' : '1006', // 1006 = người dùng từ chối xác nhận thanh toán
    message: ok ? 'Thành công.' : 'Giao dịch bị từ chối bởi người dùng.',
    payType: 'qr',
    responseTime: String(Date.now()),
    extraData: ''
  };
  const signed = { ...result, signature: momo.resultSignature(result, v.cfg) };
  const verified = await momo.verifyResult(signed);
  if (verified) await applyResult(verified, req.app.get('io'));
  res.redirect(303, `${v.params.redirectUrl}?${new URLSearchParams(signed)}`);
});

module.exports = { vnpayPage, vnpayComplete, momoPage, momoComplete };
