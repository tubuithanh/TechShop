import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../store/SettingsContext';
import { siteTitleOf } from '../utils/siteHead';

// Mỗi lần chuyển trang: đặt lại tiêu đề mặc định theo Cấu hình hệ thống. Đặt TRƯỚC <Routes> nên chạy trước
// effect của trang con -> trang nào có tiêu đề riêng (Chính sách, Tra cứu bảo hành...) sẽ ghi đè sau đó.
// Trước đây tiêu đề riêng của trang trước bị giữ lại khi chuyển sang trang khác.
export default function TitleManager() {
  const { pathname } = useLocation();
  const { settings, loading } = useSettings();
  // Phụ thuộc vào CHUỖI tiêu đề (không phải cả đối tượng settings) - tải lại cấu hình mà tiêu đề không đổi thì
  // không ghi đè tiêu đề riêng của trang đang xem
  const siteTitle = siteTitleOf(settings);
  useEffect(() => {
    if (!loading) document.title = siteTitle;
  }, [pathname, siteTitle, loading]);
  return null;
}
