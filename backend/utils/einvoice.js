// Phát hành hóa đơn điện tử GIẢ LẬP từ đơn hàng: đánh số liên tục, mã CQT, mã tra cứu, ký số (HMAC), số tiền bằng chữ.
const crypto = require('crypto'); // HMAC ký số, số ngẫu nhiên
const mongoose = require('mongoose');
const EInvoice = require('../models/EInvoice'); // hóa đơn đã phát hành
const Setting = require('../models/Setting'); // thông tin cửa hàng (dự phòng)

// Bộ đếm số hóa đơn theo ký hiệu (cập nhật nguyên tử -> không trùng số khi phát hành đồng thời)
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { collection: 'einvoice_counters', versionKey: false }); // _id = ký hiệu hóa đơn, seq = số đã cấp gần nhất
const Counter = mongoose.models.EInvoiceCounter || mongoose.model('EInvoiceCounter', counterSchema); // tránh khai báo model 2 lần
const nextNumber = async (series) => (await Counter.findOneAndUpdate({ _id: series }, { $inc: { seq: 1 } }, { new: true, upsert: true })).seq; // $inc nguyên tử: 2 hóa đơn cùng lúc nhận 2 số khác nhau; chưa có thì tạo (upsert)

// ---------- Đọc số tiền bằng chữ (tiếng Việt) ----------
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']; // chữ số 0-9
function readTriple(n, full) {
  const h = Math.floor(n / 100); const t = Math.floor((n % 100) / 10); const u = n % 10; // tách hàng trăm / chục / đơn vị
  const out = [];
  if (full || h) out.push(`${DIGITS[h]} trăm`); // nhóm giữa luôn đọc "không trăm"
  if (t === 0) { if (u && (full || h)) out.push('lẻ'); } // VD 105 -> "một trăm lẻ năm"
  else if (t === 1) out.push('mười'); // 10-19 -> "mười"
  else out.push(`${DIGITS[t]} mươi`); // 20-99 -> "hai mươi"...
  if (u) {
    if (u === 1 && t > 1) out.push('mốt'); // 21 -> "hai mươi mốt"
    else if (u === 5 && t > 0) out.push('lăm'); // 15, 25 -> "lăm"
    else if (u === 4 && t > 1) out.push('tư'); // 24 -> "hai mươi tư"
    else out.push(DIGITS[u]);
  }
  return out.join(' ');
}
function numberToWords(value) {
  let n = Math.round(Math.abs(value)); // làm tròn, bỏ dấu âm
  if (n === 0) return 'Không đồng';
  const units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ']; // đơn vị của từng nhóm 3 chữ số
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); } // tách thành nhóm 3 chữ số từ phải sang
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue; // nhóm 000 -> bỏ qua
    parts.push(readTriple(groups[i], i < groups.length - 1) + units[i]); // nhóm không phải đầu tiên thì đọc đủ (không trăm...)
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng chẵn`; // viết hoa chữ đầu
}

// Thông tin người bán (cấu hình trong Setting.einvoice, có mặc định giả lập)
async function sellerInfo() {
  const s = await Setting.findOne().select('siteName hotline address email einvoice').lean(); // cấu hình chung
  const conf = await require('./einvoiceConfig').getEInvoiceConfig(); // cấu hình hóa đơn điện tử
  // Ưu tiên cấu hình trong "Cấu hình hệ thống -> Hóa đơn điện tử", sau đó Setting.einvoice cũ, cuối cùng là mặc định giả lập
  const cfg = { ...(s?.einvoice || {}), ...Object.fromEntries(Object.entries(conf.seller || {}).filter(([, v]) => v)), ...(conf.series ? { series: conf.series } : {}) };
  return {
    seller: {
      name: cfg.companyName || `CÔNG TY TNHH ${String(s?.siteName || 'TechShop').toUpperCase()} VIỆT NAM`, // tên đơn vị bán
      taxCode: cfg.taxCode || '0109999999', // MST giả lập
      address: cfg.address || s?.address || 'Số 1 Lê Lợi, Phường Sài Gòn, TP. Hồ Chí Minh',
      phone: cfg.phone || s?.hotline || '1900 0000',
      email: cfg.email || s?.email || '',
      bankAccount: cfg.bankAccount || ''
    },
    series: cfg.series || `C${String(new Date().getFullYear()).slice(-2)}TTS`, // ký hiệu: C + 2 số năm + TTS
    template: conf.template || '1', // mẫu số 1 = hóa đơn GTGT
    conf
  };
}

// Dòng hóa đơn từ đơn hàng: dùng đúng VAT đã tính lúc đặt (giá niêm yết đã gồm VAT)
function buildLines(order) {
  const lines = [];
  (order.items || []).forEach((it, i) => {
    const gross = Math.round(it.unitPrice * it.quantity); // tiền hàng (đã gồm VAT)
    const discount = Math.round(it.discountAmount || 0); // giảm giá của dòng
    const taxable = it.vat?.taxableTotal ?? Math.max(0, gross - discount); // tiền thanh toán của dòng (gồm VAT)
    const rate = it.vat?.rate ?? 10; // thuế suất
    const vatAmount = it.vat?.amount ?? Math.round((taxable * rate) / (100 + rate)); // tách VAT từ giá đã gồm thuế: tổng × r / (100 + r)
    const net = taxable - vatAmount; // thành tiền chưa thuế
    lines.push({ no: i + 1, name: [it.name, it.variantLabel].filter(Boolean).join(' - '), unit: 'Cái', quantity: it.quantity,
      unitPrice: Math.round((gross - Math.round((gross * rate) / (100 + rate))) / it.quantity), discount, amount: net, vatRate: rate, vatAmount, total: taxable, kind: 'goods' }); // đơn giá chưa thuế
  });
  const ship = order.shippingVat; // VAT phí ship đã tính lúc đặt
  if (ship?.taxableTotal > 0) {
    lines.push({ no: lines.length + 1, name: 'Phí vận chuyển', unit: 'Lần', quantity: 1, unitPrice: ship.netAmount, discount: 0, amount: ship.netAmount, vatRate: ship.rate, vatAmount: ship.amount, total: ship.taxableTotal, kind: 'shipping' });
  } else if (!ship && order.shippingFee > 0) { // đơn cũ chưa có shippingVat -> tính 10%
    const vatAmount = Math.round((order.shippingFee * 10) / 110);
    lines.push({ no: lines.length + 1, name: 'Phí vận chuyển', unit: 'Lần', quantity: 1, unitPrice: order.shippingFee - vatAmount, discount: 0, amount: order.shippingFee - vatAmount, vatRate: 10, vatAmount, total: order.shippingFee, kind: 'shipping' });
  }
  return lines;
}

function totalsOf(lines) {
  const byRate = new Map(); // gom theo thuế suất (hóa đơn ghi riêng từng mức 0/5/8/10%)
  for (const l of lines) {
    const g = byRate.get(l.vatRate) || { rate: l.vatRate, net: 0, vat: 0 };
    g.net += l.amount; g.vat += l.vatAmount; byRate.set(l.vatRate, g);
  }
  const net = lines.reduce((s, l) => s + l.amount, 0);
  const vat = lines.reduce((s, l) => s + l.vatAmount, 0);
  return { net, vat, total: net + vat, byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate) }; // tổng chưa thuế, tổng thuế, tổng thanh toán
}

// Người mua: công ty (khách nhập thông tin xuất hóa đơn) hoặc cá nhân
function buyerOf(order, override = {}) {
  const inv = order.invoiceInfo || {}; // thông tin xuất hóa đơn công ty (nếu khách nhập)
  const addr = order.deliveryAddress || {};
  const b = {
    name: addr.fullName || order.userId?.displayName || 'Khách lẻ',
    companyName: inv.companyName || '', taxCode: inv.taxCode || '',
    address: inv.address || [addr.addressLine1, addr.addressLine2, addr.city].filter(Boolean).join(', '),
    phone: addr.phone || '', email: inv.email || order.userId?.email || ''
  };
  for (const k of ['name', 'companyName', 'taxCode', 'address', 'email', 'phone']) if (typeof override[k] === 'string') b[k] = override[k].trim().slice(0, 300); // nhân viên sửa thông tin người mua: tối đa 300 ký tự
  return b;
}

const sign = (doc) => crypto.createHmac('sha256', process.env.JWT_ACCESS_SECRET || 'einvoice-demo') // chữ ký số GIẢ LẬP: HMAC trên các trường quan trọng
  .update(JSON.stringify([doc.series, doc.number, doc.issuedAt, doc.seller.taxCode, doc.buyer.taxCode, doc.totals.total, doc.lines.map((l) => [l.name, l.quantity, l.total])])) // đổi số, tiền, dòng hàng -> chữ ký sai
  .digest('hex');

// BẢN NHÁP (chưa phát hành): đầy đủ nội dung hóa đơn nhưng CHƯA có số, mã CQT, mã tra cứu, chữ ký
async function draftForOrder(order, { buyer: buyerOverride } = {}) {
  const info = await sellerInfo();
  const { seller } = info;
  const series = (info.conf.activeProvider !== 'simulation' && info.conf.providerCfg.values.invoiceSerial) || info.series; // nhà cung cấp thật: ký hiệu theo cấu hình của họ
  // SỬA LỖI: bản nháp trước đây luôn ghi mẫu số "1" trong khi phát hành dùng mẫu số theo cấu hình -> xem trước khác hóa đơn thật
  const lines = buildLines(order);
  const totals = totalsOf(lines);
  return {
    draft: true, orderId: order._id, orderCode: order.orderCode, template: info.template, series, number: null, issuedAt: new Date(), // bản nháp: number = null
    seller, buyer: buyerOf(order, buyerOverride || {}), lines, totals, amountInWords: numberToWords(totals.total), currency: 'VND',
    paymentMethod: ['cash', 'cod'].includes(order.paymentMode) ? 'TM' : 'CK', status: 'draft'
  };
}

// Phát hành 1 hóa đơn cho đơn hàng. replaces: hóa đơn cũ bị thay thế (đã kiểm tra trước). Trả về hóa đơn mới.
async function issueForOrder(order, { actor, buyer: buyerOverride, replaces } = {}) {
  const { seller, series, template, conf } = await sellerInfo();
  const lines = buildLines(order);
  const totals = totalsOf(lines);
  const external = conf.activeProvider !== 'simulation'; // phát hành qua nhà cung cấp thật?
  // Số tạm (âm, duy nhất) - số thật chỉ cấp SAU KHI lưu thành công, để lỗi / trùng đơn không làm nhảy số hóa đơn
  const number = -(Date.now() * 1000 + crypto.randomInt(1000)); // số âm tạm thời, duy nhất
  const now = new Date();
  const doc = {
    orderId: order._id, orderCode: order.orderCode, storeId: order.storeId?._id || order.storeId, userId: order.userId?._id || order.userId || undefined,
    template, series, number, issuedAt: now, provider: conf.activeProvider,
    // Mã CQT giả lập: M + mẫu - năm - 5 ký tự - 12 số (giống định dạng mã cơ quan thuế cấp)
    taxAuthorityCode: `M1-${String(now.getFullYear()).slice(-2)}-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5)}-${String(Date.now()).slice(-12).padStart(12, '0')}`,
    lookupCode: crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'X').toUpperCase().slice(0, 10), // mã tra cứu 10 ký tự cho khách
    seller, buyer: buyerOf(order, buyerOverride || {}), lines, totals, amountInWords: numberToWords(totals.total),
    paymentMethod: ['cash', 'cod'].includes(order.paymentMode) ? 'TM' : ['bank_transfer', 'vnpay', 'momo'].includes(order.paymentMode) ? 'CK' : 'TM/CK', // TM = tiền mặt, CK = chuyển khoản
    type: replaces ? 'replacement' : 'original', replacesId: replaces?._id, // hóa đơn thay thế ghi rõ thay cho hóa đơn nào
    signedAt: now, issuedBy: actor?._id, issuedByName: actor?.name || 'Hệ thống'
  };
  // Nhà cung cấp thật (VD Bkav): gửi hóa đơn đi, nhà cung cấp cấp số / mã CQT / mã tra cứu. Lỗi -> không lưu gì.
  if (external) {
    let r;
    try { r = await conf.provider.issue(conf.providerCfg, doc); } // gửi tới nhà cung cấp (VD Bkav)
    catch (err) { const { BusinessError } = require('./transaction'); throw new BusinessError(502, `Phát hành qua ${conf.provider.name} thất bại: ${err.message}`); }
    Object.assign(doc, {
      number: r.number || number, series: r.series || series, template: r.template || template, // dùng số / mã do nhà cung cấp cấp
      taxAuthorityCode: r.taxAuthorityCode || doc.taxAuthorityCode, lookupCode: r.lookupCode || doc.lookupCode, providerRef: r.providerRef || ''
    });
  }
  const inv = await EInvoice.create(doc); // chỉ 1 hóa đơn hiệu lực / đơn (index) - trùng thì lỗi ở đây, chưa tốn số
  if (inv.number < 0) inv.number = await nextNumber(external ? `${conf.activeProvider}:${inv.series}` : inv.series); // lưu thành công mới cấp số thật -> không nhảy số
  inv.signature = sign(inv.toObject()); // ký SAU KHI có số chính thức
  await inv.save();
  return inv;
}

const verifySignature = (inv) => sign(inv) === inv.signature; // kiểm tra hóa đơn có bị sửa sau khi ký không

// TỰ XUẤT khi đơn giao thành công (bật trong cấu hình). Không làm hỏng luồng giao hàng nếu lỗi.
async function autoIssueIfEnabled(orderId) {
  try {
    const conf = await require('./einvoiceConfig').getEInvoiceConfig();
    if (!conf.autoIssue) return null; // chưa bật tự xuất
    const Order = require('../models/Order');
    const order = await Order.findById(orderId).populate('userId', 'displayName email');
    if (!order || order.status !== 'delivered') return null; // chỉ đơn đã giao
    if (['vnpay', 'momo', 'bank_transfer'].includes(order.paymentMode) && order.paymentStatus !== 'paid') return null; // chưa thu tiền -> chưa xuất
    if (await EInvoice.exists({ orderId: order._id, status: 'issued' })) return null; // đã có hóa đơn -> không xuất lại
    const inv = await issueForOrder(order, { actor: { name: 'Hệ thống (tự xuất)' } });
    if (conf.autoEmail && inv.buyer?.email) require('./notifyEmail').emailEInvoice(inv); // ghi "đã gửi" khi gửi thành công
    return inv;
  } catch (err) { console.error('[Hóa đơn điện tử] Tự xuất thất bại:', err.message); return null; } // lỗi chỉ ghi log
}

module.exports = { autoIssueIfEnabled, draftForOrder, issueForOrder, numberToWords, buildLines, totalsOf, sellerInfo, verifySignature };
