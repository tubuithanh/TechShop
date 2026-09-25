const slugify = require('slugify');
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');

const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ name: 1 });
  res.json({ data: categories });
});

// Dùng chung 1 hàm tạo slug cho cả tạo mới và cập nhật - trước đây updateCategory thiếu tuỳ chọn
// "remove" so với createCategory, khiến đổi tên 1 danh mục có thể ra slug khác dạng (giữ dấu câu)
// so với tạo mới danh mục cùng tên đó.
function buildCategorySlug(name) {
  return slugify(name, { lower: true, locale: 'vi', remove: /[:?!,.;'"()]/g });
}

const createCategory = asyncHandler(async (req, res) => {
  const { name, image } = req.body;
  const slug = buildCategorySlug(name);
  try {
    const category = await Category.create({ name, image, slug });
    res.status(201).json({ data: category });
  } catch (err) {
    // slug là unique - 2 tên khác nhau có thể trùng slug sau khi chuẩn hoá (VD: bỏ dấu câu)
    if (err.code === 11000) return res.status(409).json({ message: 'Tên danh mục đã tồn tại' });
    throw err;
  }
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
  Object.assign(category, req.body);
  if (req.body.name) category.slug = buildCategorySlug(req.body.name);
  try {
    await category.save();
    res.json({ data: category });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Tên danh mục đã tồn tại' });
    throw err;
  }
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
  await category.deleteOne();
  res.json({ message: 'Đã xóa danh mục' });
});

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
