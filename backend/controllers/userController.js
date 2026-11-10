const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { tierFor, getLoyaltyConfig } = require('../utils/loyalty');
const asyncHandler = require('../utils/asyncHandler');
const { disconnectAccount } = require('../utils/socketAuth');
const { searchFilter } = require('../utils/search');
const { normalizeName, validateName, normalizePhone, validatePhone, normalizeAddress, MAX_ADDRESSES } = require('../utils/customerValidation');

// @route POST /api/users/wishlist/:productId - toggle favoriteProductIds
const toggleWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  const { productId } = req.params;
  const index = user.favoriteProductIds.findIndex((id) => id.toString() === productId);

  let added;
  if (index > -1) {
    user.favoriteProductIds.splice(index, 1);
    added = false;
  } else {
    // Chỉ thêm sản phẩm có thật và đang bán (trước đây nhận mã bất kỳ, lưu rác vào danh sách)
    if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId, isActive: true }))) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    user.favoriteProductIds.push(productId);
    added = true;
  }
  await user.save();
  res.json({ message: added ? 'Đã thêm vào yêu thích' : 'Đã bỏ khỏi yêu thích', added, favoriteProductIds: user.favoriteProductIds });
});

const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id).populate('favoriteProductIds');
  res.json({ data: user.favoriteProductIds });
});

// @route GET /api/users/loyalty - hạng thành viên, điểm, mốc hạng tiếp theo và lịch sử cộng / trừ điểm
const getLoyalty = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id).select('loyaltyPoints');
  const orders = await Order.find({ userId: req.account._id, loyaltyPoints: { $gt: 0 }, status: { $in: ['delivered', 'returned'] } })
    .select('orderCode status loyaltyPoints grandTotal statusHistory createdAt')
    .sort({ createdAt: -1 })
    .limit(50);
  const history = orders.map((o) => ({
    orderId: o._id,
    orderCode: o.orderCode,
    status: o.status,
    points: o.status === 'returned' ? -o.loyaltyPoints : o.loyaltyPoints,
    // Ngày đổi sang trạng thái hiện tại (giao thành công / trả hàng)
    date: [...(o.statusHistory || [])].reverse().find((h) => h.status === o.status && h.eventType !== 'activity')?.changedAt || o.createdAt
  }));
  const config = await getLoyaltyConfig();
  res.json({ data: { ...tierFor(user?.loyaltyPoints, config), enabled: config.enabled, pointValue: config.pointValue, tiers: config.tiers, history } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, phoneNumber, avatar, gender, dateOfBirth } = req.body;
  const user = await User.findById(req.account._id);
  // Trước đây dùng kiểm tra truthy (if (displayName)) nên gửi chuỗi rỗng bị ÂM THẦM bỏ qua - Frontend
  // vẫn báo "Cập nhật thành công" dù không có gì thay đổi, và họ tên rỗng không được coi là lỗi dù
  // đây là field bắt buộc phải có giá trị.
  if (displayName !== undefined) {
    const nameError = validateName(displayName);
    if (nameError) return res.status(400).json({ message: nameError });
    user.displayName = normalizeName(displayName);
  }
  // Cùng quy tắc với lúc đăng ký: đúng định dạng di động VN và không trùng tài khoản khác
  if (phoneNumber !== undefined && normalizePhone(phoneNumber) !== user.phoneNumber) {
    const phoneError = validatePhone(phoneNumber);
    if (phoneError) return res.status(400).json({ message: phoneError });
    const normalized = normalizePhone(phoneNumber);
    if (await User.exists({ phoneNumber: normalized, _id: { $ne: user._id } })) {
      return res.status(409).json({ message: 'Số điện thoại đã được sử dụng cho tài khoản khác' });
    }
    user.phoneNumber = normalized;
  }
  if (avatar !== undefined) user.avatar = avatar;
  if (gender !== undefined) user.gender = gender;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
  await user.save();
  res.json({ user: user.toSafeObject() });
});

// Đảm bảo bất biến: luôn tối đa 1 địa chỉ isDefault=true trong danh sách.
function clearOtherDefaults(user, keepId) {
  user.addresses.forEach((a) => {
    if (a._id.toString() !== String(keepId)) a.isDefault = false;
  });
}

