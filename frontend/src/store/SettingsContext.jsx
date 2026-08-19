import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { settingService } from '../services/settingService';

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
  seo: { metaTitle: '', metaDescription: '' }
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
  useEffect(() => {
    if (settings.seo?.metaTitle || settings.siteName) {
      document.title = settings.seo?.metaTitle || settings.siteName;
    }
    if (settings.faviconUrl) {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
