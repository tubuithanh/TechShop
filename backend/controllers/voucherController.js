const Voucher = require('../models/Voucher');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/vouchers/active - danh sách voucher công khai đang áp dụng (mục 1.1.9)
const getActiveVouchers = asyncHandler(async (req, res) => {
  const now = new Date();
  const vouchers = await Voucher.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).select('code description discountType discountValue maxDiscountAmount minOrderValue');
  res.json({ data: vouchers });
});

// @route POST /api/vouchers/validate  (khách hàng kiểm tra mã trước khi áp dụng)
const validateVoucher = asyncHandler(async (req, res) => {
  const { code, orderValue } = req.body;
  const voucher = await Voucher.findOne({ code: code?.toUpperCase() });
  if (!voucher || !voucher.isValidNow()) {
    return res.status(400).json({ message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' });
  }
  if (orderValue < voucher.minOrderValue) {
    return res.status(400).json({ message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã này` });
  }
  const discountAmount =
    voucher.discountType === 'percent'
      ? Math.min((orderValue * voucher.discountValue) / 100, voucher.maxDiscountAmount || Infinity)
      : voucher.discountValue;

  res.json({ data: { voucher, discountAmount } });
});

// ---------- ADMIN ----------
const getVouchers = asyncHandler(async (req, res) => {
  const vouchers = await Voucher.find().sort({ createdAt: -1 });
  res.json({ data: vouchers });
});

const createVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.create(req.body);
  res.status(201).json({ data: voucher });
});

const updateVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) return res.status(404).json({ message: 'Không tìm thấy voucher' });
  Object.assign(voucher, req.body);
  await voucher.save();
  res.json({ data: voucher });
});

const deleteVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) return res.status(404).json({ message: 'Không tìm thấy voucher' });
  voucher.isActive = false;
  await voucher.save();
  res.json({ message: 'Đã vô hiệu hóa voucher' });
});

module.exports = { validateVoucher, getActiveVouchers, getVouchers, createVoucher, updateVoucher, deleteVoucher };
