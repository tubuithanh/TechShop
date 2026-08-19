const slugify = require('slugify');
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');

const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ name: 1 });
  res.json({ data: categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, image } = req.body;
  const slug = slugify(name, { lower: true, locale: 'vi', remove: /[:?!,.;'"()]/g });
  const category = await Category.create({ name, image, slug });
  res.status(201).json({ data: category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
  Object.assign(category, req.body);
  if (req.body.name) category.slug = slugify(req.body.name, { lower: true, locale: 'vi' });
  await category.save();
  res.json({ data: category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
  await category.deleteOne();
  res.json({ message: 'Đã xóa danh mục' });
});

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
