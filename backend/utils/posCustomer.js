// KHÁCH MUA LẦN ĐẦU TẠI QUẦY:
//  - lookupPhone: thu ngân nhập SĐT -> biết ngay là thành viên / khách cũ chưa có tài khoản / khách mới
//  - createCounterAccount: tạo "thẻ thành viên" nhanh tại quầy (tên + SĐT, email tùy chọn) để tích điểm & giữ sổ bảo hành
//  - linkPosOrders: gắn các đơn mua tại quầy (chưa có tài khoản) cùng SĐT vào tài khoản, cộng điểm, chuyển sổ bảo hành
//  - claimPosHistory: khách tự gộp lịch sử online bằng MÃ ĐƠN trên hóa đơn + SĐT khớp (chứng minh là chủ đơn)
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const WarrantyCard = require('../models/WarrantyCard');
const { normalizePhone } = require('./customerValidation');
const { pointsForOrder, getLoyaltyConfig } = require('./loyalty');

// Các cách ghi cùng 1 SĐT trên đơn cũ: 0912..., +84912..., 84912...
const phoneVariants = (phone) => {
  const p = normalizePhone(phone);
  if (!/^0\d{9}$/.test(p)) return [];
  return [p, `+84${p.slice(1)}`, `84${p.slice(1)}`];
};
// Tài khoản tạo tại quầy mà khách CHƯA từng đăng nhập (chưa có email/Zalo) -> có thể gộp vào tài khoản thật của khách
const isShellAccount = (u) => u && u.source === 'pos' && !u.email && !u.zaloId && !u.lastLoginAt;

