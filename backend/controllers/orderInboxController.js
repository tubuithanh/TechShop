// "Việc cần làm" ở trang Đơn hàng: chỉ các đơn đang CHỜ nhân viên xử lý, xếp theo mức gấp (thời gian chờ so với ngưỡng).
// Mỗi đơn thuộc đúng 1 nhóm việc (ưu tiên từ trên xuống) - xem CATEGORIES.
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');
const { enrichHistory } = require('../utils/orderHistory');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

const ONLINE = ['vnpay', 'momo'];
const OPEN = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping', 'returning'];

// key, nhãn, điều kiện (biểu thức trên 1 đơn), ngưỡng mặc định (phút) trước khi bị coi là QUÁ HẠN.
// Thứ tự = thứ tự ưu tiên khi 1 đơn khớp nhiều nhóm.
const CATEGORIES = [
  {
    key: 'transfer', label: 'Yêu cầu điều phối', defaultMinutes: 120,
    match: { activeTransferId: { $ne: null } },
    expr: { $ne: [{ $ifNull: ['$activeTransferId', null] }, null] }
  },
  {
    key: 'refund', label: 'Chờ hoàn tiền', defaultMinutes: 24 * 60,
    match: { refundStatus: { $in: ['pending', 'processing'] } },
    expr: { $in: ['$refundStatus', ['pending', 'processing']] }
  },
  {
    key: 'payment', label: 'Chuyển khoản chưa xác nhận', defaultMinutes: 4 * 60,
    match: { paymentMode: 'bank_transfer', paymentStatus: { $in: ['pending', 'failed'] }, status: { $in: OPEN } },
    expr: { $and: [{ $eq: ['$paymentMode', 'bank_transfer'] }, { $in: ['$paymentStatus', ['pending', 'failed']] }, { $in: ['$status', OPEN] }] }
  },
  {
    key: 'confirm', label: 'Chờ xác nhận', defaultMinutes: 60,
    // Đơn thanh toán online chưa trả tiền là đang chờ KHÁCH, chưa phải việc của nhân viên
    match: { status: 'pending', $or: [{ paymentMode: { $nin: ONLINE } }, { paymentStatus: 'paid' }] },
    expr: { $and: [{ $eq: ['$status', 'pending'] }, { $or: [{ $not: [{ $in: ['$paymentMode', ONLINE] }] }, { $eq: ['$paymentStatus', 'paid'] }] }] }
  },
  {
    key: 'delivery_issue', label: 'Giao hàng gặp sự cố', defaultMinutes: 4 * 60,
    match: { status: 'shipping', $or: [{ 'shipment.phase': 'failed' }, { 'deliveryAttempts.result': 'failed' }] },
    expr: {
      $and: [
        { $eq: ['$status', 'shipping'] },
        { $or: [{ $eq: ['$shipment.phase', 'failed'] }, { $eq: [{ $arrayElemAt: ['$deliveryAttempts.result', -1] }, 'failed'] }] }
      ]
    }
  },
  {
    key: 'returns', label: 'Chờ nhận hàng trả', defaultMinutes: 48 * 60,
    match: { status: 'returning' },
    expr: { $eq: ['$status', 'returning'] }
  },
  {
    key: 'prepare', label: 'Cần chuẩn bị / giao', defaultMinutes: 24 * 60,
    match: { status: { $in: ['confirmed', 'processing'] } },
    expr: { $in: ['$status', ['confirmed', 'processing']] }
  },
  {
    key: 'pickup', label: 'Chờ khách nhận tại cửa hàng', defaultMinutes: 72 * 60,
    match: { status: 'ready_for_pickup' },
    expr: { $eq: ['$status', 'ready_for_pickup'] }
  }
];
const KEYS = CATEGORIES.map((c) => c.key);

// Ngưỡng (phút) mỗi nhóm: mặc định + giá trị admin chỉnh (Setting.orderSla)
async function thresholds() {
  const s = await Setting.findOne().select('orderSla').lean();
  const saved = s?.orderSla || {};
  return Object.fromEntries(CATEGORIES.map((c) => {
    const v = Number(saved[c.key]);
    return [c.key, Number.isInteger(v) && v >= 5 && v <= 30 * 24 * 60 ? v : c.defaultMinutes];
  }));
}

// Phạm vi chi nhánh: nhân viên chi nhánh thấy đơn chi nhánh mình + yêu cầu điều phối GỬI TỚI chi nhánh mình
function scopeMatch(req) {
  const storeId = getScopedStoreId(req);
  if (!storeId) return {};
  const id = new mongoose.Types.ObjectId(String(storeId));
  return { $or: [{ storeId: id }, { activeTransferId: { $ne: null } }] };
}

