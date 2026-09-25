const Brand = require('../models/Brand');
const asyncHandler = require('../utils/asyncHandler');

const getBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find().sort({ name: 1 });
  res.json({ data: brands });
});

// Brand không có ràng buộc unique trên "name" ở tầng schema (không giống Category có slug unique) -
// kiểm tra trùng tên (không phân biệt hoa/thường) ở tầng controller để tránh 2 nhãn hàng trùng tên.
async function findDuplicateBrandName(name, excludeId) {
  if (!name) return null;
  const filter = { name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
  if (excludeId) filter._id = { $ne: excludeId };
  return Brand.findOne(filter);
}

const createBrand = asyncHandler(async (req, res) => {
  if (await findDuplicateBrandName(req.body.name)) {
    return res.status(409).json({ message: 'Tên nhãn hàng đã tồn tại' });
  }
  const brand = await Brand.create(req.body);
  res.status(201).json({ data: brand });
});

const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) return res.status(404).json({ message: 'Không tìm thấy nhãn hàng' });
  if (req.body.name && (await findDuplicateBrandName(req.body.name, brand._id))) {
    return res.status(409).json({ message: 'Tên nhãn hàng đã tồn tại' });
  }
  Object.assign(brand, req.body);
  await brand.save();
  res.json({ data: brand });
});

const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) return res.status(404).json({ message: 'Không tìm thấy nhãn hàng' });
  await brand.deleteOne();
  res.json({ message: 'Đã xóa nhãn hàng' });
});

module.exports = { getBrands, createBrand, updateBrand, deleteBrand };
