# TechShop — Website Thương mại điện tử Đa chi nhánh (Đồ án tốt nghiệp — MERN Stack)

Mô phỏng mô hình kinh doanh và chức năng cốt lõi của **thegioididong.com**, xây dựng bằng **MongoDB – Express.js – React.js – Node.js**.

**Cập nhật quan trọng:** Cơ sở dữ liệu đã được refactor hoàn toàn theo thiết kế `ecommerce_multistore_db` — mô hình **đa chi nhánh thực sự** (mỗi cửa hàng có tồn kho riêng), và **tách biệt collection `users` (khách hàng) với `admins` (quản trị/nhân viên)** thay vì gộp chung bằng trường `role`.

## Cấu trúc dự án

```
mern-ecommerce/
├── backend/          # RESTful API (Node.js + Express + MongoDB)
│   ├── config/        # Kết nối database
│   ├── models/        # Mongoose Schema (User, Product, Order, Warranty...)
│   ├── controllers/   # Xử lý nghiệp vụ
│   ├── routes/        # Định nghĩa API endpoint
│   ├── middlewares/    # Xác thực JWT, phân quyền, xử lý lỗi
│   ├── seed/           # Dữ liệu mẫu
│   ├── tests/           # Unit/Integration test (Jest + Supertest)
│   ├── app.js           # Cấu hình Express app
│   └── server.js        # Điểm khởi chạy + Socket.io
└── frontend/          # Giao diện React (SPA)
    └── src/
        ├── components/  # Header, Footer, ProductCard, PrivateRoute...
        ├── pages/         # Các trang khách hàng + trang quản trị (admin/)
        ├── services/       # Gọi API (axios)
        └── store/           # AuthContext, CartContext (state toàn cục)
```

## Yêu cầu môi trường

- Node.js >= 18
- MongoDB (cài local hoặc dùng MongoDB Atlas miễn phí)

## Hướng dẫn cài đặt và chạy thử

### 1. Backend

```
cd backend
npm install
cp .env.example .env
```
Mở file `.env`, chỉnh `MONGO_URI` trỏ đến MongoDB của bạn nếu cần.

```
npm run seed
npm run dev
```
Backend chạy tại `http://localhost:5000`.

**Tài khoản demo sau khi seed:**

| Vai trò | Collection | Email | Mật khẩu |
|---|---|---|---|
| Quản trị viên | admins | admin@example.com | admin123 |
| Nhân viên | admins | staff@example.com | staff123 |
| Khách hàng | users | customer@example.com | customer123 |

**Lưu ý:** `admins` và `users` là 2 collection tách biệt. API đăng nhập tự thử tìm trong `users` trước, nếu không thấy mới thử `admins`.

### 2. Frontend

Mở terminal khác:
```
cd frontend
npm install
npm run dev
```
Frontend chạy tại `http://localhost:5173` (tự động proxy API sang `http://localhost:5000`).

### 3. Chạy kiểm thử Backend (Jest + Supertest)

```
cd backend
npm test
```
Lưu ý: bộ test dùng `mongodb-memory-server` để tự động tải MongoDB tạm thời chạy trong bộ nhớ — cần máy có kết nối internet ở lần chạy đầu tiên để tải binary MongoDB.

## Cấu trúc Database (ecommerce_multistore_db)

Hệ thống dùng **mô hình đa chi nhánh (multi-store) thực sự**: mỗi cửa hàng quản lý tồn kho riêng cho từng sản phẩm, thay vì 1 con số tồn kho chung.

**18 collection chính:**

| Collection | Vai trò |
|---|---|
| `users` | Tài khoản khách hàng (nhúng địa chỉ, wishlist, saved posts) |
| `admins` | Tài khoản quản trị/nhân viên — **tách riêng khỏi users** |
| `brands` | Nhãn hàng (Apple, Samsung...) |
| `categories` | Danh mục sản phẩm |
| `products` | Sản phẩm (tham chiếu brandId, categoryId) |
| `stores` | Cửa hàng/chi nhánh |
| `store_inventories` | **Tồn kho riêng theo từng cặp (cửa hàng, sản phẩm)** |
| `collections` | Bộ sưu tập sản phẩm (VD: "Flagship 2024") |
| `orders` | Đơn hàng (gắn với storeId, nhúng deliveryAddress) |
| `reviews` | Đánh giá sản phẩm |
| `posts` | Bài viết tin tức (nhúng comments) |
| `carts`, `warranties`, `vouchers`, `notifications`, `questions`, `otps`, `chat_messages`, `audit_logs` | Các collection nghiệp vụ mở rộng |

**Đặc điểm quan trọng cần lưu ý khi trình bày báo cáo:**
- Đăng nhập phải thử cả 2 collection (`users` rồi `admins`) vì không còn trường `role` chung để phân biệt trong 1 bảng
- Đặt hàng bắt buộc chọn `storeId` — hệ thống kiểm tra và trừ tồn kho đúng theo chi nhánh đã chọn, không phải tồn kho toàn hệ thống
- Khi hủy đơn, tồn kho được hoàn lại đúng về chi nhánh đã bán