const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  // Trước đây nhận nguyên req.body (kể cả _id, trường lạ, chuỗi rỗng) và không giới hạn số địa chỉ
  if (user.addresses.length >= MAX_ADDRESSES) return res.status(400).json({ message: `Sổ địa chỉ tối đa ${MAX_ADDRESSES} địa chỉ` });
  const { address: input, error } = normalizeAddress(req.body);
  if (error) return res.status(400).json({ message: error });
  // Địa chỉ đầu tiên của khách luôn tự động là mặc định, để checkout luôn có địa chỉ để chọn sẵn.
  const shouldBeDefault = input.isDefault || user.addresses.length === 0;
  user.addresses.push({ ...input, isDefault: shouldBeDefault });
  if (shouldBeDefault) {
    const newAddress = user.addresses[user.addresses.length - 1];
    clearOtherDefaults(user, newAddress._id);
  }
  await user.save();
  res.status(201).json({ data: user.addresses });
});

const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
  const wasDefault = address.isDefault;
  // Sửa 1 phần: ghép trường gửi lên vào địa chỉ cũ rồi kiểm tra lại cả địa chỉ
  const { address: merged, error } = normalizeAddress({ ...address.toObject(), ...req.body, isDefault: wasDefault });
  if (error) return res.status(400).json({ message: error });
  delete merged.isDefault; // mặc định xử lý riêng bên dưới
  Object.assign(address, merged);
  if (req.body.isDefault === true) {
    clearOtherDefaults(user, address._id);
  } else if (wasDefault && req.body.isDefault === false) {
    // Trước đây có thể bỏ chọn "mặc định" của địa chỉ ĐANG mặc định mà không tự thăng địa chỉ khác
    // lên thay thế, khiến người dùng còn 0 địa chỉ mặc định (checkout không tự chọn sẵn được địa
    // chỉ nào). Tự động thăng địa chỉ khác lên mặc định; nếu đây là địa chỉ DUY NHẤT thì giữ nguyên
    // mặc định (không cho phép 1 địa chỉ duy nhất lại không phải mặc định).
    const other = user.addresses.find((a) => a._id.toString() !== address._id.toString());
    if (other) other.isDefault = true;
    else address.isDefault = true;
  }
  await user.save();
  res.json({ data: user.addresses });
});

const setDefaultAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
  address.isDefault = true;
  clearOtherDefaults(user, address._id);
  await user.save();
  res.json({ data: user.addresses });
});

const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
  const wasDefault = address.isDefault;
  address.deleteOne();
  // Nếu vừa xóa địa chỉ mặc định mà vẫn còn địa chỉ khác, tự động thăng địa chỉ đầu tiên còn lại lên làm mặc định
  if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;
  await user.save();
  res.json({ data: user.addresses });
});

// ---------- ADMIN: Quản lý khách hàng ----------

const getAllCustomers = asyncHandler(async (req, res) => {
  const { keyword, q, isActive, page = 1, limit = 20 } = req.query;
  const filter = {};
  // Tìm không dấu theo họ tên, email, SĐT (nhận cả tham số cũ "keyword")
  Object.assign(filter, searchFilter(q ?? keyword));
  if (isActive === 'true' || isActive === 'false') filter.isActive = isActive === 'true';
  const loyaltyConfig = await getLoyaltyConfig();
  const customers = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await User.countDocuments(filter);
  const data = customers.map((c) => {
    const { key, name, color } = tierFor(c.loyaltyPoints, loyaltyConfig);
    return { ...c.toObject(), tier: { key, name, color } };
  });
  res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

const toggleCustomerActive = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
  customer.isActive = !customer.isActive;
  await customer.save();
  if (!customer.isActive) disconnectAccount(req, customer._id); // bị khóa -> ngắt kết nối real-time ngay
  res.json({ message: customer.isActive ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản', user: customer.toSafeObject() });
});

module.exports = {
  getLoyalty,
  toggleWishlist,
  getWishlist,
  updateProfile,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  getAllCustomers,
  toggleCustomerActive
};
