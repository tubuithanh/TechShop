import { useEffect, useRef, useState } from 'react';

// Số đếm tăng dần từ 0 tới target khi phần tử xuất hiện trong khung nhìn (hoặc ngay khi mount
// nếu đã nằm trong viewport sẵn, ví dụ các thẻ chỉ số ở đầu trang admin dashboard).
export default function AnimatedCounter({ target, suffix = '', prefix = '', decimals = 0, format }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          const duration = 900;
          const start = performance.now();
          const step = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = target * (1 - Math.pow(1 - progress, 3));
            setValue(Number(eased.toFixed(decimals)));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, decimals]);

  const display = format
    ? format(value)
    : `${prefix}${decimals > 0 ? value.toFixed(decimals) : value.toLocaleString('vi-VN')}${suffix}`;

  return <span ref={ref}>{display}</span>;
}
