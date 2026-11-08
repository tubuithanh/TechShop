import { useEffect, useState } from 'react';

// Chế độ sáng / tối cho trang bán hàng (Bootstrap 5.3: thuộc tính data-bs-theme trên <html>).
// Lựa chọn của khách được ghi nhớ; chưa chọn thì theo cài đặt của máy. Trang quản trị luôn giữ giao diện
// sáng (AdminLayout đặt data-bs-theme="light" cho khung riêng của nó).
const KEY = 'techshop.colorMode';

function preferred() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage bị chặn */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyColorMode(mode = preferred()) {
  document.documentElement.setAttribute('data-bs-theme', mode);
  return mode;
}

export function useColorMode() {
  const [mode, setMode] = useState(() => applyColorMode());
  useEffect(() => {
    applyColorMode(mode);
  }, [mode]);
  const toggle = () =>
    setMode((m) => {
      const next = m === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* chỉ không ghi nhớ được */
      }
      return next;
    });
  return [mode, toggle];
}
