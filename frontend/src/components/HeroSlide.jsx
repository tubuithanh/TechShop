import { Link } from 'react-router-dom';
import { Badge, Button } from 'react-bootstrap';

// Nền của slide: theo màu giao diện / dải 2 màu / ảnh (có lớp phủ tối để chữ dễ đọc)
export function slideBackground(slide) {
  if (slide.bgType === 'image' && slide.imageUrl) {
    const overlay = slide.darkOverlay !== false ? 'linear-gradient(90deg, rgba(0,0,0,.6), rgba(0,0,0,.15)), ' : '';
    return `${overlay}url("${String(slide.imageUrl).replace(/"/g, '%22')}") center / cover no-repeat`;
  }
  if (slide.bgType === 'gradient') return `linear-gradient(135deg, ${slide.colorFrom || '#dc2626'}, ${slide.colorTo || '#f97316'})`;
  return 'linear-gradient(135deg, var(--bs-primary), var(--site-hero-end, #f97316))'; // theo màu sắc giao diện
}

// 1 slide ở đầu trang chủ - dùng chung cho trang chủ và khung xem trước trong trang quản trị (preview=true: nút
// không chuyển trang, chữ nhỏ hơn)
export default function HeroSlide({ slide, preview = false }) {
  const dark = slide.textColor === 'dark';
  const link = slide.buttonLink || '';
  const internal = /^\/(?!\/)/.test(link);
  const buttonProps = preview
    ? { as: 'span' }
    : internal
      ? { as: Link, to: link }
      : { href: link, target: '_blank', rel: 'noreferrer' };

  return (
    <div
      className={`d-flex align-items-center position-relative overflow-hidden ${dark ? 'text-dark' : 'text-white'} ${preview ? 'p-3 p-md-4' : 'p-4 p-md-5'}`}
      style={{ background: slideBackground(slide), minHeight: preview ? 200 : 280 }}
    >
      {slide.bgType !== 'image' && (
        <>
          <div className="hero-dots" />
          <div className="hero-decor" style={{ width: 260, height: 260, top: -80, right: -60 }} />
          <div className="hero-decor" style={{ width: 160, height: 160, bottom: -60, right: 120 }} />
        </>
      )}
      <div className="position-relative" style={{ maxWidth: '34rem' }}>
        {slide.eyebrow && (
          <Badge bg={dark ? 'dark' : 'light'} text={dark ? 'light' : 'dark'} className="rounded-pill fw-medium mb-3 px-3 py-2">
            {slide.eyebrow}
          </Badge>
        )}
        <h1 className={`${preview ? 'fs-3' : 'fs-1'} fw-bold mb-3`}>{slide.title || 'Tiêu đề slide'}</h1>
        {slide.subtitle && (
          <p className={`${preview ? 'small' : 'fs-6'} mb-4`} style={{ opacity: 0.92 }}>
            {slide.subtitle}
          </p>
        )}
        {slide.buttonText && link && (
          <Button {...buttonProps} variant={dark ? 'dark' : 'light'} size={preview ? 'sm' : 'lg'} className="fw-semibold rounded-pill px-4">
            {slide.buttonText}
          </Button>
        )}
      </div>
    </div>
  );
}