**Khách hàng:**
- Đăng ký theo luồng 3 bước (email → OTP → hoàn tất, có đo độ mạnh mật khẩu, bắt buộc đồng ý điều khoản) — mục 1.1.21
- Đăng nhập JWT, quản lý phiên qua refresh token httpOnly cookie
- Trang chủ, danh mục, tìm kiếm & lọc sản phẩm — mục 1.1.1, 1.1.2, 1.1.3
- Chi tiết sản phẩm: gallery ảnh, breadcrumb, 4 tab (mô tả/thông số/đánh giá/hỏi đáp), tính trả góp, wishlist, sticky buy bar — mục 1.1.4
- So sánh sản phẩm song song — mục 1.1.5
- Giỏ hàng, đặt hàng, áp mã giảm giá, chọn hình thức nhận hàng — mục 1.1.6
- **Trung tâm tài khoản đầy đủ**: thông tin cá nhân, đổi mật khẩu, sổ địa chỉ (thêm/sửa/xóa/đặt mặc định), danh sách yêu thích — mục 1.1.7
- Đánh giá & Hỏi đáp (Q&A) sản phẩm — mục 1.1.8
- **Trang khuyến mãi** công khai (sao chép mã) — mục 1.1.9
- **Hệ thống cửa hàng**: tra cứu theo tỉnh/thành, chỉ đường Google Maps — mục 1.1.11
- Bảo hành: gửi yêu cầu, theo dõi tiến độ, lịch sử — mục 1.1.14
- Theo dõi đơn hàng thời gian thực (Socket.io), hủy đơn
- **Trung tâm thông báo**: danh sách, đánh dấu đã đọc — mục 1.1.18
- **Tin tức & Cẩm nang công nghệ**: xem bài viết theo danh mục, chi tiết bài viết kèm sản phẩm liên quan — mục 1.1.10
- **Chat trực tuyến với CSKH** (widget nổi, real-time qua Socket.io, lưu lịch sử) — mục 1.1.12

**Quản trị:**
- Quản lý sản phẩm/danh mục (CRUD) — mục 1.2.1
- Quản lý đơn hàng theo luồng trạng thái — mục 1.2.2
- **Quản lý khách hàng**: tìm kiếm, khóa/mở tài khoản — mục 1.2.3
- **Quản lý khuyến mãi/voucher**: tạo, xem, vô hiệu hóa — mục 1.2.5
- **Quản lý đánh giá**: duyệt/ẩn, phản hồi khách hàng — mục 1.2.7
- Quản lý bảo hành theo tiến độ xử lý
- Dashboard thống kê (MongoDB Aggregation + Recharts) — mục 1.2.8
- **Quản lý tin tức (CMS)**: viết/sửa/xóa bài viết — mục 1.2.6
- **Trả lời chat khách hàng** theo từng hội thoại — mục 1.1.12
- **Nhật ký thao tác quản trị (Audit Log)**: tự động ghi lại mọi hành động tạo/sửa/xóa — mục 1.2.0, 1.2.4

**Kỹ thuật nổi bật:** JWT access + refresh token, bcrypt, OTP với TTL index tự xóa, rate limiting, cursor-based pagination, Socket.io real-time, kiến trúc RESTful theo layer rõ ràng.

## Còn thiếu so với tài liệu phân tích đầy đủ (chưa triển khai trong bản demo này)

- Tích hợp cổng thanh toán thật (VNPay/Momo sandbox) — hiện chỉ mô phỏng lựa chọn
- Upload ảnh qua Cloudinary/AWS S3 (hiện dùng URL ảnh placeholder)
- Chatbot tư vấn sản phẩm tự động (mục 1.1.22)
- Gamification / vòng quay may mắn (mục 1.1.19)
- Cache Redis, Unit test Frontend (React Testing Library)
- Xác thực hai yếu tố 2FA, quản lý phiên đăng nhập nhiều thiết bị (mục 1.1.21 — nâng cao)

## Cập nhật mới nhất: đã bổ sung thêm

- **Tin tức & Cẩm nang công nghệ** (khách hàng xem, admin quản lý qua CMS) — mục 1.1.10, 1.2.6
- **Chat trực tuyến real-time** giữa khách hàng và nhân viên CSKH (widget nổi góc màn hình + trang quản lý hội thoại phía admin), có lưu lịch sử vào MongoDB — mục 1.1.12
- **Nhật ký thao tác quản trị (Audit Log)**: tự động ghi lại mọi thao tác tạo/sửa/xóa của admin/staff qua middleware, có trang tra cứu riêng — mục 1.2.0, 1.2.4

## Tài liệu đi kèm trong bộ hồ sơ nộp

- `khao-sat-hien-trang-thegioididong.md` — Báo cáo khảo sát hiện trạng (Bước 1)
- `muc-tieu-va-yeu-cau-do-an.md` — Mục tiêu và yêu cầu đồ án
- `ke-hoach-du-an.md` — Kế hoạch dự án chi tiết theo 6 bước
