const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

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

const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, phoneNumber, avatar, gender, dateOfBirth } = req.body;
  const user = await User.findById(req.account._id);
  // Trước đây dùng kiểm tra truthy (if (displayName)) nên gửi chuỗi rỗng bị ÂM THẦM bỏ qua - Frontend
  // vẫn báo "Cập nhật thành công" dù không có gì thay đổi, và họ tên rỗng không được coi là lỗi dù
  // đây là field bắt buộc phải có giá trị.
  if (displayName !== undefined) {
    if (!displayName.trim()) return res.status(400).json({ message: 'Họ và tên không được để trống' });
    user.displayName = displayName.trim();
  }
  if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
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
  // Địa chỉ đầu tiên của khách luôn tự động là mặc định, để checkout luôn có địa chỉ để chọn sẵn.
  const shouldBeDefault = req.body.isDefault === true || user.addresses.length === 0;
  user.addresses.push({ ...req.body, isDefault: shouldBeDefault });
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
  Object.assign(address, req.body);
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
  const { keyword, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (keyword) {
    filter.$or = [
      { displayName: { $regex: keyword, $options: 'i' } },
      { email: { $regex: keyword, $options: 'i' } },
      { phoneNumber: { $regex: keyword, $options: 'i' } }
    ];
  }
  const customers = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await User.countDocuments(filter);
  res.json({ data: customers, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

const toggleCustomerActive = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
  customer.isActive = !customer.isActive;
  await customer.save();
  res.json({ message: customer.isActive ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản', user: customer.toSafeObject() });
});

module.exports = {
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
