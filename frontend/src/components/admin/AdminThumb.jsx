import { useState } from 'react';
import { Image as ImageIcon } from 'react-bootstrap-icons';

// Ảnh thu nhỏ cho các bảng danh sách trang quản trị.
// - Không có ảnh / ảnh lỗi -> ô xám có icon (hoặc chữ cái đầu nếu truyền `name`, dùng cho avatar)
// - Di chuột vào ảnh -> phóng to xem nhanh (CSS .admin-thumb trong index.css)
// - rounded: true -> ảnh tròn (avatar khách hàng)
export default function AdminThumb({ src, alt = '', size = 48, ratio = 1, rounded = false, name, contain = true }) {
  const [broken, setBroken] = useState(false);
  const w = Math.round(size * ratio);
  const style = { width: w, height: size, borderRadius: rounded ? '50%' : 8 };

  if (!src || broken) {
    const initial = name?.trim()?.[0]?.toUpperCase();
    return (
      <div className="admin-thumb admin-thumb-empty" style={style} aria-hidden="true">
        {initial || <ImageIcon size={size * 0.4} />}
      </div>
    );
  }
  return (
    <div className={`admin-thumb${rounded ? '' : ' admin-thumb-zoom'}`} style={style}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ objectFit: contain && !rounded ? 'contain' : 'cover' }}
      />
    </div>
  );
}
