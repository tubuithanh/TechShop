const slugify = require('slugify');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/products
// (params `page` + `limit`: phân trang kiểu số trang, dùng cho trang quản trị;
//  param `cursor` + `limit`: phân trang kiểu cursor, dùng cho trang danh sách sản phẩm phía khách hàng.
//  param `includeInactive=true`: cho phép trang quản trị thấy cả sản phẩm đã ẩn (isActive=false))
const getProducts = asyncHandler(async (req, res) => {
  const { keyword, categoryId, brandId, minPrice, maxPrice, sort = 'newest', cursor, page, limit = 12, includeInactive } =
    req.query;

  const filter = includeInactive === 'true' ? {} : { isActive: true };
  if (keyword) filter.$text = { $search: keyword };
  if (categoryId) filter.categoryId = categoryId;
  if (brandId) filter.brandId = { $in: brandId.split(',') };
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  // Trường sắp xếp chính của từng chế độ sort, kèm _id làm tiêu chí phụ để đảm bảo
  // thứ tự ổn định (nhiều sản phẩm có thể trùng price/soldCount/ratingAverage)
  const sortFieldMap = {
    newest: null, // chỉ sort theo _id
    price_asc: { field: 'price', dir: 1 },
    price_desc: { field: 'price', dir: -1 },
    best_selling: { field: 'soldCount', dir: -1 },
    top_rated: { field: 'ratingAverage', dir: -1 }
  };
  const sortConfig = sortFieldMap[sort] !== undefined ? sortFieldMap[sort] : sortFieldMap.newest;
  const sortMap = sortConfig
    ? { [sortConfig.field]: sortConfig.dir, _id: -1 }
    : { _id: -1 };

  // Đếm tổng số sản phẩm khớp bộ lọc THỰC (chưa cộng thêm điều kiện cursor) để trả về
  // total/totalPages cho giao diện phân trang kiểu số trang (trang quản trị).
  const total = await Product.countDocuments(filter);

  if (!page && cursor) {
    try {
      const { v, id } = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (sortConfig) {
        const cmpOp = sortConfig.dir === 1 ? '$gt' : '$lt';
        filter.$or = [
          { [sortConfig.field]: { [cmpOp]: v } },
          { [sortConfig.field]: v, _id: { $lt: id } }
        ];
      } else {
        filter._id = { $lt: id };
      }
    } catch {
      // cursor không hợp lệ, bỏ qua và trả về từ đầu danh sách
    }
  }

  let query = Product.find(filter)
    .populate('categoryId', 'name slug')
    .populate('brandId', 'name image')
    .sort(sortMap)
    .limit(Number(limit));
  if (page) query = query.skip((Number(page) - 1) * Number(limit));

  const products = await query;

  const last = products[products.length - 1];
  const nextCursor =
    !page && products.length === Number(limit) && last
      ? Buffer.from(JSON.stringify({ v: sortConfig ? last[sortConfig.field] : undefined, id: last._id })).toString('base64')
      : null;
  res.json({
    data: products,
    nextCursor,
    total,
    page: page ? Number(page) : undefined,
    totalPages: page ? Math.ceil(total / Number(limit)) : undefined
  });
});

// @route GET /api/products/:slug
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('categoryId', 'name slug')
    .populate('brandId', 'name image');
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

  // Lấy tồn kho theo từng cửa hàng (mô hình multi-store)
  const inventories = await StoreInventory.find({ productId: product._id }).populate('storeId', 'name city address');
  const totalStock = inventories.reduce((sum, inv) => sum + inv.stock, 0);

  res.json({ data: { ...product.toObject(), inventories, totalStock } });
});

// @route GET /api/products/:id/related
const getRelatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

  const related = await Product.find({
    _id: { $ne: product._id },
    categoryId: product.categoryId,
    isActive: true
  }).limit(8);
  res.json({ data: related });
});

// @route POST /api/products/compare
const compareProducts = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length < 2) {
    return res.status(400).json({ message: 'Cần chọn tối thiểu 2 sản phẩm để so sánh' });
  }
  const products = await Product.find({ _id: { $in: ids }, isActive: true });
  res.json({ data: products });
});

// ---------- ADMIN ----------

const createProduct = asyncHandler(async (req, res) => {
  const body = req.body;
  const slug = slugify(body.title, { lower: true, locale: 'vi', remove: /[:?!,.;'"()]/g }) + '-' + Date.now().toString().slice(-5);
  const product = await Product.create({ ...body, slug });
  res.status(201).json({ data: product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  Object.assign(product, req.body);
  await product.save();
  res.json({ data: product });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  product.isActive = false;
  await product.save();
  res.json({ message: 'Đã ẩn sản phẩm khỏi cửa hàng' });
});

module.exports = {
  getProducts,
  getProductBySlug,
  getRelatedProducts,
  compareProducts,
  createProduct,
  updateProduct,
  deleteProduct
};
