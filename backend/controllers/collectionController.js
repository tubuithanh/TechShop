const ProductCollection = require('../models/ProductCollection');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');

// Sản phẩm bị ẩn/ngừng kinh doanh (isActive=false) không được xoá khỏi productIds khi admin ẩn -
// lọc ngay tại bước populate để bộ sưu tập không hiển thị sản phẩm đã ngừng bán cho khách hàng.
const ACTIVE_PRODUCT_MATCH = { match: { isActive: true }, select: 'title slug featuredImage price salePrice effectivePrice' };

const getCollections = asyncHandler(async (req, res) => {
  const collections = await ProductCollection.find().populate({ path: 'productIds', ...ACTIVE_PRODUCT_MATCH });
  // populate với "match" chỉ lọc field ref, không tự xoá phần tử null khỏi mảng - dọn tay các phần
  // tử null (sản phẩm không còn active hoặc đã bị xoá hẳn) trước khi trả về.
  const cleaned = collections.map((c) => {
    const obj = c.toObject();
    obj.productIds = obj.productIds.filter(Boolean);
    return obj;
  });
  res.json({ data: cleaned });
});

const getCollectionById = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.findById(req.params.id).populate({
    path: 'productIds',
    match: { isActive: true },
    select: 'title slug featuredImage price salePrice effectivePrice ratingAverage'
  });
  if (!collection) return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
  const obj = collection.toObject();
  obj.productIds = obj.productIds.filter(Boolean);
  res.json({ data: obj });
});

// Kiểm tra tất cả productIds gửi lên thực sự tồn tại - trước đây chấp nhận thẳng bất kỳ ID nào từ
// request, có thể tạo tham chiếu treo tới sản phẩm không tồn tại (ID gõ nhầm/sản phẩm đã bị xoá hẳn).
// Trả về true nếu hợp lệ, false nếu có ID không tồn tại.
async function productIdsExist(productIds) {
  if (!Array.isArray(productIds) || !productIds.length) return true;
  const count = await Product.countDocuments({ _id: { $in: productIds } });
  return count === new Set(productIds.map(String)).size;
}

const createCollection = asyncHandler(async (req, res) => {
  if (!(await productIdsExist(req.body.productIds))) {
    return res.status(400).json({ message: 'Một hoặc nhiều sản phẩm trong bộ sưu tập không tồn tại' });
  }
  const collection = await ProductCollection.create(req.body);
  res.status(201).json({ data: collection });
});

const updateCollection = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.findById(req.params.id);
  if (!collection) return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
  if (!(await productIdsExist(req.body.productIds))) {
    return res.status(400).json({ message: 'Một hoặc nhiều sản phẩm trong bộ sưu tập không tồn tại' });
  }
  Object.assign(collection, req.body);
  await collection.save();
  res.json({ data: collection });
});

const deleteCollection = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.findById(req.params.id);
  if (!collection) return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
  await collection.deleteOne();
  res.json({ message: 'Đã xóa bộ sưu tập' });
});

module.exports = { getCollections, getCollectionById, createCollection, updateCollection, deleteCollection };
