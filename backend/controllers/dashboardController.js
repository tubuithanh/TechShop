const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

// Tài khoản quản lý chi nhánh (staff gắn storeId) chỉ thấy số liệu đơn hàng/doanh thu của CHI NHÁNH MÌNH
function storeMatch(req) {
  const storeId = getScopedStoreId(req);
  return storeId ? { storeId: new mongoose.Types.ObjectId(storeId) } : {};
}

const getSummary = asyncHandler(async (req, res) => {
  const [totalOrders, totalCustomers, totalProducts, revenueAgg] = await Promise.all([
    Order.countDocuments(storeMatch(req)),
    User.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Order.aggregate([
      { $match: { status: 'delivered', ...storeMatch(req) } },
      { $group: { _id: null, totalRevenue: { $sum: '$grandTotal' } } }
    ])
  ]);

  res.json({
    data: {
      totalOrders,
      totalCustomers,
      totalProducts,
      totalRevenue: revenueAgg[0]?.totalRevenue || 0
    }
  });
});

const getRevenueByDay = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 7;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const data = await Order.aggregate([
    { $match: { createdAt: { $gte: fromDate }, status: { $ne: 'cancelled' }, ...storeMatch(req) } },
    {
      $group: {
        // Không truyền timezone, $dateToString mặc định gộp theo ngày UTC - đơn đặt buổi tối giờ
        // Việt Nam (UTC+7) sẽ bị gộp nhầm sang ngày hôm sau trên biểu đồ doanh thu.
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
        revenue: { $sum: '$grandTotal' },
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({ data });
});

const getBestSellingProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 5;
  const products = await Product.find({ isActive: true })
    .sort({ soldCount: -1 })
    .limit(limit)
    .select('title featuredImage soldCount price ratingAverage');
  res.json({ data: products });
});

const getOrderStatusStats = asyncHandler(async (req, res) => {
  const stats = await Order.aggregate([
    { $match: storeMatch(req) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json({ data: stats });
});

// Thống kê doanh thu THEO TỪNG CỬA HÀNG (mô hình multi-store)
const getRevenueByStore = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    { $match: { status: 'delivered', ...storeMatch(req) } },
    { $group: { _id: '$storeId', revenue: { $sum: '$grandTotal' }, orderCount: { $sum: 1 } } },
    { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
    // preserveNullAndEmptyArrays: true - nếu cửa hàng đã bị xoá hẳn khỏi database (không phải chỉ
    // ẩn/isActive=false), $unwind mặc định sẽ loại bỏ luôn dòng doanh thu đó, làm giảm tổng doanh
    // thu hiển thị so với thẻ tổng quan (không lọc theo cửa hàng còn tồn tại hay không).
    { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
    { $sort: { revenue: -1 } }
  ]);
  res.json({ data });
});

module.exports = { getSummary, getRevenueByDay, getBestSellingProducts, getOrderStatusStats, getRevenueByStore };
