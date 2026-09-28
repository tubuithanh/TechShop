import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { settingService } from '../services/settingService';
import { applyTheme, DEFAULT_THEME } from '../utils/theme';
import { applyHead, cachedHead, headOf } from '../utils/siteHead';

// Nhớ bộ màu lần trước trong trình duyệt để tô màu NGAY khi mở trang, tránh chớp màu đỏ mặc định
// trong lúc chờ API cấu hình trả về
const THEME_CACHE_KEY = 'techshop-theme';
function cachedTheme() {
  try {
    return JSON.parse(localStorage.getItem(THEME_CACHE_KEY)) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
applyTheme(cachedTheme());
// Tiêu đề / mô tả / favicon lần trước -> áp dụng ngay, không chờ API
applyHead(cachedHead());

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  siteName: 'TechShop',
  tagline: 'Website thương mại điện tử đa chi nhánh',
  logoUrl: '',
  faviconUrl: '',
  hotline: '1900 0000',
  contactEmail: 'support@techshop.demo',
  contactAddress: '',
  socialLinks: { facebook: '', zalo: '', youtube: '', instagram: '' },
  productsPerPage: 20,
  maxImagesPerProduct: 10,
  defaultShippingFee: 30000,
  freeShippingThreshold: 0,
  maintenanceMode: false,
  maintenanceMessage: '',
  seo: { metaTitle: '', metaDescription: '' },
  theme: cachedTheme()
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    const data = await settingService.getSettings();
    setSettings(data);
    return data;
  }, []);

  useEffect(() => {
    refreshSettings().finally(() => setLoading(false));
  }, [refreshSettings]);

  // Cập nhật tiêu đề trang & favicon động theo cấu hình - một điểm nhấn thường thấy ở các
  // website TMĐT chuyên nghiệp (cho phép đổi thương hiệu mà không cần sửa code/deploy lại).
  // Áp dụng màu sắc giao diện mỗi khi cấu hình thay đổi
  useEffect(() => {
    applyTheme(settings.theme);
    try {
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(settings.theme || DEFAULT_THEME));
    } catch {
      /* trình duyệt chặn lưu trữ - bỏ qua */
    }
  }, [settings.theme]);

  // Tiêu đề (Tiêu đề SEO / tên website), mô tả SEO và favicon theo cấu hình - chỉ áp dụng khi đã tải xong cấu hình
  // thật (không ghi đè bằng giá trị mặc định lúc đang tải), và nhớ lại cho lần mở trang sau
  useEffect(() => {
    if (loading) return;
    applyHead(headOf(settings), { remember: true });
  }, [settings, loading]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
