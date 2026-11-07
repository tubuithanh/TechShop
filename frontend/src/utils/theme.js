// Màu sắc giao diện do admin chọn (Cấu hình hệ thống -> Màu sắc giao diện).
// Bootstrap được biên dịch sẵn với màu đỏ mặc định (scss/custom.scss); ở đây sinh thêm 1 khối CSS ghi đè các
// biến CSS của Bootstrap (--bs-primary...) và màu header/footer, chèn vào <head> khi tải trang hoặc đổi cấu hình.

export const DEFAULT_THEME = {
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

export const THEME_FIELDS = [
  { key: 'primary', label: 'Màu chính', hint: 'Nút bấm, liên kết, giá tiền, mục đang chọn' },
  { key: 'primaryHover', label: 'Màu chính (khi rê chuột)', hint: 'Đậm hơn màu chính một chút' },
  { key: 'headerBg', label: 'Nền thanh menu trên cùng', hint: 'Header của website' },
  { key: 'headerText', label: 'Chữ thanh menu trên cùng', hint: '' },
  { key: 'footerBg', label: 'Nền chân trang', hint: 'Footer của website' },
  { key: 'footerText', label: 'Chữ chân trang', hint: '' },
  { key: 'bodyBg', label: 'Nền trang', hint: 'Màu nền phía sau nội dung' },
  { key: 'accent', label: 'Màu nhấn', hint: 'Số lượng giỏ hàng, nhãn nổi bật' }
];

export const EFFECTS = [
  { value: 'none', label: 'Không có' },
  { value: 'snow', label: '❄️ Tuyết rơi' },
  { value: 'blossom', label: '🌼 Hoa mai rơi' },
  { value: 'leaves', label: '🍂 Lá thu rơi' }
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function normalizeTheme(theme) {
  const t = { ...DEFAULT_THEME };
  for (const k of Object.keys(DEFAULT_THEME)) {
    const v = theme?.[k];
    if (k === 'effect' ? EFFECTS.some((e) => e.value === v) : typeof v === 'string' && HEX_RE.test(v)) t[k] = v;
  }
  return t;
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
// Trộn màu với trắng/đen theo tỉ lệ (0..1) - tạo các sắc độ nhạt/đậm giống Bootstrap
const mix = (hex, withHex, weight) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  return rgbToHex(a.map((c, i) => c * (1 - weight) + b[i] * weight));
};
// Độ sáng tương đối - chọn chữ trắng hay đen trên nền màu
const isLight = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
};

export function buildThemeCss(input) {
  const t = normalizeTheme(input);
  const rgb = hexToRgb(t.primary).join(', ');
  const onPrimary = isLight(t.primary) ? '#212529' : '#ffffff';
  const onAccent = isLight(t.accent) ? '#212529' : '#ffffff';
  const subtle = mix(t.primary, '#ffffff', 0.85);
  const border = mix(t.primary, '#ffffff', 0.6);
  const emphasis = mix(t.primary, '#000000', 0.3);
  const focus = `rgba(${rgb}, 0.25)`;
  const footerRgb = hexToRgb(t.footerText).join(', ');
  const headerRgb = hexToRgb(t.headerText).join(', ');

  return `
:root {
  --bs-primary: ${t.primary};
  --bs-primary-rgb: ${rgb};
  --bs-primary-bg-subtle: ${subtle};
  --bs-primary-border-subtle: ${border};
  --bs-primary-text-emphasis: ${emphasis};
  --bs-link-color: ${t.primary};
  --bs-link-color-rgb: ${rgb};
  --bs-link-hover-color: ${t.primaryHover};
  --bs-link-hover-color-rgb: ${hexToRgb(t.primaryHover).join(', ')};
  --site-accent: ${t.accent};
  --site-hero-end: ${mix(t.primary, '#f59e0b', 0.65)};
}
.btn-primary {
  --bs-btn-bg: ${t.primary}; --bs-btn-border-color: ${t.primary}; --bs-btn-color: ${onPrimary};
  --bs-btn-hover-bg: ${t.primaryHover}; --bs-btn-hover-border-color: ${t.primaryHover}; --bs-btn-hover-color: ${onPrimary};
  --bs-btn-active-bg: ${t.primaryHover}; --bs-btn-active-border-color: ${t.primaryHover}; --bs-btn-active-color: ${onPrimary};
  --bs-btn-disabled-bg: ${t.primary}; --bs-btn-disabled-border-color: ${t.primary}; --bs-btn-disabled-color: ${onPrimary};
  --bs-btn-focus-shadow-rgb: ${rgb};
}
.btn-outline-primary {
  --bs-btn-color: ${t.primary}; --bs-btn-border-color: ${t.primary};
  --bs-btn-hover-bg: ${t.primary}; --bs-btn-hover-border-color: ${t.primary}; --bs-btn-hover-color: ${onPrimary};
  --bs-btn-active-bg: ${t.primary}; --bs-btn-active-border-color: ${t.primary}; --bs-btn-active-color: ${onPrimary};
  --bs-btn-disabled-color: ${t.primary}; --bs-btn-disabled-border-color: ${t.primary};
  --bs-btn-focus-shadow-rgb: ${rgb};
}
.btn-link { --bs-btn-color: ${t.primary}; --bs-btn-hover-color: ${t.primaryHover}; --bs-btn-active-color: ${t.primaryHover}; }
.nav-pills { --bs-nav-pills-link-active-bg: ${t.primary}; --bs-nav-pills-link-active-color: ${onPrimary}; }
.nav { --bs-nav-link-color: ${t.primary}; --bs-nav-link-hover-color: ${t.primaryHover}; }
.list-group { --bs-list-group-active-bg: ${t.primary}; --bs-list-group-active-border-color: ${t.primary}; --bs-list-group-active-color: ${onPrimary}; }
.pagination { --bs-pagination-color: ${t.primary}; --bs-pagination-hover-color: ${t.primaryHover}; --bs-pagination-active-bg: ${t.primary}; --bs-pagination-active-border-color: ${t.primary}; --bs-pagination-focus-box-shadow: 0 0 0 .25rem ${focus}; }
.dropdown-menu { --bs-dropdown-link-active-bg: ${t.primary}; --bs-dropdown-link-active-color: ${onPrimary}; }
.progress, .progress-stacked { --bs-progress-bar-bg: ${t.primary}; }
.form-check-input:checked { background-color: ${t.primary}; border-color: ${t.primary}; }
.form-check-input:focus, .form-control:focus, .form-select:focus { border-color: ${border}; box-shadow: 0 0 0 .25rem ${focus}; }
.form-range::-webkit-slider-thumb { background-color: ${t.primary}; }
.form-range::-moz-range-thumb { background-color: ${t.primary}; }
.text-bg-primary { color: ${onPrimary} !important; }

/* Header */
.site-header, .site-header.bg-primary { background-color: ${t.headerBg} !important; }
.site-header .navbar-brand, .site-header .nav-link, .site-header .text-white,
.site-header .navbar-toggler, .site-header .site-header-link { color: ${t.headerText} !important; }
.site-header .text-white-50 { color: rgba(${headerRgb}, .6) !important; }
.site-header .navbar-toggler { border-color: rgba(${headerRgb}, .4); }
.site-header .header-badge, .header-badge { background-color: ${t.accent} !important; color: ${onAccent} !important; }

/* Footer */
.site-footer, .site-footer.bg-dark { background-color: ${t.footerBg} !important; color: ${t.footerText} !important; }
.site-footer .text-white, .site-footer .text-light, .site-footer h6, .site-footer a { color: ${t.footerText} !important; }
.site-footer .text-white-50, .site-footer .text-secondary, .site-footer .text-muted { color: rgba(${footerRgb}, .7) !important; }
.site-footer .border-secondary, .site-footer hr { border-color: rgba(${footerRgb}, .2) !important; }

/* Nền trang */
.site-body, .site-body.bg-light { background-color: ${t.bodyBg} !important; }

/* Màu nhấn */
.badge.bg-warning, .text-bg-warning { background-color: ${t.accent} !important; color: ${onAccent} !important; }
`;
}

// Chèn / cập nhật khối CSS màu sắc trong <head>
export function applyTheme(theme) {
  let el = document.getElementById('site-theme');
  if (!el) {
    el = document.createElement('style');
    el.id = 'site-theme';
    document.head.appendChild(el);
  }
  el.textContent = buildThemeCss(theme);
}
