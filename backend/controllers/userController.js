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
  if (displayName) user.displayName = displayName;
  if (phoneNumber) user.phoneNumber = phoneNumber;
  if (avatar) user.avatar = avatar;
  if (gender) user.gender = gender;
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;
  await user.save();
  res.json({ user: user.toSafeObject() });
});

const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  user.addresses.push(req.body);
  await user.save();
  res.status(201).json({ data: user.addresses });
});

const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
  Object.assign(address, req.body);
  await user.save();
  res.json({ data: user.addresses });
});

const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.account._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) return res.status(404).json({ message: 'Không tìm thấy địa chỉ' });
  address.deleteOne();
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
  deleteAddress,
  getAllCustomers,
  toggleCustomerActive
};
