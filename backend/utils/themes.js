// Màu sắc giao diện website (Cấu hình hệ thống -> Màu sắc giao diện).
// Bộ màu đang dùng lưu trong Setting.theme (đọc công khai qua GET /api/settings để frontend tô màu);
// các bộ màu lưu sẵn để chọn nhanh nằm trong collection theme_templates.

const COLOR_FIELDS = ['primary', 'primaryHover', 'headerBg', 'headerText', 'footerBg', 'footerText', 'bodyBg', 'accent'];
// Hiệu ứng trang trí rơi nhẹ trên trang khách hàng
const EFFECTS = ['none', 'snow', 'blossom', 'leaves'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

const DEFAULT_THEME = {
  primary: '#dc2626',
  primaryHover: '#b91c1c',
  headerBg: '#dc2626',
  headerText: '#ffffff',
  footerBg: '#212529',
  footerText: '#f8f9fa',
  bodyBg: '#f8f9fa',
  accent: '#ffc107',
  effect: 'none'
};

// Các template có sẵn (nạp khi chưa có template nào). Admin sửa/xóa được, trừ bộ "Mặc định".
const BUILT_IN_TEMPLATES = [
  { key: 'default', name: 'Mặc định TechShop', description: 'Đỏ thương hiệu, header đỏ, footer tối', theme: DEFAULT_THEME },
  {
    key: 'christmas',
    name: 'Giáng sinh (Noel)',
    description: 'Đỏ Noel, xanh thông, điểm vàng kim, tuyết rơi',
    theme: {
      primary: '#c8102e',
      primaryHover: '#9b0d23',
      headerBg: '#14532d',
      headerText: '#ffffff',
      footerBg: '#0b3d2e',
      footerText: '#ecfdf5',
      bodyBg: '#f6faf7',
      accent: '#d4af37',
      effect: 'snow'
    }
  },
  {
    key: 'tet',
    name: 'Tết Nguyên Đán',
    description: 'Đỏ may mắn, chữ vàng, hoa mai rơi',
    theme: {
      primary: '#d6001c',
      primaryHover: '#a80016',
      headerBg: '#b3001b',
      headerText: '#ffe08a',
      footerBg: '#7a0010',
      footerText: '#ffe9b0',
      bodyBg: '#fffaf0',
      accent: '#f5b301',
      effect: 'blossom'
    }
  },
  {
    key: 'autumn',
    name: 'Mùa thu',
    description: 'Cam đất, nâu gỗ, lá vàng rơi',
    theme: {
      primary: '#c2410c',
      primaryHover: '#9a3412',
      headerBg: '#7c2d12',
      headerText: '#fff7ed',
      footerBg: '#431407',
      footerText: '#fed7aa',
      bodyBg: '#fffbf5',
      accent: '#ca8a04',
      effect: 'leaves'
    }
  }
];

// Định nghĩa trường cho Mongoose (dùng chung cho Setting.theme và ThemeTemplate.theme)
const themeSchemaDefinition = Object.fromEntries([
  ...COLOR_FIELDS.map((f) => [f, { type: String, default: DEFAULT_THEME[f], match: HEX_RE }]),
  ['effect', { type: String, enum: EFFECTS, default: 'none' }]
]);

// Kiểm tra bộ màu gửi lên. partial=true: chỉ kiểm tra các trường có gửi. Trả về { error } hoặc { theme }
function parseTheme(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Bộ màu không hợp lệ' };
  const theme = {};
  for (const f of COLOR_FIELDS) {
    if (input[f] === undefined) {
      if (!partial) theme[f] = DEFAULT_THEME[f];
      continue;
    }
    if (typeof input[f] !== 'string' || !HEX_RE.test(input[f])) return { error: `Mã màu "${f}" phải có dạng #RRGGBB` };
    theme[f] = input[f].toLowerCase();
  }
  if (input.effect !== undefined) {
    if (!EFFECTS.includes(input.effect)) return { error: 'Hiệu ứng trang trí không hợp lệ' };
    theme.effect = input.effect;
  } else if (!partial) theme.effect = 'none';
  return { theme };
}

module.exports = { COLOR_FIELDS, EFFECTS, DEFAULT_THEME, BUILT_IN_TEMPLATES, themeSchemaDefinition, parseTheme };
