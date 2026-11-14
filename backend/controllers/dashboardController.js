const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

// Số nguyên trong khoảng [min, max]; không hợp lệ thì dùng giá trị mặc định
const clampInt = (v, def, min, max) => { // số nguyên trong khoảng, sai thì mặc định
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};

// Tài khoản quản lý chi nhánh (staff gắn storeId) chỉ thấy số liệu đơn hàng/doanh thu của CHI NHÁNH MÌNH
function storeMatch(req) {
  const storeId = getScopedStoreId(req);
  return storeId ? { storeId: new mongoose.Types.ObjectId(storeId) } : {}; // nhân viên: chỉ chi nhánh mình
}

const getSummary = asyncHandler(async (req, res) => {
  const [totalOrders, totalCustomers, totalProducts, revenueAgg] = await Promise.all([
    Order.countDocuments(storeMatch(req)), // tổng số đơn
    User.countDocuments(), // tổng số khách hàng
    Product.countDocuments({ isActive: true }), // sản phẩm đang bán
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
  const days = clampInt(req.query.days, 7, 1, 365); // mặc định 7 ngày, tối đa 365
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days); // mốc bắt đầu

  // Số đơn: mọi đơn đặt trong ngày trừ đơn đã hủy / trả hàng. Doanh thu: CHỈ đơn đã giao (giống tổng doanh thu
  // ở getSummary) - trước đây cộng cả đơn chờ thanh toán, đơn trả hàng nên tổng các ngày lệch với tổng doanh thu.
  const data = await Order.aggregate([
    { $match: { createdAt: { $gte: fromDate }, status: { $nin: ['cancelled', 'returned'] }, ...storeMatch(req) } },
    {
      $group: {
        // Không truyền timezone, $dateToString mặc định gộp theo ngày UTC - đơn đặt buổi tối giờ
        // Việt Nam (UTC+7) sẽ bị gộp nhầm sang ngày hôm sau trên biểu đồ doanh thu.
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$grandTotal', 0] } },
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({ data });
});

const getBestSellingProducts = asyncHandler(async (req, res) => {
  const limit = clampInt(req.query.limit, 5, 1, 50); // top 5, tối đa 50
  const scoped = storeMatch(req);
  if (!scoped.storeId) { // admin: dùng số "đã bán" toàn hệ thống
    const products = await Product.find({ isActive: true })
      .sort({ soldCount: -1 })
      .limit(limit)
      .select('title featuredImage soldCount price ratingAverage');
    return res.json({ data: products });
  }
  // Quản lý chi nhánh: số bán của RIÊNG chi nhánh mình (từ đơn đã giao), không phải soldCount toàn hệ thống
  const data = await Order.aggregate([
    { $match: { status: 'delivered', ...scoped } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', soldCount: { $sum: '$items.quantity' } } },
    { $sort: { soldCount: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } }, // nối thông tin sản phẩm
    { $unwind: '$p' },
    { $project: { title: '$p.title', featuredImage: '$p.featuredImage', price: '$p.price', ratingAverage: '$p.ratingAverage', soldCount: 1 } }
  ]);
  res.json({ data });
});

const getOrderStatusStats = asyncHandler(async (req, res) => {
  const stats = await Order.aggregate([
    { $match: storeMatch(req) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json({ data: stats });
});

// Khoảng thời gian theo GIỜ VIỆT NAM (+07:00): cả năm (month trống) hoặc 1 tháng của năm đó
function vnRange(year, month) {
  const pad = (n) => String(n).padStart(2, '0'); // 3 -> "03"
  if (!month) {
    return { $gte: new Date(`${year}-01-01T00:00:00+07:00`), $lt: new Date(`${year + 1}-01-01T00:00:00+07:00`) };
  }
  const nextY = month === 12 ? year + 1 : year; // tháng 12 -> sang năm sau
  const nextM = month === 12 ? 1 : month + 1;
  return {
    $gte: new Date(`${year}-${pad(month)}-01T00:00:00+07:00`),
    $lt: new Date(`${nextY}-${pad(nextM)}-01T00:00:00+07:00`)
  };
}

// Doanh thu 12 tháng của 1 năm (mặc định năm nay). Doanh thu chỉ tính đơn ĐÃ GIAO (giống getSummary);
// số đơn tính mọi đơn trừ đơn hủy / trả hàng. Trả đủ 12 phần tử (tháng không có đơn = 0) để biểu đồ liền mạch.
const getRevenueByMonth = asyncHandler(async (req, res) => {
  const year = clampInt(req.query.year, new Date().getFullYear(), 2000, 2100);
  const rows = await Order.aggregate([
    { $match: { createdAt: vnRange(year), status: { $nin: ['cancelled', 'returned'] }, ...storeMatch(req) } },
    {
      $group: {
        _id: { $month: { date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, // tháng theo giờ VN
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$grandTotal', 0] } },
        orderCount: { $sum: 1 }
      }
    }
  ]);
  const byMonth = new Map(rows.map((r) => [r._id, r]));
  const data = Array.from({ length: 12 }, (_, i) => ({ // đủ 12 tháng (tháng trống = 0)
    month: i + 1,
    revenue: byMonth.get(i + 1)?.revenue || 0,
    orderCount: byMonth.get(i + 1)?.orderCount || 0
  }));
  res.json({ data, year });
});

// Thống kê doanh thu THEO TỪNG CỬA HÀNG (mô hình multi-store). Lọc tùy chọn: ?year=2026 (cả năm)
// hoặc ?year=2026&month=3 (1 tháng); không truyền year = cộng dồn toàn thời gian như trước.
const getRevenueByStore = asyncHandler(async (req, res) => {
  const match = { status: 'delivered', ...storeMatch(req) }; // doanh thu = đơn đã giao
  if (req.query.year) {
    const year = clampInt(req.query.year, new Date().getFullYear(), 2000, 2100);
    const month = req.query.month ? clampInt(req.query.month, 1, 1, 12) : null;
    match.createdAt = vnRange(year, month);
  }
  const data = await Order.aggregate([
    { $match: match },
    { $group: { _id: '$storeId', revenue: { $sum: '$grandTotal' }, orderCount: { $sum: 1 } } }, // cộng theo chi nhánh
    { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } }, // nối tên chi nhánh
    // preserveNullAndEmptyArrays: true - nếu cửa hàng đã bị xoá hẳn khỏi database (không phải chỉ
    // ẩn/isActive=false), $unwind mặc định sẽ loại bỏ luôn dòng doanh thu đó, làm giảm tổng doanh
    // thu hiển thị so với thẻ tổng quan (không lọc theo cửa hàng còn tồn tại hay không).
    { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
    { $sort: { revenue: -1 } }
  ]);
  res.json({ data });
});

module.exports = { getSummary, getRevenueByDay, getRevenueByMonth,getBestSellingProducts, getOrderStatusStats, getRevenueByStore };
