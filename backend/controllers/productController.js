const slugify = require('slugify');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/products
const getProducts = asyncHandler(async (req, res) => {
  const { keyword, categoryId, brandId, minPrice, maxPrice, sort = 'newest', cursor, limit = 12 } = req.query;

  const filter = { isActive: true };
  if (keyword) filter.$text = { $search: keyword };
  if (categoryId) filter.categoryId = categoryId;
  if (brandId) filter.brandId = { $in: brandId.split(',') };
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (cursor) filter._id = { $lt: cursor };

  const sortMap = {
    newest: { _id: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    best_selling: { soldCount: -1 },
    top_rated: { ratingAverage: -1 }
  };

  const products = await Product.find(filter)
    .populate('categoryId', 'name slug')
    .populate('brandId', 'name image')
    .sort(sortMap[sort] || sortMap.newest)
    .limit(Number(limit));

  const nextCursor = products.length === Number(limit) ? products[products.length - 1]._id : null;
  res.json({ data: products, nextCursor });
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
  const products = await Product.find({ _id: { $in: ids } });
  res.json({ data: products });
});

// ---------- ADMIN ----------

const createProduct = asyncHandler(async (req, res) => {
  const body = req.body;
  const slug = slugify(body.title, { lower: true, locale: 'vi' }) + '-' + Date.now().toString().slice(-5);
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
