// Trả về link ảnh đúng kích thước cần hiển thị. Ảnh Unsplash hỗ trợ đổi kích thước qua tham số URL (w, h),
// nên ảnh nhỏ (thẻ sản phẩm, ảnh thu nhỏ) chỉ tải bản nhỏ thay vì bản 900px - trang tải nhanh hơn nhiều.
// Ảnh từ nguồn khác (Cloudinary, ảnh admin tự tải lên...) giữ nguyên link.
export function sizedImage(url, width) {
  if (!url || !url.startsWith('https://images.unsplash.com/')) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('w', String(width));
    u.searchParams.set('h', String(width));
    u.searchParams.set('fit', 'crop');
    u.searchParams.set('auto', 'format');
    u.searchParams.set('q', width <= 200 ? '60' : '75');
    return u.toString();
  } catch {
    return url;
  }
}

// srcSet cho màn hình độ phân giải cao (Retina): bản 1x và 2x
export function imageSrcSet(url, width) {
  if (!url || !url.startsWith('https://images.unsplash.com/')) return undefined;
  return `${sizedImage(url, width)} 1x, ${sizedImage(url, width * 2)} 2x`;
}
