import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { CartProvider } from './store/CartContext';
import { SettingsProvider, useSettings } from './store/SettingsContext';

import Header from './components/Header';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import ChatWidget from './components/ChatWidget';
import MaintenancePage from './pages/MaintenancePage';

import HomePage from './pages/HomePage';
import ProductListPage from './pages/ProductListPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ComparePage from './pages/ComparePage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import StoreLocatorPage from './pages/StoreLocatorPage';
import PromotionsPage from './pages/PromotionsPage';
import ArticleListPage from './pages/PostListPage';
import ArticleDetailPage from './pages/PostDetailPage';

import AccountLayout from './pages/account/AccountLayout';
import ProfilePage from './pages/account/ProfilePage';
import AddressBookPage from './pages/account/AddressBookPage';
import WishlistPage from './pages/account/WishlistPage';
import MyOrdersPage from './pages/MyOrdersPage';
import MyWarrantiesPage from './pages/MyWarrantiesPage';
import NotificationsPage from './pages/account/NotificationsPage';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminWarrantiesPage from './pages/admin/AdminWarrantiesPage';
import AdminCustomersPage from './pages/admin/AdminCustomersPage';
import AdminVouchersPage from './pages/admin/AdminVouchersPage';
import AdminReviewsPage from './pages/admin/AdminReviewsPage';
import AdminInventoryPage from './pages/admin/AdminInventoryPage';
import AdminArticlesPage from './pages/admin/AdminArticlesPage';
import AdminChatPage from './pages/admin/AdminChatPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';

// Chặn truy cập toàn site khi bật chế độ bảo trì (Admin > Cấu hình hệ thống), trừ trang /login
// (để admin/staff vẫn đăng nhập được và tự tắt bảo trì) và các tài khoản admin/staff đã đăng nhập.
function MaintenanceGate({ children }) {
  const { settings, loading: settingsLoading } = useSettings();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  if (settingsLoading || authLoading) return null;

  const isStaffOrAdmin = user && ['admin', 'staff'].includes(user.role);
  if (settings.maintenanceMode && !isStaffOrAdmin && location.pathname !== '/login') {
    return <MaintenancePage message={settings.maintenanceMessage} />;
  }
  return children;
}

function StorefrontLayout({ children }) {
  return (
    <div className="d-flex flex-column min-vh-100 bg-light">
      <Header />
      <div className="flex-grow-1">{children}</div>
      <Footer />
      <ChatWidget />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <SettingsProvider>
            <MaintenanceGate>
              <Routes>
                {/* ===== Trang khách hàng (public) ===== */}
                <Route path="/" element={<StorefrontLayout><HomePage /></StorefrontLayout>} />
                <Route path="/products" element={<StorefrontLayout><ProductListPage /></StorefrontLayout>} />
                <Route path="/products/:slug" element={<StorefrontLayout><ProductDetailPage /></StorefrontLayout>} />
                <Route path="/compare" element={<StorefrontLayout><ComparePage /></StorefrontLayout>} />
                <Route path="/cart" element={<StorefrontLayout><CartPage /></StorefrontLayout>} />
                <Route path="/login" element={<StorefrontLayout><LoginPage /></StorefrontLayout>} />
                <Route path="/register" element={<StorefrontLayout><RegisterPage /></StorefrontLayout>} />
                <Route path="/terms" element={<StorefrontLayout><TermsPage /></StorefrontLayout>} />
                <Route path="/privacy" element={<StorefrontLayout><PrivacyPage /></StorefrontLayout>} />
                <Route path="/stores" element={<StorefrontLayout><StoreLocatorPage /></StorefrontLayout>} />
                <Route path="/promotions" element={<StorefrontLayout><PromotionsPage /></StorefrontLayout>} />
                <Route path="/tin-tuc" element={<StorefrontLayout><ArticleListPage /></StorefrontLayout>} />
                <Route path="/tin-tuc/:slug" element={<StorefrontLayout><ArticleDetailPage /></StorefrontLayout>} />

                {/* ===== Cần đăng nhập ===== */}
                <Route
                  path="/checkout"
                  element={
                    <StorefrontLayout>
                      <PrivateRoute>
                        <CheckoutPage />
                      </PrivateRoute>
                    </StorefrontLayout>
                  }
                />

                {/* Trung tâm tài khoản - có sidebar chung (mục 1.1.7) */}
                <Route
                  path="/account"
                  element={
                    <StorefrontLayout>
                      <PrivateRoute>
                        <AccountLayout />
                      </PrivateRoute>
                    </StorefrontLayout>
                  }
                >
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="addresses" element={<AddressBookPage />} />
                  <Route path="wishlist" element={<WishlistPage />} />
                  <Route path="orders" element={<MyOrdersPage />} />
                  <Route path="warranties" element={<MyWarrantiesPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                </Route>
                <Route
                  path="/account/orders/:id"
                  element={
                    <StorefrontLayout>
                      <PrivateRoute>
                        <OrderDetailPage />
                      </PrivateRoute>
                    </StorefrontLayout>
                  }
                />

                {/* ===== Trang quản trị ===== */}
                <Route
                  path="/admin"
                  element={
                    <PrivateRoute roles={['admin', 'staff']}>
                      <AdminLayout />
                    </PrivateRoute>
                  }
                >
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="products" element={<AdminProductsPage />} />
                  <Route path="orders" element={<AdminOrdersPage />} />
                  <Route path="warranties" element={<AdminWarrantiesPage />} />
                  <Route path="customers" element={<AdminCustomersPage />} />
                  <Route path="vouchers" element={<AdminVouchersPage />} />
                  <Route path="reviews" element={<AdminReviewsPage />} />
                  <Route path="inventory" element={<AdminInventoryPage />} />
                  <Route path="articles" element={<AdminArticlesPage />} />
                  <Route path="chat" element={<AdminChatPage />} />
                  <Route path="audit-logs" element={<AdminAuditLogPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>
              </Routes>
            </MaintenanceGate>
          </SettingsProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
