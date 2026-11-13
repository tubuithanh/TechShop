// Thống kê đánh giá cho admin / quản lý: tổng quan, xu hướng theo tháng, phân bố sao, điểm từng tiêu chí,
// thẻ khen / chê, sản phẩm cần chú ý, điểm theo chi nhánh.
// Chi nhánh của đánh giá = chi nhánh của đơn hàng đã mua (Review.orderId -> Order.storeId).
const mongoose = require('mongoose');
const Review = require('../models/Review');
const asyncHandler = require('../utils/asyncHandler');
const { dateRange } = require('../utils/dateRange');
const { getScopedStoreId } = require('../middlewares/authMiddleware');
const { CRITERIA, TAGS } = require('../utils/reviewCriteria');
const { byId: providerById } = require('../utils/shippingProviders');

// Thẻ chê liên quan khâu giao hàng
// 'GHN|simulation' -> 'Giao Hàng Nhanh (GHN) · giả lập'
const CARRIER_NAMES = { GHN: 'Giao Hàng Nhanh (GHN)' };
const ENV_NAMES = { simulation: 'giả lập', sandbox: 'thử nghiệm' };
function carrierName(key) {
  const [provider, env] = String(key).split('|');
  const name = CARRIER_NAMES[provider] || providerById(provider)?.name || provider;
  return ENV_NAMES[env] ? name + ' · ' + ENV_NAMES[env] : name;
}
const DELIVERY_NEGATIVE = ['Giao hàng chậm', 'Đóng gói sơ sài'];
const DELIVERY_POSITIVE = ['Giao hàng nhanh', 'Đóng gói cẩn thận', 'Nhân viên nhiệt tình'];

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// @route GET /api/reviews/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=
const getReviewStats = asyncHandler(async (req, res) => {
  const match = {};
  const created = dateRange(req.query.from, req.query.to);
  if (created) match.createdAt = created;

  // Quản lý chi nhánh chỉ thấy chi nhánh mình; admin có thể chọn chi nhánh
  const scoped = getScopedStoreId(req);
  const storeId = scoped || req.query.storeId || null;
  const storeStages = [
    { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order', pipeline: [{ $project: { storeId: 1, shipperId: 1, deliveryMethod: 1, 'shipment.provider': 1, 'shipment.phase': 1, 'shipment.environment': 1 } }] } },
    { $addFields: { storeId: { $first: '$order.storeId' }, ord: { $first: '$order' } } },
    // Ai giao đơn: đơn vị vận chuyển (có vận đơn còn hiệu lực) hoặc nhân viên giao hàng của cửa hàng
    { $addFields: {
      carrier: { $cond: [{ $and: [{ $ifNull: ['$ord.shipment.provider', false] }, { $not: [{ $in: ['$ord.shipment.phase', ['cancelled', 'failed']] }] }] }, { $concat: ['$ord.shipment.provider', '|', { $ifNull: ['$ord.shipment.environment', ''] }] }, null] },
      // Điểm giao hàng: tiêu chí "Tốc độ giao hàng" nếu khách chấm, không thì lấy điểm chung
      deliveryScore: { $ifNull: ['$criteria.delivery', '$rating'] }
    } }
  ];
  const storeMatch = storeId
    ? [{ $match: { storeId: mongoose.isValidObjectId(storeId) ? new mongoose.Types.ObjectId(String(storeId)) : null, ...(mongoose.isValidObjectId(storeId) ? {} : { _id: null }) } }]
    : [];

  const criteriaGroup = Object.fromEntries(CRITERIA.map((c) => [c.key, { $avg: `$criteria.${c.key}` }]));
  const [row] = await Review.aggregate([
    { $match: match },
    ...storeStages,
    ...storeMatch,
    {
      $facet: {
        overall: [{
          $group: {
            _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' },
            satisfied: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
            unreplied: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$reply.content', ''] } }, 0] }, 0, 1] } },
            withImages: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$images', []] } }, 0] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: [{ $ifNull: ['$tags', []] }, TAGS.negative] } }, 0] }, 1, 0] } }
          }
        }],
        stars: [{ $group: { _id: '$rating', n: { $sum: 1 } } }],
        criteria: [{ $group: { _id: null, ...criteriaGroup } }],
        months: [
          { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+07:00' } }, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
          { $sort: { _id: -1 } }, { $limit: 12 }, { $sort: { _id: 1 } }
        ],
        tags: [{ $unwind: '$tags' }, { $group: { _id: '$tags', n: { $sum: 1 } } }, { $sort: { n: -1 } }],
        products: [
          { $group: { _id: '$productId', count: { $sum: 1 }, avg: { $avg: '$rating' }, low: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } } } },
          { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { title: 1, featuredImage: 1, slug: 1 } }] } },
          { $addFields: { product: { $first: '$p' } } }, { $project: { p: 0 } }
        ],
        shippers: [
          { $match: { carrier: null, 'ord.shipperId': { $ne: null } } },
          { $group: { _id: '$ord.shipperId', count: { $sum: 1 }, score: { $avg: '$deliveryScore' }, delivery: { $avg: '$criteria.delivery' }, service: { $avg: '$criteria.service' }, rating: { $avg: '$rating' }, low: { $sum: { $cond: [{ $lte: ['$deliveryScore', 2] }, 1, 0] } }, tags: { $push: '$tags' } } },
          { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'a', pipeline: [{ $project: { name: 1, avatar: 1 } }] } },
          { $addFields: { name: { $first: '$a.name' }, avatar: { $first: '$a.avatar' } } }, { $project: { a: 0 } }
        ],
        carriers: [
          { $match: { carrier: { $ne: null } } },
          { $group: { _id: '$carrier', count: { $sum: 1 }, score: { $avg: '$deliveryScore' }, delivery: { $avg: '$criteria.delivery' }, service: { $avg: '$criteria.service' }, rating: { $avg: '$rating' }, low: { $sum: { $cond: [{ $lte: ['$deliveryScore', 2] }, 1, 0] } }, tags: { $push: '$tags' } } }
        ],
        stores: [
          { $match: { storeId: { $ne: null } } },
          { $group: { _id: '$storeId', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
          { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 's', pipeline: [{ $project: { name: 1 } }] } },
          { $project: { count: 1, avg: 1, name: { $first: '$s.name' } } },
          { $sort: { avg: -1 } }
        ]
      }
    }
  ]);

  const o = row.overall[0] || { count: 0, avg: 0, satisfied: 0, unreplied: 0, withImages: 0, negative: 0 };
  const c = row.criteria[0] || {};
  const pct = (n) => (o.count ? Math.round((n / o.count) * 100) : 0);
  const productRow = (p) => ({ productId: p._id, title: p.product?.title || '(đã xóa)', image: p.product?.featuredImage, slug: p.product?.slug, count: p.count, average: round1(p.avg), low: p.low });
  // Cần chú ý: điểm thấp (có ít nhất 2 đánh giá để tránh nhiễu); Được khen: điểm cao, nhiều đánh giá
  const ranked = row.products.filter((p) => p.count >= 2);
  const deliveryRow = (x, name) => {
    const tags = x.tags.flat().filter(Boolean);
    const count = (list) => tags.filter((t) => list.includes(t)).length;
    return { id: x._id, name, avatar: x.avatar, count: x.count, score: round1(x.score), delivery: round1(x.delivery), service: round1(x.service), rating: round1(x.rating), low: x.low, praise: count(DELIVERY_POSITIVE), complaints: count(DELIVERY_NEGATIVE) };
  };
  const shippers = row.shippers.map((x) => deliveryRow(x, x.name || '(nhân viên đã xóa)'));
  res.json({
    data: {
      total: o.count,
      average: round1(o.avg) || 0,
      satisfiedRate: pct(o.satisfied),
      unreplied: o.unreplied,
      withImagesRate: pct(o.withImages),
      negativeCount: o.negative,
      stars: [5, 4, 3, 2, 1].map((s) => ({ star: s, count: row.stars.find((x) => x._id === s)?.n || 0 })),
      criteria: CRITERIA.map((k) => ({ key: k.key, label: k.label, average: round1(c[k.key]) })),
      months: row.months.map((m) => ({ month: m._id, count: m.count, average: round1(m.avg) })),
      tags: {
        positive: row.tags.filter((t) => !TAGS.negative.includes(t._id)).slice(0, 8).map((t) => ({ tag: t._id, count: t.n })),
        negative: row.tags.filter((t) => TAGS.negative.includes(t._id)).slice(0, 8).map((t) => ({ tag: t._id, count: t.n }))
      },
      worstProducts: [...ranked].sort((a, b) => a.avg - b.avg || b.count - a.count).filter((p) => p.avg < 4).slice(0, 5).map(productRow),
      bestProducts: [...ranked].sort((a, b) => b.avg - a.avg || b.count - a.count).filter((p) => p.avg >= 4).slice(0, 5).map(productRow),
      stores: row.stores.map((s) => ({ storeId: s._id, name: s.name || '(không rõ)', count: s.count, average: round1(s.avg) })),
      // Nhân viên giao hàng: cao (>= 4) và thấp (< 4), xếp theo điểm giao hàng
      topShippers: shippers.filter((x) => x.score >= 4).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 10),
      lowShippers: shippers.filter((x) => x.score < 4).sort((a, b) => a.score - b.score || b.count - a.count).slice(0, 10),
      carriers: row.carriers.map((x) => deliveryRow(x, carrierName(x._id))).sort((a, b) => b.score - a.score),
      scopedStoreId: scoped || null
    }
  });
});

module.exports = { getReviewStats };
