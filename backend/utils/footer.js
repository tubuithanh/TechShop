// Nội dung chân trang (footer) - sửa ở Admin -> Cấu hình hệ thống -> Chân trang (Footer).
// Tên website, slogan, hotline, email, địa chỉ, mạng xã hội lấy từ các tab khác (không lặp lại ở đây).

const DEFAULT_FOOTER = {
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
  // {year} = năm hiện tại, {siteName} = tên website
  copyright: '© {year} {siteName} - Tiểu luận chuyên ngành. Dữ liệu và giao dịch chỉ mang tính minh họa.'
};

const MAX_COLUMNS = 2;
const MAX_LINKS = 12;
const LIMITS = { aboutText: 300, title: 60, label: 80, url: 300, contactTitle: 60, copyright: 300 };
// Đường dẫn trong website ("/stores") hoặc link ngoài http(s). Chặn javascript:, data:... (tránh chèn mã độc)
const URL_RE = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s.-]+)$/i;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Kiểm tra footer gửi lên; trả về { error } hoặc { footer } (đầy đủ các trường)
function parseFooter(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Nội dung chân trang không hợp lệ' };
  const aboutText = str(input.aboutText);
  const contactTitle = str(input.contactTitle) || DEFAULT_FOOTER.contactTitle;
  const copyright = str(input.copyright);
  if (aboutText.length > LIMITS.aboutText) return { error: `Dòng giới thiệu tối đa ${LIMITS.aboutText} ký tự` };
  if (contactTitle.length > LIMITS.contactTitle) return { error: `Tiêu đề cột Liên hệ tối đa ${LIMITS.contactTitle} ký tự` };
  if (copyright.length > LIMITS.copyright) return { error: `Dòng bản quyền tối đa ${LIMITS.copyright} ký tự` };

  const rawColumns = Array.isArray(input.columns) ? input.columns : [];
  if (rawColumns.length > MAX_COLUMNS) return { error: `Tối đa ${MAX_COLUMNS} cột liên kết` };
  const columns = [];
  for (const [ci, col] of rawColumns.entries()) {
    const title = str(col?.title);
    if (!title) return { error: `Cột ${ci + 1}: vui lòng nhập tiêu đề` };
    if (title.length > LIMITS.title) return { error: `Cột ${ci + 1}: tiêu đề tối đa ${LIMITS.title} ký tự` };
    const rawLinks = Array.isArray(col?.links) ? col.links : [];
    if (rawLinks.length > MAX_LINKS) return { error: `Cột "${title}": tối đa ${MAX_LINKS} liên kết` };
    const links = [];
    for (const [li, link] of rawLinks.entries()) {
      const label = str(link?.label);
      const url = str(link?.url);
      if (!label && !url) continue; // dòng trống -> bỏ qua
      if (!label) return { error: `Cột "${title}", dòng ${li + 1}: vui lòng nhập chữ hiển thị` };
      if (!url) return { error: `Cột "${title}", dòng ${li + 1}: vui lòng nhập đường dẫn` };
      if (label.length > LIMITS.label || url.length > LIMITS.url) return { error: `Cột "${title}", dòng ${li + 1}: nội dung quá dài` };
      if (!URL_RE.test(url)) {
        return { error: `Cột "${title}", dòng ${li + 1}: đường dẫn phải bắt đầu bằng "/" (trang trong website) hoặc "https://"` };
      }
      links.push({ label, url });
    }
    columns.push({ title, links });
  }
  return { footer: { aboutText, columns, contactTitle, copyright } };
}

const linkSchema = { label: { type: String }, url: { type: String }, _id: false };
const footerSchemaDefinition = {
  aboutText: { type: String, default: DEFAULT_FOOTER.aboutText },
  columns: { type: [{ title: String, links: [linkSchema], _id: false }], default: () => DEFAULT_FOOTER.columns },
  contactTitle: { type: String, default: DEFAULT_FOOTER.contactTitle },
  copyright: { type: String, default: DEFAULT_FOOTER.copyright }
};

module.exports = { DEFAULT_FOOTER, parseFooter, footerSchemaDefinition, MAX_COLUMNS, MAX_LINKS };