function pipelineBase(req, limits) {
  const now = new Date();
  const scoped = getScopedStoreId(req);
  return [
    { $match: { ...scopeMatch(req), $and: [{ $or: CATEGORIES.map((c) => c.match) }] } },
    // Yêu cầu điều phối: biết chi nhánh đích để lọc phạm vi
    ...(scoped ? [
      { $lookup: { from: 'ordertransfers', localField: 'activeTransferId', foreignField: '_id', as: '_transfer', pipeline: [{ $project: { toStoreId: 1 } }] } },
      { $match: { $or: [{ storeId: new mongoose.Types.ObjectId(String(scoped)) }, { '_transfer.toStoreId': new mongoose.Types.ObjectId(String(scoped)) }] } }
    ] : []),
    {
      $addFields: {
        _category: { $switch: { branches: CATEGORIES.map((c) => ({ case: c.expr, then: c.key })), default: null } },
        // Bắt đầu chờ từ lần cập nhật gần nhất của đơn (đổi trạng thái, thanh toán, yêu cầu hoàn...)
        _since: { $ifNull: [{ $max: '$statusHistory.changedAt' }, '$createdAt'] }
      }
    },
    { $match: { _category: { $ne: null } } },
    {
      $addFields: {
        _limit: { $switch: { branches: CATEGORIES.map((c) => ({ case: { $eq: ['$_category', c.key] }, then: limits[c.key] })), default: 60 } },
        _waited: { $divide: [{ $subtract: [now, '$_since'] }, 60000] }
      }
    },
    { $addFields: { _ratio: { $divide: ['$_waited', '$_limit'] } } }
  ];
}

// @route GET /api/orders/admin/inbox?category=&page=&limit=
const getInbox = asyncHandler(async (req, res) => {
  const category = KEYS.includes(req.query.category) ? req.query.category : null;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const limits = await thresholds();
  const base = pipelineBase(req, limits);

  const [result] = await Order.aggregate([
    ...base,
    {
      $facet: {
        counts: [{ $group: { _id: '$_category', total: { $sum: 1 }, overdue: { $sum: { $cond: [{ $gte: ['$_ratio', 1] }, 1, 0] } } } }],
        rows: [
          ...(category ? [{ $match: { _category: category } }] : []),
          // Gấp nhất trước: quá hạn nhiều nhất -> chờ lâu nhất
          { $sort: { _ratio: -1, _since: 1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: { _id: 1, _category: 1, _since: 1, _waited: 1, _limit: 1 } }
        ]
      }
    }
  ]);

  const counts = Object.fromEntries(CATEGORIES.map((c) => {
    const row = result.counts.find((x) => x._id === c.key);
    return [c.key, { total: row?.total || 0, overdue: row?.overdue || 0 }];
  }));
  const total = category ? counts[category].total : Object.values(counts).reduce((s, c) => s + c.total, 0);

  // Lấy đủ dữ liệu đơn như danh sách thường (để dùng chung các nút thao tác), giữ đúng thứ tự mức gấp
  const docs = await Order.find({ _id: { $in: result.rows.map((r) => r._id) } })
    .populate('userId', 'displayName email phoneNumber')
    .populate('storeId', 'name city')
    .populate('createdBy handover.by receipt.by', 'name');
  const byId = new Map((await enrichHistory(docs)).map((d) => [String(d._id), d]));
  const data = result.rows.map((r) => {
    const o = byId.get(String(r._id));
    if (!o) return null;
    return {
      ...o,
      inbox: {
        category: r._category,
        label: CATEGORIES.find((c) => c.key === r._category).label,
        since: r._since,
        waitedMinutes: Math.max(0, Math.round(r._waited)),
        limitMinutes: r._limit,
        overdue: r._waited >= r._limit
      }
    };
  }).filter(Boolean);

  res.json({
    data, total, page, totalPages: Math.max(1, Math.ceil(total / limit)),
    counts,
    categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label, limitMinutes: limits[c.key], defaultMinutes: c.defaultMinutes }))
  });
});

// @route PUT /api/orders/admin/inbox/sla { [categoryKey]: phút } - admin chỉnh ngưỡng quá hạn
const updateSla = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const sla = {};
  for (const c of CATEGORIES) {
    if (body[c.key] === undefined || body[c.key] === '' || body[c.key] === null) continue;
    const v = Number(body[c.key]);
    if (!Number.isInteger(v) || v < 5 || v > 30 * 24 * 60) {
      return res.status(400).json({ message: `Ngưỡng "${c.label}" phải từ 5 phút đến 30 ngày` });
    }
    sla[c.key] = v;
  }
  await Setting.updateOne({}, { $set: { orderSla: sla } }, { upsert: true });
  res.json({ data: await thresholds(), message: 'Đã lưu ngưỡng cảnh báo' });
});

module.exports = { getInbox, updateSla, CATEGORIES };