async function lookupPhone(phone) {
  const variants = phoneVariants(phone);
  if (!variants.length) return { status: 'invalid' };
  const user = await User.findOne({ phoneNumber: { $in: variants }, isActive: true }).select('displayName phoneNumber email avatar loyaltyPoints source').lean();
  if (user) {
    const [s] = await Order.aggregate([{ $match: { userId: user._id, status: 'delivered' } }, { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$grandTotal' }, last: { $max: '$createdAt' } } }]);
    return { status: 'member', customer: { ...user, orders: s?.orders || 0, spent: s?.spent || 0, lastOrderAt: s?.last || null } };
  }
  const [guest] = await Order.aggregate([
    { $match: { source: 'pos', userId: null, 'deliveryAddress.phone': { $in: variants }, status: 'delivered' } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$grandTotal' }, name: { $first: '$deliveryAddress.fullName' }, last: { $first: '$createdAt' } } }
  ]);
  if (guest) return { status: 'returning', guest: { orders: guest.orders, spent: guest.spent, name: guest.name, lastOrderAt: guest.last } };
  return { status: 'new' };
}

// Tạo tài khoản thành viên tại quầy. Mật khẩu ngẫu nhiên (thu ngân không biết); khách có email thì dùng
// "Quên mật khẩu" để tự đặt mật khẩu và đăng nhập. SĐT đã có tài khoản -> dùng lại, không tạo trùng.
async function createCounterAccount({ fullName, phone, email, staffId }) {
  const variants = phoneVariants(phone);
  const existing = await User.findOne({ phoneNumber: { $in: variants } }).select('_id isActive');
  if (existing) {
    if (!existing.isActive) return { error: 'Tài khoản của SĐT này đang bị khóa' };
    return { user: existing, created: false };
  }
  const mail = String(email || '').trim().toLowerCase();
  if (mail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { error: 'Email không hợp lệ' };
    if (await User.exists({ email: mail })) return { error: 'Email này đã có tài khoản - hãy tìm khách theo email' };
  }
  const user = await User.create({
    displayName: fullName, phoneNumber: variants[0], email: mail || undefined,
    password: crypto.randomBytes(24).toString('base64url'),
    source: 'pos', createdByStaff: staffId
  });
  return { user, created: true };
}

// Gắn đơn tại quầy chưa có tài khoản (cùng SĐT) vào userId: cộng điểm đơn đã giao, chuyển sổ bảo hành.
// exceptOrderId: đơn vừa tạo (đã tự cộng điểm). Trả về { orders, points }
async function linkPosOrders(userId, phone, { exceptOrderId } = {}) {
  const variants = phoneVariants(phone);
  if (!variants.length) return { orders: 0, points: 0 };
  const orders = await Order.find({ source: 'pos', userId: null, 'deliveryAddress.phone': { $in: variants }, ...(exceptOrderId ? { _id: { $ne: exceptOrderId } } : {}) });
  if (!orders.length) return { orders: 0, points: 0 };
  const cfg = await getLoyaltyConfig();
  let points = 0;
  for (const o of orders) {
    const pts = o.status === 'delivered' ? pointsForOrder(o, cfg) : 0;
    // Cập nhật có điều kiện: 2 thao tác gộp chạy cùng lúc không cộng điểm 2 lần
    const r = await Order.updateOne({ _id: o._id, userId: null }, { $set: { userId, loyaltyPoints: pts } });
    if (r.modifiedCount) points += pts;
  }
  const ids = orders.map((o) => o._id);
  await WarrantyCard.updateMany({ orderId: { $in: ids } }, { $set: { userId } });
  if (points) await User.updateOne({ _id: userId }, { $inc: { loyaltyPoints: points } });
  return { orders: ids.length, points };
}

// Khách (đã đăng nhập) nhập mã đơn trên hóa đơn mua tại quầy -> nếu SĐT trên đơn trùng SĐT tài khoản thì gộp:
//  đơn chưa có tài khoản + tài khoản "thẻ thành viên tại quầy" chưa từng đăng nhập (chuyển đơn, điểm, sổ bảo hành, khóa thẻ cũ)
async function claimPosHistory(user, orderCode) {
  const code = String(orderCode || '').trim().toUpperCase().replace(/^#/, '');
  if (!code) return { status: 400, message: 'Nhập mã đơn trên hóa đơn' };
  const mine = phoneVariants(user.phoneNumber);
  if (!mine.length) return { status: 400, message: 'Cập nhật số điện thoại trong Thông tin tài khoản trước (trùng SĐT đã dùng khi mua tại cửa hàng)' };
  const order = await Order.findOne({ orderCode: code, source: 'pos' }).select('userId deliveryAddress.phone').lean();
  // Cùng 1 thông báo cho "không có đơn" và "SĐT không khớp" -> không dò được SĐT của đơn người khác
  if (!order || !mine.includes(normalizePhone(order.deliveryAddress?.phone))) return { status: 404, message: 'Không tìm thấy đơn mua tại cửa hàng khớp với số điện thoại của bạn' };
  if (order.userId && String(order.userId) === String(user._id)) return { status: 200, data: { orders: 0, points: 0, message: 'Đơn này đã nằm trong tài khoản của bạn' } };

  let moved = 0; let points = 0;
  if (order.userId) {
    const shell = await User.findById(order.userId).select('source email zaloId lastLoginAt loyaltyPoints phoneNumber');
    if (!isShellAccount(shell)) return { status: 409, message: 'Đơn này thuộc một tài khoản khác. Vui lòng liên hệ cửa hàng để được hỗ trợ.' };
    // Gộp thẻ thành viên tại quầy vào tài khoản thật
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const shellOrders = await Order.find({ userId: shell._id }).select('_id').session(session);
        await Order.updateMany({ userId: shell._id }, { $set: { userId: user._id } }, { session });
        await WarrantyCard.updateMany({ userId: shell._id }, { $set: { userId: user._id } }, { session });
        const pts = shell.loyaltyPoints || 0;
        if (pts) await User.updateOne({ _id: user._id }, { $inc: { loyaltyPoints: pts } }, { session });
        await User.updateOne({ _id: shell._id }, { $set: { isActive: false, loyaltyPoints: 0, mergedInto: user._id, phoneNumber: '' } }, { session });
        moved = shellOrders.length; points = pts;
      });
    } finally { await session.endSession(); }
  }
  const linked = await linkPosOrders(user._id, user.phoneNumber);
  moved += linked.orders; points += linked.points;
  return { status: 200, data: { orders: moved, points, message: `Đã thêm ${moved} đơn mua tại cửa hàng vào tài khoản${points ? `, cộng ${points} điểm` : ''}` } };
}

module.exports = { lookupPhone, createCounterAccount, linkPosOrders, claimPosHistory, phoneVariants };
