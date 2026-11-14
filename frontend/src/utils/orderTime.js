// Hiển thị thời gian đặt hàng thống nhất: "14:35 · 12/11/2026" + "2 giờ trước"
export const orderDateTime = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return `${t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
};

export const timeAgo = (d) => {
  if (!d) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
};
