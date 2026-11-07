import { useEffect, useState } from 'react';

// Thanh kéo 2 đầu (chọn khoảng "từ - đến") - 2 ô input range chồng lên nhau, không cần thư viện ngoài.
// - onChange: gọi liên tục khi đang kéo (cập nhật nhãn hiển thị)
// - onCommit: gọi khi thả chuột / nhấc tay / dùng bàn phím xong -> nơi gọi API lọc (tránh gọi API liên tục)
// Kéo được bằng chuột, cảm ứng và phím mũi tên (có aria-label cho trình đọc màn hình).
export default function RangeSlider({ min, max, step = 1, value, onCommit, format = (v) => v, label = 'Khoảng giá trị', id }) {
  const [lo, hi] = value;
  const [local, setLocal] = useState([lo, hi]);
  useEffect(() => setLocal([lo, hi]), [lo, hi]);

  if (!(max > min)) return null;
  const pct = (v) => ((v - min) / (max - min)) * 100;
  const commit = () => {
    if (local[0] !== lo || local[1] !== hi) onCommit(local);
  };
  const setLo = (v) => setLocal(([, h]) => [Math.min(Number(v), h), h]);
  const setHi = (v) => setLocal(([l]) => [l, Math.max(Number(v), l)]);
  const common = { min, max, step, onMouseUp: commit, onTouchEnd: commit, onKeyUp: commit, onBlur: commit };

  return (
    <div className="range-slider" id={id}>
      <div className="d-flex justify-content-between small fw-medium mb-1">
        <span>{format(local[0])}</span>
        <span>{format(local[1])}</span>
      </div>
      <div className="range-slider-track">
        <div className="range-slider-fill" style={{ left: `${pct(local[0])}%`, right: `${100 - pct(local[1])}%` }} />
        <input
          type="range"
          {...common}
          value={local[0]}
          aria-label={`${label} - từ`}
          onChange={(e) => setLo(e.target.value)}
          // Đầu "từ" kéo sát đầu "đến" thì vẫn phải nắm được -> đưa lên trên khi ở nửa phải
          style={{ zIndex: pct(local[0]) > 50 ? 4 : 3 }}
        />
        <input type="range" {...common} value={local[1]} aria-label={`${label} - đến`} onChange={(e) => setHi(e.target.value)} />
      </div>
    </div>
  );
}
