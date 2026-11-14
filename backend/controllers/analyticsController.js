// Trang "Phân tích" (Admin): mọi số liệu tính từ đơn hàng trong 1 khoảng thời gian + (tùy chọn) 1 chi nhánh.
// Quy ước giống Dashboard:
//  - Doanh thu: CHỈ đơn đã giao (status = delivered).
//  - Số đơn: mọi đơn trừ đơn đã hủy / trả hàng.
//  - Ngày/tháng/giờ tính theo GIỜ VIỆT NAM.
//  - Quản lý chi nhánh (staff gắn storeId) luôn bị khóa vào chi nhánh mình, bỏ qua ?storeId gửi lên.
const mongoose = require('mongoose');
const Order = require('../models/Order');
const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86400000;
const NOT_CANCELLED = { $nin: ['cancelled', 'returned'] }; // đơn hợp lệ (không hủy / trả)
const PRICE_BUCKETS = [0, 5000000, 10000000, 20000000, 40000000]; // mốc phân khúc giá
const PRICE_LABELS = ['Dưới 5 triệu', '5 - 10 triệu', '10 - 20 triệu', '20 - 40 triệu', 'Trên 40 triệu'];

// 'YYYY-MM-DD' -> mốc 00:00 giờ Việt Nam của ngày đó; sai định dạng -> null
function vnDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; // chỉ nhận YYYY-MM-DD
  const d = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Khoảng [from, to) - mặc định 12 tháng gần nhất (từ ngày 1 của tháng cách đây 11 tháng tới hết hôm nay)
function parseRange(query) {
  const todayVN = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // hôm nay theo giờ VN
  const to = new Date((vnDate(query.to) || vnDate(todayVN)).getTime() + DAY); // tới hết ngày "to"
  let from = vnDate(query.from);
  if (!from) {
    const [y, m] = todayVN.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1 - 11, 1)); // ngày 1 của tháng cách đây 11 tháng
    from = vnDate(start.toISOString().slice(0, 10));
  }
  if (from >= to) from = new Date(to.getTime() - DAY);
  // Giới hạn 5 năm để 1 truy vấn không quét quá nhiều dữ liệu
  if (to - from > 5 * 366 * DAY) from = new Date(to.getTime() - 5 * 366 * DAY); // tối đa 5 năm
  return { from, to };
}

function storeFilter(req) {
  const scoped = getScopedStoreId(req);
  const id = scoped || req.query.storeId; // nhân viên: luôn chi nhánh mình
  return id && mongoose.isValidObjectId(id) ? { storeId: new mongoose.Types.ObjectId(String(id)) } : {};
}

const monthKey = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: TZ } }; // khóa tháng YYYY-MM (giờ VN)
const deliveredRevenue = { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$grandTotal', 0] } }; // doanh thu = đơn đã giao
const deliveredCount = { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } };
// Doanh thu của 1 dòng hàng (sau khi đã $unwind items) = đơn giá × số lượng - phần giảm giá phân bổ cho dòng
const lineRevenue = { // doanh thu 1 dòng hàng sau giảm giá
  $subtract: [{ $multiply: ['$items.unitPrice', '$items.quantity'] }, { $ifNull: ['$items.discountAmount', 0] }]
};

// Tổng quan 1 khoảng thời gian (dùng cho so sánh cùng kỳ)
async function periodTotals(store, from, to) {
  const [row] = await Order.aggregate([
    { $match: { ...store, createdAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        revenue: deliveredRevenue,
        delivered: deliveredCount,
        orders: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, 1] } },
        cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 1, 0] } },
        total: { $sum: 1 }
      }
    }
  ]);
  const r = row || { revenue: 0, delivered: 0, orders: 0, cancelled: 0, total: 0 };
  return {
    revenue: r.revenue,
    orders: r.orders,
    aov: r.delivered ? Math.round(r.revenue / r.delivered) : 0, // giá trị trung bình 1 đơn
    cancelRate: r.total ? Math.round((r.cancelled / r.total) * 1000) / 10 : 0 // % hủy / trả
  };
}

