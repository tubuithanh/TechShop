const mongoose = require('mongoose');
const Slide = require('../models/Slide');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');

// 3 slide trước đây viết cố định trong trang chủ - nạp vào DB 1 lần duy nhất (admin xóa hết thì KHÔNG tự tạo lại)
const DEFAULT_SLIDES = [
  {
    eyebrow: '🎓 Tiểu luận chuyên ngành MERN Stack',
    title: 'Chào mừng đến với TechShop',
    subtitle: 'Website thương mại điện tử đa chi nhánh (multi-store) — mua sắm thiết bị công nghệ chính hãng, nhanh chóng và tin cậy',
    buttonText: 'Khám phá ngay',
    buttonLink: '/products',
    bgType: 'theme'
  },
  {
    eyebrow: '⚡ Ưu đãi mỗi ngày',
    title: 'Flash Sale giảm đến 25%',
    subtitle: 'Hàng nghìn sản phẩm công nghệ chính hãng đang được săn đón — số lượng có hạn',
    buttonText: 'Săn deal ngay',
    buttonLink: '/products?sort=price_asc',
    bgType: 'gradient',
    colorFrom: '#7c3aed',
    colorTo: '#db2777'
  },
  {
    eyebrow: '💳 Linh hoạt tài chính',
    title: 'Trả góp 0% lãi suất',
    subtitle: 'Sở hữu ngay điện thoại, laptop yêu thích với thủ tục nhanh gọn, duyệt trong 15 phút',
    buttonText: 'Xem ưu đãi',
    buttonLink: '/promotions',
    bgType: 'gradient',
    colorFrom: '#0891b2',
    colorTo: '#059669'
  }
];

async function ensureDefaultSlides() {
  const setting = await Setting.findOne().select('+homeSlidesSeeded').lean();
  if (setting?.homeSlidesSeeded) return;
  if (!(await Slide.estimatedDocumentCount())) {
    await Slide.insertMany(DEFAULT_SLIDES.map((s, i) => ({ ...s, sortOrder: i + 1 })));
  }
  await Setting.updateOne({}, { $set: { homeSlidesSeeded: true } }, { upsert: true });
}

// Đường dẫn nút bấm: trang trong website ("/products") hoặc link ngoài http(s). Chặn javascript:, //tenmien...
const LINK_RE = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/i;
const IMAGE_RE = /^(https?:\/\/[^\s]+|\/uploads\/[^\s]+)$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

// Kiểm tra dữ liệu slide; partial=true khi sửa (chỉ kiểm tra trường có gửi). Trả về { error } hoặc { values }
function parseSlide(body, { partial = false } = {}) {
  const v = {};
  const fields = { eyebrow: 80, title: 120, subtitle: 300, buttonText: 40, buttonLink: 300, imageUrl: 500 };
  for (const [k, max] of Object.entries(fields)) {
    if (body[k] !== undefined) v[k] = str(body[k], max) ?? '';
  }
  if (!partial || v.title !== undefined) {
    if (!v.title) return { error: 'Vui lòng nhập tiêu đề slide' };
  }
  if (v.buttonLink && !LINK_RE.test(v.buttonLink)) return { error: 'Đường dẫn nút phải bắt đầu bằng "/" (trang trong website) hoặc "https://"' };
  if (v.buttonText && !v.buttonLink && !partial) return { error: 'Vui lòng nhập đường dẫn cho nút bấm' };
  if (body.bgType !== undefined) {
    if (!['theme', 'gradient', 'image'].includes(body.bgType)) return { error: 'Kiểu nền không hợp lệ' };
    v.bgType = body.bgType;
  }
  for (const k of ['colorFrom', 'colorTo']) {
    if (body[k] !== undefined) {
      if (!HEX_RE.test(body[k])) return { error: 'Mã màu phải có dạng #RRGGBB' };
      v[k] = body[k].toLowerCase();
    }
  }
  if (v.imageUrl && !IMAGE_RE.test(v.imageUrl)) return { error: 'Link ảnh nền không hợp lệ' };
  if ((v.bgType || (!partial && 'theme')) === 'image' && !v.imageUrl && !partial) return { error: 'Vui lòng chọn ảnh nền' };
  if (body.textColor !== undefined) {
    if (!['light', 'dark'].includes(body.textColor)) return { error: 'Màu chữ không hợp lệ' };
    v.textColor = body.textColor;
  }
  for (const k of ['isActive', 'darkOverlay']) if (body[k] !== undefined) v[k] = body[k] === true || body[k] === 'true';
  for (const k of ['startAt', 'endAt']) {
    if (body[k] !== undefined) {
      if (body[k] === null || body[k] === '') v[k] = null;
      else if (Number.isNaN(Date.parse(body[k]))) return { error: 'Thời gian hiển thị không hợp lệ' };
      else v[k] = new Date(body[k]);
    }
  }
  if (v.startAt && v.endAt && v.startAt > v.endAt) return { error: 'Thời gian kết thúc phải sau thời gian bắt đầu' };
  return { values: v };
}

