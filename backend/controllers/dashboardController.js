const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

const getSummary = asyncHandler(async (req, res) => {
  const [totalOrders, totalCustomers, totalProducts, revenueAgg] = await Promise.all([
    Order.countDocuments(),
    User.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Order.aggregate([
      { $match: { status: 'delivered' } },
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
    { $match: { createdAt: { $gte: fromDate }, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
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
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json({ data: stats });
});

// Thống kê doanh thu THEO TỪNG CỬA HÀNG (mô hình multi-store)
const getRevenueByStore = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    { $match: { status: 'delivered' } },
    { $group: { _id: '$storeId', revenue: { $sum: '$grandTotal' }, orderCount: { $sum: 1 } } },
    { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
    { $unwind: '$store' },
    { $sort: { revenue: -1 } }
  ]);
  res.json({ data });
});

module.exports = { getSummary, getRevenueByDay, getBestSellingProducts, getOrderStatusStats, getRevenueByStore };