// Doanh thu theo danh mục / thương hiệu (theo từng dòng hàng của đơn đã giao)
function groupByProductField(match, field, collection, limit) {
  return Order.aggregate([
    { $match: { ...match, status: 'delivered' } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p', pipeline: [{ $project: { categoryId: 1, brandId: 1 } }] } }, // danh mục / thương hiệu của sản phẩm
    { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } }, // sản phẩm đã xóa vẫn giữ dòng (nhóm "Khác")
    { $group: { _id: `$p.${field}`, revenue: { $sum: lineRevenue }, quantity: { $sum: '$items.quantity' } } }, // cộng theo danh mục / thương hiệu
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: collection, localField: '_id', foreignField: '_id', as: 'ref', pipeline: [{ $project: { name: 1 } }] } },
    { $project: { _id: 0, id: '$_id', name: { $ifNull: [{ $first: '$ref.name' }, 'Khác'] }, revenue: 1, quantity: 1 } }
  ]);
}

const getAnalytics = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const store = storeFilter(req);
  const match = { ...store, createdAt: { $gte: from, $lt: to } };
  const prevFrom = new Date(from.getTime() - (to - from)); // kỳ trước cùng độ dài

  const [
    current, previous, byCategory, byBrand, monthly, payment, heatmap, priceBuckets,
    vouchers, staff, shippers, topCustomers, provinces, customersInRange, soldByProduct, campaigns
  ] = await Promise.all([
    periodTotals(store, from, to),
    periodTotals(store, prevFrom, from),
    groupByProductField(match, 'categoryId', 'categories', 12),
    groupByProductField(match, 'brandId', 'brands', 10),

    // Theo tháng: doanh thu online / tại quầy, số đơn, AOV, tỷ lệ hủy
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: monthKey,
          online: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'delivered'] }, { $ne: ['$source', 'pos'] }] }, '$grandTotal', 0] } }, // doanh thu online
          pos: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'delivered'] }, { $eq: ['$source', 'pos'] }] }, '$grandTotal', 0] } }, // doanh thu tại quầy
          delivered: deliveredCount,
          orders: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, 1] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    Order.aggregate([
      { $match: { ...match, status: 'delivered' } },
      { $group: { _id: '$paymentMode', revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } }, // theo phương thức thanh toán
      { $sort: { revenue: -1 } }
    ]),

    // Số đơn theo thứ trong tuần (1 = Chủ nhật ... 7 = Thứ bảy) × giờ
    Order.aggregate([
      { $match: { ...match, status: NOT_CANCELLED } },
      {
        $group: {
          _id: { d: { $dayOfWeek: { date: '$createdAt', timezone: TZ } }, h: { $hour: { date: '$createdAt', timezone: TZ } } }, // bản đồ nhiệt thứ × giờ
          count: { $sum: 1 }
        }
      }
    ]),

    // Số lượng bán theo khoảng giá (đơn giá của từng sản phẩm đã bán)
    Order.aggregate([
      { $match: { ...match, status: 'delivered' } },
      { $unwind: '$items' },
      {
        $bucket: { // chia đơn giá vào các khoảng
          groupBy: '$items.unitPrice',
          boundaries: PRICE_BUCKETS,
          default: 'over', // trên 40 triệu
          output: { quantity: { $sum: '$items.quantity' }, revenue: { $sum: lineRevenue } }
        }
      }
    ]),

    Order.aggregate([
      { $match: { ...match, status: 'delivered', voucherCode: { $ne: null } } }, // top 10 mã giảm giá
      { $group: { _id: '$voucherCode', orders: { $sum: 1 }, discount: { $sum: { $ifNull: ['$voucherDiscount', '$discountAmount'] } }, revenue: { $sum: '$grandTotal' } } },
      { $sort: { orders: -1 } },
      { $limit: 10 }
    ]),

    // Nhân viên bán hàng: đơn bán tại quầy do nhân viên đó tạo
    Order.aggregate([
      { $match: { ...match, source: 'pos', createdBy: { $ne: null }, status: NOT_CANCELLED } }, // top 10 nhân viên bán tại quầy
      { $group: { _id: '$createdBy', revenue: deliveredRevenue, orders: { $sum: 1 }, delivered: deliveredCount, nameSnapshot: { $last: '$createdByName' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'a', pipeline: [{ $project: { name: 1 } }] } },
      {
        $project: {
          _id: 0, id: '$_id', revenue: 1, orders: 1,
          name: { $ifNull: [{ $first: '$a.name' }, '$nameSnapshot'] }, // nhân viên đã xóa -> dùng tên lưu trên đơn
          aov: { $cond: [{ $gt: ['$delivered', 0] }, { $round: [{ $divide: ['$revenue', '$delivered'] }, 0] }, 0] }
        }
      }
    ]),

    // Shipper: số đơn được giao, giao thành công, số lần giao thất bại
    Order.aggregate([
      { $match: { ...match, shipperId: { $ne: null } } }, // top 10 shipper
      {
        $group: {
          _id: '$shipperId',
          assigned: { $sum: 1 },
          delivered: deliveredCount,
          failedAttempts: {
            $sum: { $size: { $filter: { input: { $ifNull: ['$deliveryAttempts', []] }, cond: { $eq: ['$$this.result', 'failed'] } } } }
          }
        }
      },
      { $sort: { delivered: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'a', pipeline: [{ $project: { name: 1 } }] } },
      {
        $project: {
          _id: 0, id: '$_id', assigned: 1, delivered: 1, failedAttempts: 1,
          name: { $ifNull: [{ $first: '$a.name' }, 'Đã xóa'] },
          successRate: { $cond: [{ $gt: ['$assigned', 0] }, { $round: [{ $multiply: [{ $divide: ['$delivered', '$assigned'] }, 100] }, 1] }, 0] }
        }
      }
    ]),

    Order.aggregate([
      { $match: { ...match, status: 'delivered', userId: { $ne: null } } },
      { $group: { _id: '$userId', spent: { $sum: '$grandTotal' }, orders: { $sum: 1 }, lastOrderAt: { $max: '$createdAt' } } },
      { $sort: { spent: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { displayName: 1, email: 1, phoneNumber: 1 } }] } },
      {
        $project: {
          _id: 0, id: '$_id', spent: 1, orders: 1, lastOrderAt: 1,
          name: { $ifNull: [{ $first: '$u.displayName' }, 'Khách đã xóa'] },
          email: { $first: '$u.email' },
          phone: { $first: '$u.phoneNumber' }
        }
      }
    ]),

    Order.aggregate([
      { $match: { ...match, status: 'delivered', deliveryMethod: 'home_delivery' } },
      { $group: { _id: { $ifNull: ['$deliveryAddress.city', ''] }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } }, // theo tỉnh / thành nhận hàng
      { $match: { _id: { $ne: '' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]),

    // Khách có đơn trong kỳ, theo tháng (để tách khách mới / khách quay lại)
    Order.aggregate([
      { $match: { ...match, status: NOT_CANCELLED, userId: { $ne: null } } },
      { $group: { _id: { m: monthKey, u: '$userId' } } } // cặp (tháng, khách)
    ]),

    // Số lượng đã bán của từng sản phẩm trong kỳ (cho "sản phẩm bán chậm")
    Order.aggregate([
      { $match: { ...match, status: 'delivered' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', sold: { $sum: '$items.quantity' } } } // số bán từng sản phẩm
    ]),

    // Hiệu quả từng chương trình khuyến mãi tự động (chiến dịch marketing)
    Order.aggregate([
      { $match: { ...match, status: 'delivered', 'promotions.0': { $exists: true } } },
      { $unwind: '$promotions' }, // từng chương trình trong đơn
      {
        $group: {
          _id: '$promotions.promotionId',
          name: { $last: '$promotions.name' },
          campaign: { $last: '$promotions.campaign' },
          orders: { $sum: 1 },
          discount: { $sum: '$promotions.amount' },
          revenue: { $sum: '$grandTotal' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ])
  ]);

  // ----- Khách mới / quay lại: "mới" = đơn đầu tiên (từ trước tới nay, tại phạm vi đang xem) nằm trong tháng đó
  const userIds = [...new Set(customersInRange.map((r) => String(r._id.u)))].map((id) => new mongoose.Types.ObjectId(id)); // khách có đơn trong kỳ
  const firstOrders = userIds.length
    ? await Order.aggregate([
      { $match: { ...store, userId: { $in: userIds }, status: NOT_CANCELLED } },
      { $group: { _id: '$userId', first: { $min: '$createdAt' } } }, // đơn đầu tiên từ trước tới nay
      { $project: { first: { $dateToString: { format: '%Y-%m', date: '$first', timezone: TZ } } } }
    ])
    : [];
  const firstMonth = new Map(firstOrders.map((r) => [String(r._id), r.first]));
  const customerMonths = new Map();
  for (const r of customersInRange) {
    const row = customerMonths.get(r._id.m) || { month: r._id.m, newCustomers: 0, returning: 0 };
    if (firstMonth.get(String(r._id.u)) === r._id.m) row.newCustomers += 1; // tháng có đơn đầu tiên = khách mới
    else row.returning += 1; // còn lại = khách quay lại
    customerMonths.set(r._id.m, row);
  }

  // ----- Sản phẩm bán chậm: còn tồn kho nhiều nhưng bán ít trong kỳ
  const stock = await StoreInventory.aggregate([
    { $match: { ...store, stock: { $gt: 0 } } }, // sản phẩm còn tồn
    { $group: { _id: '$productId', stock: { $sum: '$stock' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $match: { isActive: true } }, { $project: { title: 1, featuredImage: 1, effectivePrice: 1 } }] } },
    { $unwind: '$p' }
  ]);
  const soldMap = new Map(soldByProduct.map((r) => [String(r._id), r.sold]));
  const slowMovers = stock
    .map((s) => ({ id: s._id, title: s.p.title, image: s.p.featuredImage, price: s.p.effectivePrice, stock: s.stock, sold: soldMap.get(String(s._id)) || 0 }))
    .sort((a, b) => a.sold - b.sold || b.stock - a.stock) // bán ít nhất + tồn nhiều nhất lên đầu
    .slice(0, 10);

  // $bucket trả về _id = mốc dưới của mỗi khoảng (0, 5tr, 10tr, 20tr); giá >= 40tr vào nhóm 'over'
  const bucketMap = new Map(priceBuckets.map((b) => [b._id, b])); // mốc dưới -> số liệu
  const bucketKeys = [...PRICE_BUCKETS.slice(0, -1), 'over'];

  res.json({
    data: {
      range: { from, to },
      compare: { current, previous },
      byCategory,
      byBrand,
      monthly: monthly.map((m) => ({
        month: m._id,
        online: m.online,
        pos: m.pos,
        revenue: m.online + m.pos, // tổng doanh thu tháng
        orders: m.orders,
        aov: m.delivered ? Math.round((m.online + m.pos) / m.delivered) : 0,
        cancelled: m.cancelled,
        returned: m.returned,
        cancelRate: m.total ? Math.round(((m.cancelled + m.returned) / m.total) * 1000) / 10 : 0
      })),
      payment: payment.map((p) => ({ mode: p._id, revenue: p.revenue, count: p.count })),
      heatmap: heatmap.map((h) => ({ day: h._id.d, hour: h._id.h, count: h.count })),
      priceBuckets: PRICE_LABELS.map((label, i) => {
        const b = bucketMap.get(bucketKeys[i]);
        return { label, quantity: b?.quantity || 0, revenue: b?.revenue || 0 };
      }),
      vouchers: vouchers.map((v) => ({ code: v._id, orders: v.orders, discount: v.discount, revenue: v.revenue })),
      staff,
      shippers,
      topCustomers,
      provinces: provinces.map((p) => ({ name: p._id, revenue: p.revenue, orders: p.orders })),
      customers: [...customerMonths.values()].sort((a, b) => a.month.localeCompare(b.month)),
      slowMovers,
      campaigns: campaigns.map((c) => ({ id: c._id, name: c.name, campaign: c.campaign, orders: c.orders, discount: c.discount, revenue: c.revenue }))
    }
  });
});

module.exports = { getAnalytics };
