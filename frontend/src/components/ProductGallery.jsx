import { useEffect, useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';
import ProductImage from './ProductImage';
import { sizedImage } from '../utils/imageUrl';
import { placeholderImage } from '../utils/placeholderImage';

// Thư viện ảnh trang chi tiết: ảnh lớn có nút trước/sau, bộ đếm, vuốt trên điện thoại, bấm để xem toàn
// màn hình (dùng được phím ← → và Esc), dải ảnh thu nhỏ. `overlay` là nội dung phủ lên ảnh (VD: nút yêu thích).
export default function ProductGallery({ images, title, active, onChange, overlay }) {
  const list = images?.length ? images : [placeholderImage(600, 600)];
  const [fullscreen, setFullscreen] = useState(false);
  const touchStartX = useRef(null);
  const thumbsRef = useRef(null);
  const count = list.length;
  const index = Math.min(active, count - 1);

  const go = (delta) => onChange((index + delta + count) % count);

  // Phím ← → khi đang xem toàn màn hình
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Tự cuộn dải ảnh thu nhỏ để ảnh đang chọn luôn nhìn thấy được
  useEffect(() => {
    thumbsRef.current?.children[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [index]);

  const onTouchStart = (e) => (touchStartX.current = e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40 && count > 1) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const arrows = (extraClass = '') =>
    count > 1 && (
      <>
        <button type="button" aria-label="Ảnh trước" className={`gallery-arrow start-0 ms-2 ${extraClass}`} onClick={(e) => { e.stopPropagation(); go(-1); }}>
          ‹
        </button>
        <button type="button" aria-label="Ảnh sau" className={`gallery-arrow end-0 me-2 ${extraClass}`} onClick={(e) => { e.stopPropagation(); go(1); }}>
          ›
        </button>
      </>
    );

  return (
    <div>
      <div className="gallery-wrap position-relative rounded-3 overflow-hidden border mb-2">
        <div
          className="gallery-main"
          role="button"
          aria-label="Xem ảnh toàn màn hình"
          onClick={() => setFullscreen(true)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <ProductImage src={list[index]} alt={`${title} - ảnh ${index + 1}`} size={640} eager />
        </div>
        {arrows()}
        {count > 1 && (
          <span className="gallery-counter">
            {index + 1}/{count}
          </span>
        )}
        {overlay}
      </div>

      {count > 1 && (
        <div ref={thumbsRef} className="gallery-thumbs d-flex gap-2 overflow-auto pb-1">
          {list.map((img, idx) => (
            <button
              key={`${img}-${idx}`}
              type="button"
              aria-label={`Xem ảnh ${idx + 1}`}
              className={`gallery-thumb ${idx === index ? 'active' : ''}`}
              onClick={() => onChange(idx)}
            >
              <ProductImage src={img} alt="" size={96} />
            </button>
          ))}
        </div>
      )}

      <Modal show={fullscreen} onHide={() => setFullscreen(false)} centered size="xl" className="lightbox">
        <Modal.Body className="position-relative p-0 text-center" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button
            type="button"
            aria-label="Đóng"
            className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
            style={{ zIndex: 3 }}
            onClick={() => setFullscreen(false)}
          />
          <img src={sizedImage(list[index], 1200)} alt={`${title} - ảnh ${index + 1}`} className="lightbox-img w-100" />
          {arrows()}
          {count > 1 && (
            <span className="gallery-counter">
              {index + 1}/{count}
            </span>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}
