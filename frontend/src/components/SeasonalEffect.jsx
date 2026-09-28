import { useMemo } from 'react';

// Hiệu ứng trang trí theo mùa (tuyết / hoa mai / lá thu rơi nhẹ) trên trang khách hàng.
// Không chặn thao tác (pointer-events: none), tự tắt khi người dùng bật "giảm chuyển động" của hệ điều hành.
const SYMBOLS = {
  snow: ['❄', '❅', '❆', '•'],
  blossom: ['🌼', '✿', '🌸', '✾'],
  leaves: ['🍂', '🍁', '🍂', '🍃']
};
const COLORS = {
  snow: ['#ffffff', '#e0f2fe', '#f8fafc'],
  blossom: ['#facc15', '#fde047', '#f59e0b', '#fb7185'],
  leaves: ['#ea580c', '#b45309', '#ca8a04', '#9a3412']
};

// contained: chỉ hiện trong khung chứa (khung xem trước ở trang quản trị) thay vì phủ toàn màn hình
export default function SeasonalEffect({ effect, count = 18, contained = false }) {
  const flakes = useMemo(() => {
    if (!SYMBOLS[effect]) return [];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      symbol: SYMBOLS[effect][i % SYMBOLS[effect].length],
      color: COLORS[effect][i % COLORS[effect].length],
      left: Math.random() * 100,
      size: 12 + Math.random() * 14,
      duration: 9 + Math.random() * 10,
      delay: -Math.random() * 18,
      drift: (Math.random() - 0.5) * 120
    }));
  }, [effect, count]);

  if (!flakes.length) return null;
  return (
    <div className={`seasonal-effect${contained ? ' seasonal-effect-contained' : ''}`} aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          className={`seasonal-flake seasonal-${effect}`}
          style={{
            left: `${f.left}%`,
            fontSize: f.size,
            color: f.color,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            '--drift': `${f.drift}px`
          }}
        >
          {f.symbol}
        </span>
      ))}
    </div>
  );
}
