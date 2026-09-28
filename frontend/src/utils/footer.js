// Nội dung chân trang mặc định - khớp backend/utils/footer.js (dùng khi cấu hình chưa tải xong / thiếu trường)
export const DEFAULT_FOOTER = {
  aboutText: 'Công nghệ: MERN Stack (MongoDB - Express - React - Node.js)',
  columns: [
    {
      title: 'Hỗ trợ khách hàng',
      links: [
        { label: 'Hướng dẫn mua hàng', url: '/huong-dan-mua-hang' },
        { label: 'Tra cứu bảo hành', url: '/tra-cuu-bao-hanh' },
        { label: 'Hệ thống cửa hàng', url: '/stores' },
        { label: 'Chương trình khuyến mãi', url: '/promotions' },
        { label: 'Tra cứu đơn hàng', url: '/account/orders' }
      ]
    },
    {
      title: 'Chính sách',
      links: [
        { label: 'Chính sách đổi trả', url: '/chinh-sach-doi-tra' },
        { label: 'Chính sách bảo hành', url: '/chinh-sach-bao-hanh' },
        { label: 'Chính sách giao hàng', url: '/chinh-sach-giao-hang' },
        { label: 'Chính sách thanh toán', url: '/chinh-sach-thanh-toan' },
        { label: 'Chính sách bảo mật', url: '/privacy' },
        { label: 'Điều khoản sử dụng', url: '/terms' }
      ]
    }
  ],
  contactTitle: 'Liên hệ',
  copyright: '© {year} {siteName} - Tiểu luận chuyên ngành. Dữ liệu và giao dịch chỉ mang tính minh họa.'
};

export const MAX_FOOTER_LINKS = 12;

export function normalizeFooter(footer) {
  const f = footer || {};
  return {
    aboutText: typeof f.aboutText === 'string' ? f.aboutText : DEFAULT_FOOTER.aboutText,
    columns: Array.isArray(f.columns) ? f.columns : DEFAULT_FOOTER.columns,
    contactTitle: f.contactTitle || DEFAULT_FOOTER.contactTitle,
    copyright: typeof f.copyright === 'string' ? f.copyright : DEFAULT_FOOTER.copyright
  };
}

// "{year}" -> năm hiện tại, "{siteName}" -> tên website
export const fillFooterText = (text, siteName) =>
  String(text || '')
    .replace(/\{year\}/g, String(new Date().getFullYear()))
    .replace(/\{siteName\}/g, siteName || '');

// Link trong website (bắt đầu bằng "/") hay link ngoài
export const isInternalLink = (url) => /^\/(?!\/)/.test(url || '');