// @route GET /api/slides - công khai: slide đang bật và trong thời gian hiển thị, theo thứ tự
const getSlides = asyncHandler(async (req, res) => {
  await ensureDefaultSlides();
  const now = new Date();
  const data = await Slide.find({
    isActive: true,
    $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gte: now } }] }]
  })
    .sort({ sortOrder: 1, createdAt: 1 })
    .select('-__v -createdAt -updatedAt')
    .lean();
  res.json({ data });
});

// @route GET /api/slides/admin - mọi slide (kể cả đang tắt / hết hạn)
const getSlidesAdmin = asyncHandler(async (req, res) => {
  await ensureDefaultSlides();
  const data = await Slide.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
  res.json({ data });
});

const createSlide = asyncHandler(async (req, res) => {
  const { error, values } = parseSlide(req.body);
  if (error) return res.status(400).json({ message: error });
  const last = await Slide.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  const slide = await Slide.create({ ...values, sortOrder: (last?.sortOrder || 0) + 1 });
  res.status(201).json({ message: 'Đã thêm slide', data: slide });
});

const updateSlide = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy slide' });
  const slide = await Slide.findById(req.params.id);
  if (!slide) return res.status(404).json({ message: 'Không tìm thấy slide' });
  const { error, values } = parseSlide(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  Object.assign(slide, values);
  if (slide.bgType === 'image' && !slide.imageUrl) return res.status(400).json({ message: 'Vui lòng chọn ảnh nền' });
  if (slide.buttonText && !slide.buttonLink) return res.status(400).json({ message: 'Vui lòng nhập đường dẫn cho nút bấm' });
  if (slide.startAt && slide.endAt && slide.startAt > slide.endAt) {
    return res.status(400).json({ message: 'Thời gian kết thúc phải sau thời gian bắt đầu' });
  }
  await slide.save();
  res.json({ message: 'Đã cập nhật slide', data: slide });
});

const deleteSlide = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy slide' });
  const slide = await Slide.findByIdAndDelete(req.params.id);
  if (!slide) return res.status(404).json({ message: 'Không tìm thấy slide' });
  res.json({ message: `Đã xóa slide "${slide.title}"` });
});

// @route PUT /api/slides/reorder { ids: [...] } - sắp xếp lại theo đúng thứ tự danh sách gửi lên
const reorderSlides = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  if (!ids.length || !ids.every((id) => mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ message: 'Danh sách slide không hợp lệ' });
  }
  if ((await Slide.countDocuments({ _id: { $in: ids } })) !== ids.length) {
    return res.status(400).json({ message: 'Có slide không tồn tại' });
  }
  await Slide.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i + 1 } } } })));
  res.json({ message: 'Đã lưu thứ tự slide' });
});

module.exports = { getSlides, getSlidesAdmin, createSlide, updateSlide, deleteSlide, reorderSlides, ensureDefaultSlides, DEFAULT_SLIDES };
