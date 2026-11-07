const mongoose = require('mongoose');
const Province = require('../models/Province');
const Ward = require('../models/Ward');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');
const { seedDefaultLocations } = require('../utils/seedLocations');

const toBool = (v) => v === true || v === 'true';
const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// ===== Công khai: dùng cho form địa chỉ (đăng ký, thanh toán, sổ địa chỉ) =====

// GET /api/locations/provinces - các tỉnh/thành đang dùng
const getProvinces = asyncHandler(async (req, res) => {
  const data = await Province.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).select('name code').lean();
  res.json({ data });
});

// GET /api/locations/wards?province=<id hoặc tên>&q=<từ khóa>
// Mỗi tỉnh chỉ vài chục - vài trăm phường/xã -> trả hết để giao diện lọc tức thì khi gõ;
// có q thì lọc sẵn ở máy chủ (không dấu).
const getWards = asyncHandler(async (req, res) => {
  const key = typeof req.query.province === 'string' ? req.query.province.trim() : '';
  if (!key) return res.json({ data: [] });
  const province = await Province.findOne(
    mongoose.isValidObjectId(key) ? { _id: key, isActive: true } : { name: key, isActive: true }
  ).lean();
  if (!province) return res.json({ data: [] });
  const filter = { provinceId: province._id, isActive: true, ...(searchFilter(req.query.q) || {}) };
  const data = await Ward.find(filter).sort({ name: 1 }).select('name code').lean();
  res.json({ data });
});

// ===== Quản trị (admin) =====

// GET /api/locations/admin/provinces - mọi tỉnh kèm số phường/xã
const adminGetProvinces = asyncHandler(async (req, res) => {
  const [provinces, counts] = await Promise.all([
    Province.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Ward.aggregate([
      { $group: { _id: '$provinceId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
    ])
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  res.json({
    data: provinces.map((p) => ({
      ...p,
      wardCount: byId.get(String(p._id))?.total || 0,
      activeWardCount: byId.get(String(p._id))?.active || 0
    }))
  });
});

const createProvince = asyncHandler(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên tỉnh/thành phố' });
  if (await Province.exists({ name })) return res.status(400).json({ message: 'Tỉnh/thành phố này đã tồn tại' });
  const sortOrder = Number(req.body.sortOrder) || (await Province.countDocuments()) + 1;
  const province = await Province.create({ name, sortOrder, isActive: req.body.isActive !== false });
  res.status(201).json({ data: province });
});

const updateProvince = asyncHandler(async (req, res) => {
  const province = await Province.findById(req.params.id);
  if (!province) return res.status(404).json({ message: 'Không tìm thấy tỉnh/thành phố' });
  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên tỉnh/thành phố' });
    if (await Province.exists({ name, _id: { $ne: province._id } })) {
      return res.status(400).json({ message: 'Tỉnh/thành phố này đã tồn tại' });
    }
    province.name = name;
  }
  if (req.body.sortOrder !== undefined) province.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) province.isActive = toBool(req.body.isActive);
  await province.save();
  res.json({ data: province });
});

// Xóa tỉnh xóa luôn các phường/xã của tỉnh đó. Địa chỉ/đơn hàng cũ lưu TÊN nên không bị ảnh hưởng.
const deleteProvince = asyncHandler(async (req, res) => {
  const province = await Province.findByIdAndDelete(req.params.id);
  if (!province) return res.status(404).json({ message: 'Không tìm thấy tỉnh/thành phố' });
  const { deletedCount } = await Ward.deleteMany({ provinceId: province._id });
  res.json({ message: `Đã xóa ${province.name} và ${deletedCount} phường/xã` });
});

// GET /api/locations/admin/wards?provinceId=&q=&isActive=&page=&limit=
const adminGetWards = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 20);
  const filter = { ...(searchFilter(req.query.q) || {}) };
  if (typeof req.query.provinceId === 'string' && mongoose.isValidObjectId(req.query.provinceId)) {
    filter.provinceId = req.query.provinceId;
  }
  if (req.query.isActive === 'true' || req.query.isActive === 'false') filter.isActive = req.query.isActive === 'true';
  const [data, total] = await Promise.all([
    Ward.find(filter)
      .populate('provinceId', 'name')
      .sort({ provinceId: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Ward.countDocuments(filter)
  ]);
  res.json({ data, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

const createWard = asyncHandler(async (req, res) => {
  const name = cleanName(req.body.name);
  const { provinceId } = req.body;
  if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên phường/xã' });
  if (!mongoose.isValidObjectId(provinceId) || !(await Province.exists({ _id: provinceId }))) {
    return res.status(400).json({ message: 'Vui lòng chọn tỉnh/thành phố' });
  }
  if (await Ward.exists({ provinceId, name })) return res.status(400).json({ message: 'Phường/xã này đã có trong tỉnh' });
  const ward = await Ward.create({ provinceId, name, isActive: req.body.isActive !== false });
  res.status(201).json({ data: ward });
});

const updateWard = asyncHandler(async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  if (!ward) return res.status(404).json({ message: 'Không tìm thấy phường/xã' });
  if (req.body.provinceId !== undefined) {
    if (!mongoose.isValidObjectId(req.body.provinceId) || !(await Province.exists({ _id: req.body.provinceId }))) {
      return res.status(400).json({ message: 'Tỉnh/thành phố không hợp lệ' });
    }
    ward.provinceId = req.body.provinceId;
  }
  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên phường/xã' });
    ward.name = name;
  }
  if (req.body.isActive !== undefined) ward.isActive = toBool(req.body.isActive);
  if (await Ward.exists({ provinceId: ward.provinceId, name: ward.name, _id: { $ne: ward._id } })) {
    return res.status(400).json({ message: 'Phường/xã này đã có trong tỉnh' });
  }
  await ward.save();
  res.json({ data: ward });
});

const deleteWard = asyncHandler(async (req, res) => {
  const ward = await Ward.findByIdAndDelete(req.params.id);
  if (!ward) return res.status(404).json({ message: 'Không tìm thấy phường/xã' });
  res.json({ message: `Đã xóa ${ward.name}` });
});

// POST /api/locations/admin/seed-default - bổ sung dữ liệu mặc định còn thiếu (không ghi đè chỉnh sửa của admin)
const seedDefault = asyncHandler(async (req, res) => {
  const added = await seedDefaultLocations();
  res.json({ message: `Đã bổ sung ${added.provinces} tỉnh/thành và ${added.wards} phường/xã`, ...added });
});

module.exports = {
  getProvinces,
  getWards,
  adminGetProvinces,
  createProvince,
  updateProvince,
  deleteProvince,
  adminGetWards,
  createWard,
  updateWard,
  deleteWard,
  seedDefault
};
