// main.jsx - ĐIỂM KHỞI CHẠY frontend: gắn ứng dụng React vào thẻ <div id="root"> trong index.html
import React from 'react';
import ReactDOM from 'react-dom/client'; // React 18: createRoot
import App from './App.jsx'; // toàn bộ định tuyến + provider
import './scss/custom.scss'; // Bootstrap đã tùy biến màu
import './index.css'; // CSS chung
import './storefront.css'; // CSS trang bán hàng

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode> {/* chế độ nghiêm ngặt: cảnh báo code lỗi thời khi lập trình (không ảnh hưởng bản build) */}
    <App />
  </React.StrictMode>
);
