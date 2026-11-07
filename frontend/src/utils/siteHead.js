// Tiêu đề trang, mô tả SEO và favicon theo Cấu hình hệ thống (Thông tin chung + SEO).
// Nhớ lần trước trong trình duyệt để áp dụng NGAY khi mở trang (không hiện tiêu đề cứng trong index.html trong
// lúc chờ API cấu hình trả về).

const CACHE_KEY = 'techshop-head';

// Tiêu đề mặc định của website: "Tiêu đề SEO" nếu có, nếu không là tên website
export const siteTitleOf = (settings) => settings?.seo?.metaTitle?.trim() || settings?.siteName?.trim() || 'TechShop';

export function cachedHead() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || null;
  } catch {
    return null;
  }
}

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// head: { title, description, favicon }
export function applyHead(head, { remember = false } = {}) {
  if (!head) return;
  if (head.title) document.title = head.title;
  if (head.description !== undefined) setMeta('description', head.description || '');
  if (head.favicon) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = head.favicon;
  }
  if (remember) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(head));
    } catch {
      /* trình duyệt chặn lưu trữ - bỏ qua */
    }
  }
}

export const headOf = (settings) => ({
  title: siteTitleOf(settings),
  description: settings?.seo?.metaDescription?.trim() || settings?.tagline || '',
  favicon: settings?.faviconUrl || ''
});

// Tiêu đề riêng của từng trang: "Tên trang | Tên website"
export const pageTitle = (name, settings) => `${name} | ${settings?.siteName?.trim() || 'TechShop'}`;
