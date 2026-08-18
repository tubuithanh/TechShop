const Brand = require('../models/Brand');
const asyncHandler = require('../utils/asyncHandler');

const getBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find().sort({ name: 1 });
  res.json({ data: brands });
});

const createBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json({ data: brand });
});

const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) return res.status(404).json({ message: 'Không tìm thấy nhãn hàng' });
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
