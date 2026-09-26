import { useEffect, useState } from 'react';
import { sizedImage, imageSrcSet } from '../utils/imageUrl';
import { placeholderImage } from '../utils/placeholderImage';

// Ảnh sản phẩm dùng chung: khung vuông, ảnh phủ kín khung (cover), hiệu ứng "đang tải" và tự thay bằng ảnh
// mặc định nếu link ảnh hỏng. `size` là kích thước hiển thị (px) - dùng để tải ảnh vừa đủ nét.
export default function ProductImage({ src, alt, size = 400, className = '', imgClassName = '', fit = 'cover', eager = false, style }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Đổi ảnh (VD: chọn màu khác) thì hiện lại hiệu ứng đang tải
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const finalSrc = failed || !src ? placeholderImage(size, size) : sizedImage(src, size);

  return (
    <div className={`product-image position-relative overflow-hidden ${loaded ? '' : 'skeleton'} ${className}`} style={{ aspectRatio: '1 / 1', ...style }}>
      <img
        src={finalSrc}
        srcSet={failed ? undefined : imageSrcSet(src, size)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!failed) setFailed(true);
          else setLoaded(true);
        }}
        className={`w-100 h-100 ${imgClassName}`}
        style={{ objectFit: fit, opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
      />
    </div>
  );
}
