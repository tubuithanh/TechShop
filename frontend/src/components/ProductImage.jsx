import { useCallback, useState } from 'react';
import { sizedImage, imageSrcSet } from '../utils/imageUrl';
import { placeholderImage } from '../utils/placeholderImage';

// Ảnh sản phẩm dùng chung: khung vuông, ảnh phủ kín khung (cover), hiệu ứng "đang tải" và tự thay bằng ảnh
// mặc định nếu link ảnh hỏng. `size` là kích thước hiển thị (px) - dùng để tải ảnh vừa đủ nét.
//
// Trạng thái "đã tải" gắn với ĐÚNG link ảnh (loadedSrc === link đang hiển thị) thay vì cờ true/false đặt lại
// trong useEffect: trước đây ảnh có sẵn trong bộ nhớ đệm tải xong NGAY (onLoad chạy trước), sau đó useEffect mới
// chạy và đặt lại "chưa tải" -> ảnh kẹt ở opacity 0 (khung xám "đang tải" mãi dù ảnh đã tải xong).
export default function ProductImage({ src, alt, size = 400, className = '', imgClassName = '', fit = 'cover', eager = false, style }) {
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [failedSrc, setFailedSrc] = useState(null);

  const failed = !src || failedSrc === src;
  const finalSrc = failed ? placeholderImage(size, size) : sizedImage(src, size);
  const loaded = loadedSrc === finalSrc;

  // Ảnh đã có trong bộ nhớ đệm có thể tải xong trước khi React gắn onLoad -> kiểm tra ngay khi gắn vào trang
  const imgRef = useCallback(
    (img) => {
      if (img && img.complete && img.naturalWidth > 0) setLoadedSrc(finalSrc);
    },
    [finalSrc]
  );

  return (
    <div className={`product-image position-relative overflow-hidden ${loaded ? '' : 'skeleton'} ${className}`} style={{ aspectRatio: '1 / 1', ...style }}>
      <img
        ref={imgRef}
        src={finalSrc}
        srcSet={failed ? undefined : imageSrcSet(src, size)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoadedSrc(finalSrc)}
        onError={() => {
          if (!failed) setFailedSrc(src); // link hỏng -> đổi sang ảnh mặc định
          else setLoadedSrc(finalSrc); // ảnh mặc định cũng lỗi -> thôi hiệu ứng đang tải
        }}
        className={`w-100 h-100 ${imgClassName}`}
        style={{ objectFit: fit, opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
      />
    </div>
  );
}
