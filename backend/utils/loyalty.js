// Tích điểm & hạng thành viên.
//
// - Điểm chỉ cộng khi khách ĐÃ NHẬN hàng (đơn chuyển sang "delivered"), cùng thời điểm với số "đã bán";
//   đơn đã giao mà bị trả hàng thì trừ lại đúng số điểm đã cộng (lưu ở order.loyaltyPoints).
// - Điểm tính trên số tiền hàng khách thực trả: tổng hàng - giảm giá (không tính phí vận chuyển),
//   1 điểm cho mỗi `pointValue` đồng, làm tròn xuống.
// - Hạng tính từ tổng điểm tích lũy (không lưu riêng nên luôn khớp với điểm; đổi ngưỡng có hiệu lực ngay).
// - Admin chỉnh bật/tắt, tỷ lệ quy đổi và danh sách hạng ở Cấu hình hệ thống -> Hạng thành viên (settings.loyalty).

// Hạng mặc định, sắp theo ngưỡng tăng dần; minPoints = điểm tối thiểu để đạt hạng
const DEFAULT_TIERS = [
  { key: 'dong', name: 'Đồng', minPoints: 0, color: '#b87333' },
  { key: 'bac', name: 'Bạc', minPoints: 500, color: '#8a9099' },
  { key: 'vang', name: 'Vàng', minPoints: 2000, color: '#d4a017' },
  { key: 'kim_cuong', name: 'Kim cương', minPoints: 5000, color: '#3fa7d6' }
];
const DEFAULT_CONFIG = { enabled: true, pointValue: 10000, tiers: DEFAULT_TIERS };
const MIN_TIERS = 2;
const MAX_TIERS = 6;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

// "Kim cương" -> "kim_cuong" (khóa ổn định của hạng)
const slugKey = (name) =>
  String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

// Cấu hình đang lưu (có thể thiếu / dữ liệu cũ) -> cấu hình dùng được, thiếu gì lấy mặc định
function effectiveConfig(raw) {
  const tiers = Array.isArray(raw?.tiers) && raw.tiers.length >= MIN_TIERS ? raw.tiers : DEFAULT_TIERS;
  return {
    enabled: raw?.enabled !== false,
    pointValue: Number.isInteger(raw?.pointValue) && raw.pointValue > 0 ? raw.pointValue : DEFAULT_CONFIG.pointValue,
    tiers: tiers
      .map((t) => ({ key: t.key, name: t.name, minPoints: t.minPoints, color: t.color }))
      .sort((a, b) => a.minPoints - b.minPoints)
  };
}

// Kiểm tra dữ liệu admin gửi lên. Gửi phần nào đổi phần đó (current = cấu hình hiện tại).
// Trả về { config } hoặc { error }.
function parseLoyaltyConfig(input, current = DEFAULT_CONFIG) {
  if (!input || typeof input !== 'object') return { error: 'Dữ liệu không hợp lệ' };
  const config = effectiveConfig(current);

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return { error: 'Giá trị bật/tắt không hợp lệ' };
    config.enabled = input.enabled;
  }
  if (input.pointValue !== undefined) {
    const v = Number(input.pointValue);
    if (!Number.isInteger(v) || v < 1000 || v > 10000000) return { error: 'Số tiền cho 1 điểm phải là số nguyên từ 1.000đ đến 10.000.000đ' };
    config.pointValue = v;
  }
  if (input.tiers !== undefined) {
    if (!Array.isArray(input.tiers) || input.tiers.length < MIN_TIERS || input.tiers.length > MAX_TIERS) {
      return { error: `Cần từ ${MIN_TIERS} đến ${MAX_TIERS} hạng` };
    }
    const tiers = [];
    for (const [i, t] of input.tiers.entries()) {
      const label = `Hạng ${i + 1}`;
      const name = typeof t?.name === 'string' ? t.name.trim().replace(/\s+/g, ' ') : '';
      if (!name || name.length > 30) return { error: `${label}: tên từ 1 đến 30 ký tự` };
      const minPoints = Number(t.minPoints);
      if (!Number.isInteger(minPoints) || minPoints < 0 || minPoints > 100000000) return { error: `${label} (${name}): ngưỡng điểm phải là số nguyên ≥ 0` };
      const color = typeof t.color === 'string' && COLOR_RE.test(t.color) ? t.color.toLowerCase() : null;
      if (!color) return { error: `${label} (${name}): màu không hợp lệ (dạng #rrggbb)` };
      const key = (typeof t.key === 'string' && /^[a-z0-9_]{1,30}$/.test(t.key) ? t.key : slugKey(name)) || `hang_${i + 1}`;
      tiers.push({ key, name, minPoints, color });
    }
    // Ngưỡng tăng dần theo đúng thứ tự gửi lên, hạng đầu từ 0 điểm (mọi khách đều có hạng)
    if (tiers[0].minPoints !== 0) return { error: `Hạng thấp nhất (${tiers[0].name}) phải bắt đầu từ 0 điểm` };
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].minPoints <= tiers[i - 1].minPoints) {
        return { error: `Ngưỡng điểm phải tăng dần: ${tiers[i].name} (${tiers[i].minPoints}) phải lớn hơn ${tiers[i - 1].name} (${tiers[i - 1].minPoints})` };
      }
    }
    const lower = (s) => s.toLowerCase();
    if (new Set(tiers.map((t) => lower(t.name))).size !== tiers.length) return { error: 'Tên hạng không được trùng nhau' };
    if (new Set(tiers.map((t) => t.key)).size !== tiers.length) return { error: 'Tên hạng quá giống nhau, vui lòng đặt tên khác' };
    config.tiers = tiers;
  }
  return { config };
}

function pointsForOrder(order, config = DEFAULT_CONFIG) {
  if (!config.enabled) return 0;
  const paid = (Number(order.itemsTotal) || 0) - (Number(order.discountAmount) || 0);
  return paid > 0 ? Math.floor(paid / config.pointValue) : 0;
}

function tierFor(points, config = DEFAULT_CONFIG) {
  const tiers = config.tiers;
  const p = Math.max(0, Number(points) || 0);
  let index = 0;
  tiers.forEach((t, i) => {
    if (p >= t.minPoints) index = i;
  });
  const next = tiers[index + 1] || null;
  return {
    ...tiers[index],
    points: p,
    next: next ? { key: next.key, name: next.name, minPoints: next.minPoints, pointsNeeded: next.minPoints - p } : null
  };
}

// Biểu thức MongoDB: điểm của khách -> khóa hạng (dùng cho thống kê / xem trước khi đổi ngưỡng)
function tierKeyExpr(tiers, field = '$loyaltyPoints') {
  const points = { $ifNull: [field, 0] };
  const desc = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return {
    $switch: {
      branches: desc.slice(0, -1).map((t) => ({ case: { $gte: [points, t.minPoints] }, then: t.key })),
      default: desc[desc.length - 1].key
    }
  };
}

// Cấu hình hiện tại (đọc mỗi lần - 1 bản ghi nhỏ, đổi trong trang quản trị là áp dụng ngay)
async function getLoyaltyConfig() {
  const Setting = require('../models/Setting');
  const setting = await Setting.findOne().select('loyalty').lean();
  return effectiveConfig(setting?.loyalty);
}

module.exports = {
  DEFAULT_TIERS,
  DEFAULT_CONFIG,
  MIN_TIERS,
  MAX_TIERS,
  effectiveConfig,
  parseLoyaltyConfig,
  pointsForOrder,
  tierFor,
  tierKeyExpr,
  getLoyaltyConfig
};
