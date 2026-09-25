const slugify = require('slugify');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');
const { NUMERIC_KEYS } = require('../utils/specNumbers');

// @route GET /api/products
// (params `page` + `limit`: phân trang kiểu số trang, dùng cho trang quản trị;
//  param `cursor` + `limit`: phân trang kiểu cursor, dùng cho trang danh sách sản phẩm phía khách hàng.
//  param `includeInactive=true`: cho phép trang quản trị thấy cả sản phẩm đã ẩn (isActive=false))
const getProducts = asyncHandler(async (req, res) => {
  const {
    keyword,
    categoryId,
    brandId,
    minPrice,
    maxPrice,
    specFilters,
    sort = 'newest',
    cursor,
    page,
    limit = 12,
    includeInactive
  } = req.query;

  const filter = includeInactive === 'true' ? {} : { isActive: true };
  if (keyword) filter.$text = { $search: keyword };
  if (categoryId) filter.categoryId = categoryId;
  if (brandId) filter.brandId = { $in: brandId.split(',') };
  // Lọc/sắp xếp theo effectivePrice (giá THẬT khách trả = salePrice||price), không phải "price"
  // (giá gốc trước khuyến mãi) - nếu không, sản phẩm đang giảm giá sâu có thể bị loại khỏi kết quả
  // lọc theo ngân sách của khách dù giá thực tế vẫn nằm trong khoảng đó.
  if (minPrice || maxPrice) {
    filter.effectivePrice = {};
    if (minPrice) filter.effectivePrice.$gte = Number(minPrice);
    if (maxPrice) filter.effectivePrice.$lte = Number(maxPrice);
  }

  // Lọc theo thông số dạng số: specFilters=[{"key":"RAM","min":8},{"key":"Pin","min":5000}]. Chỉ
  // chấp nhận khóa nằm trong NUMERIC_KEYS và min/max là số hữu hạn - khóa được ghép vào đường dẫn
  // truy vấn Mongo (specNumbers.<key>) nên KHÔNG được để client truyền khóa tùy ý.
  if (specFilters) {
    let parsed;
    try {
      parsed = JSON.parse(specFilters);
    } catch {
      return res.status(400).json({ message: 'Bộ lọc thông số không hợp lệ' });
    }
    if (!Array.isArray(parsed)) return res.status(400).json({ message: 'Bộ lọc thông số không hợp lệ' });
    for (const f of parsed) {
      if (!f || !NUMERIC_KEYS.has(f.key)) continue;
      const range = {};
      if (f.min !== undefined && f.min !== '' && Number.isFinite(Number(f.min))) range.$gte = Number(f.min);
      if (f.max !== undefined && f.max !== '' && Number.isFinite(Number(f.max))) range.$lte = Number(f.max);
      if (Object.keys(range).length) filter[`specNumbers.${f.key}`] = range;
    }
  }

  // Trường sắp xếp chính của từng chế độ sort, kèm _id làm tiêu chí phụ để đảm bảo
  // thứ tự ổn định (nhiều sản phẩm có thể trùng price/soldCount/ratingAverage)
  const sortFieldMap = {
    newest: null, // chỉ sort theo _id
    price_asc: { field: 'effectivePrice', dir: 1 },
    price_desc: { field: 'effectivePrice', dir: -1 },
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
  // specTemplate: để trang chi tiết hiển thị thông số theo nhóm, đúng thứ tự của danh mục
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('categoryId', 'name slug specTemplate')
    .populate('brandId', 'name image');
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

  // Lấy tồn kho theo từng cửa hàng (mô hình multi-store) - lọc bỏ cửa hàng đã ngừng hoạt động
  // (isActive=false): trước đây vẫn hiện trong danh sách chọn cửa hàng và cộng cả vào totalStock,
  // khiến khách có thể "mua" ở 1 cửa hàng đã đóng cửa.
  const inventoriesRaw = await StoreInventory.find({ productId: product._id }).populate({
    path: 'storeId',
    match: { isActive: true },
    select: 'name city address'
  });
  const inventories = inventoriesRaw.filter((inv) => inv.storeId);
  const totalStock = inventories.reduce((sum, inv) => sum + inv.stock, 0);

  // flattenMaps: specifications là kiểu Map - toObject() mặc định giữ nguyên dạng Map của JS, mà
  // JSON.stringify(Map) luôn ra "{}", nên trước đây tab "Thông số kỹ thuật" luôn trống dù có dữ liệu.
  res.json({ data: { ...product.toObject({ flattenMaps: true }), inventories, totalStock } });
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
  const products = await Product.find({ _id: { $in: ids }, isActive: true }).populate(
    'categoryId',
    'name slug specTemplate'
  );
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

  // Phiên bản bị xóa khỏi danh sách: chỉ cho xóa khi không còn hàng ở bất kỳ cửa hàng nào - nếu không,
  // tồn kho đó "mồ côi" (trỏ tới phiên bản không còn tồn tại). Muốn ngừng bán thì tắt isActive.
  // Phiên bản giữ lại PHẢI gửi kèm _id cũ, nếu không sẽ bị coi là xóa + tạo mới (mất liên kết tồn kho).
  let removedIds = [];
  if (Array.isArray(req.body.variants)) {
    const keptIds = new Set(req.body.variants.filter((v) => v._id).map((v) => String(v._id)));
    removedIds = product.variants.filter((v) => !keptIds.has(String(v._id))).map((v) => v._id);
    if (removedIds.length) {
      const stocked = await StoreInventory.countDocuments({ productId: product._id, variantId: { $in: removedIds }, stock: { $gt: 0 } });
      if (stocked > 0) {
        return res.status(400).json({
          message: 'Không thể xóa phiên bản còn hàng trong kho - hãy tắt "Đang bán" của phiên bản đó thay vì xóa'
        });
      }
    }
  }

  Object.assign(product, req.body);
  await product.save();
  if (removedIds.length) await StoreInventory.deleteMany({ productId: product._id, variantId: { $in: removedIds } });
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
