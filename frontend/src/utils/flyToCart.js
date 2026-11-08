// Hiệu ứng "bay vào giỏ": nhân bản ảnh sản phẩm, bay theo đường cong tới biểu tượng giỏ hàng trên header
// (phần tử có [data-cart-target]) rồi làm biểu tượng giỏ "nảy" nhẹ. Tôn trọng cài đặt giảm chuyển động của máy.
export function flyToCart(sourceEl) {
  const targets = [...document.querySelectorAll('[data-cart-target]')].filter((el) => el.offsetParent !== null);
  const target = targets[0];
  if (!sourceEl || !target) return;
  const bump = () => {
    target.classList.remove('cart-bump');
    void target.offsetWidth; // khởi động lại animation
    target.classList.add('cart-bump');
  };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !sourceEl.animate) return bump();

  const from = sourceEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const size = Math.min(from.width, from.height, 140);
  const clone = sourceEl.cloneNode(true);
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left + (from.width - size) / 2}px`,
    top: `${from.top + (from.height - size) / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'contain',
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 10px 30px rgba(0,0,0,.25)',
    zIndex: 2000,
    pointerEvents: 'none',
    opacity: 1
  });
  document.body.appendChild(clone);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = clone.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 80}px) scale(0.55)`, opacity: 0.95, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.4 }
    ],
    { duration: 750, easing: 'cubic-bezier(.5,-0.1,.6,1)' }
  );
  anim.onfinish = () => {
    clone.remove();
    bump();
  };
}
