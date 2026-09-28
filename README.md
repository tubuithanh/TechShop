# TechShop — Website Thương mại điện tử Đa chi nhánh (TLCN — MERN Stack)

Mô phỏng mô hình kinh doanh và chức năng cốt lõi của **thegioididong.com**, xây dựng bằng **MongoDB – Express.js – React.js – Node.js**.

**Điểm chính của thiết kế:**
- **Đa chi nhánh thực sự:** mỗi cửa hàng có tồn kho riêng, tính theo **từng phiên bản** sản phẩm (màu × dung lượng).
- **Tách biệt tài khoản:** collection `users` (khách hàng) tách riêng với `admins` (quản trị/nhân viên).
- **Phân quyền chi tiết** cho nhân viên theo nhóm quyền, có giới hạn theo chi nhánh.
- **Cấu hình không cần sửa code:** email, thanh toán VNPay, màu sắc giao diện, chân trang, bảo mật, nhật ký... đều chỉnh trong trang quản trị.

**Bản demo trực tuyến (Render + MongoDB Atlas):**
- Website: https://frontend-i3sp.onrender.com
- API: https://techshop-twv1.onrender.com/api

Gói miễn phí của Render tự "ngủ" khi không có truy cập, nên lần mở đầu tiên có thể mất khoảng 30–60 giây.

## Cấu trúc dự án

```
TechShop/
├── backend/            # RESTful API (Node.js + Express + MongoDB)
│   ├── config/          # Kết nối database
│   ├── models/          # Mongoose Schema (29 collection - xem mục Cấu trúc Database)
│   ├── controllers/     # Xử lý nghiệp vụ
│   ├── routes/          # Định nghĩa API endpoint
│   ├── middlewares/     # Xác thực JWT, phân quyền, giới hạn tần suất, ghi nhật ký, xử lý lỗi
│   ├── utils/           # Gửi email, VNPay, mã hóa bí mật, tìm kiếm không dấu, nhập dữ liệu từ link...
│   ├── data/            # Dữ liệu tỉnh/thành, phường/xã (đơn vị hành chính từ 01/07/2025)
│   ├── seed/            # Sinh dữ liệu mẫu + các script cập nhật dữ liệu
│   ├── scripts/         # Công cụ tiện ích (gửi email thử...)
│   ├── tests/           # Integration test (Jest + Supertest + mongodb-memory-server)
│   ├── app.js           # Cấu hình Express app
│   └── server.js        # Điểm khởi chạy, Socket.io, tác vụ nền (+ cổng HTTPS tùy chọn cho Zalo)
└── frontend/           # Giao diện React (Vite + React Bootstrap)
    └── src/
        ├── components/  # Header, Footer, ProductCard, LocationFields, admin/* (các tab cấu hình, bộ nhập link)...
        ├── pages/       # Trang khách hàng + trang quản trị (admin/)
        ├── services/    # Gọi API (axios)
        ├── store/       # AuthContext, CartContext, SettingsContext (state toàn cục)
        ├── hooks/       # useListQuery, useAdminList (tìm kiếm/lọc/phân trang trang quản trị)
        └── utils/       # Màu sắc giao diện, chân trang, nhóm thông số, so sánh sản phẩm...
```

## Yêu cầu môi trường

- Node.js >= 18
- MongoDB: cài local, hoặc dùng MongoDB Atlas miễn phí

## Hướng dẫn cài đặt và chạy thử

### 1. Backend

```
cd backend
npm install
cp .env.example .env
```
Mở file `.env` và chỉnh `MONGO_URI` trỏ đến MongoDB của bạn nếu cần. Trên môi trường production (`NODE_ENV=production`) **bắt buộc** có `MONGO_URI`, thiếu thì máy chủ dừng ngay với thông báo rõ ràng.

**Cấu hình tùy chọn** (bỏ trống vẫn chạy được). Hầu hết đều chỉnh được ngay trong **Admin → Cấu hình hệ thống**, biến môi trường chỉ là cách cũ / dự phòng:

| Nội dung | Cấu hình trong trang quản trị | Biến môi trường (dự phòng) |
|---|---|---|
| Gửi email (OTP, thông báo đơn hàng...) | Tab **Cấu hình gửi email**: SMTP, Resend, Gmail API (OAuth2), có nút gửi thử | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` hoặc `RESEND_API_KEY`, cùng `MAIL_FROM` |
| Thanh toán VNPay | Tab **Cấu hình thanh toán VNPay**: Terminal ID, Secret Key, có nút kiểm tra kết nối | `VNP_TMN_CODE`, `VNP_HASH_SECRET`, `VNP_URL`, `VNP_RETURN_URL` |
| Lưu ảnh tải lên | — | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Đăng nhập bằng Zalo | — | `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_REDIRECT_URI`, `HTTPS_PORT` |
| Khóa mã hóa bí mật (mật khẩu SMTP, API key, Secret Key VNPay) | — | `SETTINGS_SECRET` (bỏ trống thì dùng `JWT_ACCESS_SECRET`) |
| Giới hạn tần suất | Tab **Bảo mật**: bật/tắt và số lần cho phép | `API_RATE_LIMIT` (mặc định 1000), `RATE_LIMIT_DISABLED=true` để tắt hẳn |
| Thời gian chờ thanh toán VNPay | — | `VNPAY_PAYMENT_TIMEOUT_MINUTES` (mặc định 30) |

Lưu ý:
- **Chưa cấu hình gửi email** thì chạy chế độ demo: mã OTP hiện ngay trên màn hình. Kiểm tra gửi thật bằng `node scripts/testEmail.js <email-nhận>`.
- **Chưa cấu hình Cloudinary** thì ảnh lưu vào `backend/uploads`. Trên Render ổ đĩa không bền (**mất khi deploy lại hoặc khởi động lại**), nên production cần Cloudinary.
- **VNPay:** đăng ký sandbox miễn phí tại https://sandbox.vnpayment.vn/devreg; khai báo IPN URL trên VNPay là `<backend>/api/payments/vnpay/ipn`. Chưa cấu hình thì trang thanh toán tự ẩn lựa chọn VNPay.

```
npm run seed
npm run dev
```
Backend chạy tại `http://localhost:5000`.

`npm run seed` **xóa toàn bộ dữ liệu cũ** rồi sinh dữ liệu mẫu mới. Dữ liệu gồm:
- sản phẩm thuộc 7 danh mục, mỗi sản phẩm có nhiều phiên bản màu/dung lượng;
- tồn kho theo từng phiên bản tại từng cửa hàng;
- 1000 đơn hàng;
- 10 đánh giá kèm ảnh cho mỗi sản phẩm;
- phiếu bảo hành, bài viết, khách hàng mẫu.

Khi khởi động, máy chủ còn **tự nạp** (chỉ lần đầu, không ghi đè dữ liệu admin đã sửa): 34 tỉnh/thành và 3.321 phường/xã, 4 template màu sắc giao diện.

**Tài khoản demo sau khi seed:**

| Vai trò | Collection | Email | Mật khẩu |
|---|---|---|---|
| Quản trị viên | admins | admin@example.com | admin123 |
| Nhân viên | admins | staff@example.com | staff123 |
| Quản lý cửa hàng (chi nhánh TechShop Quận 1) | admins | manager@example.com | manager123 |
| Khách hàng | users | customer@example.com | customer123 |

**Lưu ý:** `admins` và `users` là 2 collection tách biệt. API đăng nhập tìm trong `users` trước, nếu không thấy mới tìm trong `admins`.

### 2. Frontend

Mở terminal khác:
```
cd frontend
npm install
npm run dev
```
Frontend chạy tại `http://localhost:5173` và tự động chuyển tiếp (proxy) các lệnh gọi API sang `http://localhost:5000`.

### 3. Chạy kiểm thử Backend

```
cd backend
npm test
```
Có **110 test case** (23 bộ test), bao gồm:
- tài khoản: đăng ký/đăng nhập, quên mật khẩu, đổi mật khẩu (đăng xuất thiết bị khác), đăng nhập Zalo, thêm/đổi email có xác thực;
- mua hàng: giỏ hàng (cảnh báo ngừng bán/hết hàng), đặt hàng, tồn kho và giá theo phiên bản, tự hủy đơn VNPay quá hạn;
- thanh toán VNPay: chữ ký, sai số tiền, thanh toán lại, hoàn tiền, cấu hình trong trang quản trị;
- quản trị: giới hạn theo chi nhánh, tìm kiếm không dấu, nhật ký thao tác, xóa bài viết hàng loạt;
- cấu hình: email, VNPay, màu sắc giao diện, chân trang, bảo mật (bật/tắt và số lần giới hạn);
- dữ liệu: tỉnh/thành - phường/xã, nhập sản phẩm (thegioididong.com) và tin tức (tinhte.vn) từ link;
- email thông báo, tải ảnh lên, giới hạn phân trang, giới hạn tần suất.

Bộ test dùng `mongodb-memory-server` để tạo MongoDB tạm trong bộ nhớ. Lần chạy đầu cần có kết nối internet để tải MongoDB. Test không gọi ra Internet (các trang nguồn, email đều được giả lập).

## Cấu trúc Database (ecommerce_multistore_db)

**Tài khoản & phân quyền**

| Collection | Vai trò |
|---|---|
| `users` | Khách hàng: nhúng địa chỉ, sản phẩm yêu thích, bài viết đã lưu. Email **không bắt buộc** (tài khoản đăng nhập bằng Zalo để trống, ID Zalo lưu ở `zaloId`); email không được trùng nếu có. `tokenVersion` dùng để thu hồi phiên khi đổi mật khẩu |
| `admins` | Quản trị/nhân viên, **tách riêng khỏi users**; nhân viên có thể gắn với 1 chi nhánh |
| `permission_groups` | Nhóm quyền (VD: CSKH, Kho, Quản lý cửa hàng); nhân viên có quyền theo các nhóm được gán |
| `otps` | Mã OTP (đăng ký, quên mật khẩu, đổi email) - lưu dạng băm, tự xóa khi hết hạn (TTL index) |

**Sản phẩm & kho**

| Collection | Vai trò |
|---|---|
| `brands`, `categories` | Nhãn hàng; danh mục (kèm **mẫu thông số kỹ thuật** của từng danh mục) |
| `products` | Sản phẩm; nhúng danh sách **phiên bản** (`variants`), thông số kỹ thuật, số liệu thông số tính sẵn (`specNumbers`) |
| `collections` | Bộ sưu tập sản phẩm |
| `stores` | Cửa hàng/chi nhánh |
| `store_inventories` | **Tồn kho theo bộ ba (cửa hàng, sản phẩm, phiên bản)** |

**Bán hàng**

| Collection | Vai trò |
|---|---|
| `carts` | Giỏ hàng (mỗi dòng là 1 phiên bản) |
| `orders` | Đơn hàng (gắn chi nhánh; mỗi dòng hàng ghi rõ phiên bản đã mua; lịch sử trạng thái; thông tin thanh toán VNPay) |
| `vouchers` | Mã giảm giá (giới hạn lượt dùng, lượt dùng mỗi khách) |
| `warranties` | Phiếu bảo hành |
| `reviews`, `questions` | Đánh giá (có ảnh, nhãn "Đã mua hàng", phản hồi của shop); hỏi đáp sản phẩm |

**Nội dung & tương tác**

| Collection | Vai trò |
|---|---|
| `posts` | Tin tức / bài viết (4 chuyên mục: Tin tức, Tư vấn, Đánh giá, Thủ thuật), bình luận |
| `notifications` | Thông báo cho khách |
| `chat_messages` | Tin nhắn chat với CSKH |

**Danh mục địa chỉ**

| Collection | Vai trò |
|---|---|
| `provinces` | 34 tỉnh/thành phố (đơn vị hành chính mới từ 01/07/2025) |
| `wards` | 3.321 phường/xã/đặc khu, mỗi bản ghi thuộc 1 tỉnh |

**Cấu hình & vận hành**

| Collection | Vai trò |
|---|---|
| `settings` | Cấu hình chung (1 bản ghi): thông tin website, liên hệ, phân trang, phí vận chuyển, SEO, bảo trì, **màu sắc giao diện** (`theme`), **chân trang** (`footer`), số ngày lưu nhật ký. Trạng thái và số lần giới hạn tần suất (`rateLimitEnabled`, `rateLimits`) **không trả về ở API công khai** |
| `mail_configs` | Cấu hình gửi email; mật khẩu SMTP, API key, Gmail OAuth lưu **đã mã hóa** (AES-256-GCM) |
| `payment_configs` | Cấu hình VNPay; Secret Key lưu **đã mã hóa** |
| `theme_templates` | Template màu sắc giao diện (có sẵn: Mặc định, Giáng sinh, Tết, Mùa thu; admin lưu thêm) |
| `audit_logs` | Nhật ký thao tác quản trị (dữ liệu nhạy cảm như mật khẩu, token được che trước khi ghi) |

**Đặc điểm quan trọng cần lưu ý khi trình bày báo cáo:**
- Đăng nhập phải tìm ở cả 2 collection (`users` rồi `admins`) vì không có trường `role` chung trong 1 bảng.
- Đặt hàng bắt buộc chọn chi nhánh. Hệ thống kiểm tra và trừ tồn kho của **đúng phiên bản tại đúng chi nhánh** đó, và trừ theo cách nguyên tử (atomic) nên không bán vượt số lượng tồn kho. Bấm đặt hàng 2 lần cùng lúc cũng chỉ tạo 1 đơn.
- Khi hủy đơn hoặc trả hàng, tồn kho được hoàn lại đúng phiên bản, đúng chi nhánh, và chỉ hoàn 1 lần.
- Giá luôn tính ở backend theo giá hiện tại của phiên bản; giá trong giỏ hàng tự đồng bộ khi admin đổi giá.
- Địa chỉ trong đơn hàng / sổ địa chỉ lưu **tên** tỉnh và phường (không lưu ID), nên sửa/xóa danh mục tỉnh-phường không ảnh hưởng đơn hàng cũ.

## Tính năng đã triển khai

**Khách hàng:**
- Đăng ký 3 bước (email → OTP → thông tin) — mục 1.1.21:
  - bắt buộc: họ tên (2–50 ký tự, chỉ chữ cái), số điện thoại di động Việt Nam (10 số, đầu 03/05/07/08/09, không trùng tài khoản khác), mật khẩu tối thiểu 8 ký tự có chữ và số, nhập lại mật khẩu, đồng ý điều khoản;
  - không bắt buộc: thêm tối đa 5 địa chỉ nhận hàng (Nhà riêng, Công ty hoặc tự đặt tên), chọn 1 địa chỉ mặc định;
  - báo lỗi ngay dưới từng ô, khóa nút đăng ký tới khi hợp lệ; backend kiểm tra lại toàn bộ.
- **Đăng nhập:**
  - JWT, phiên duy trì bằng refresh token lưu trong cookie httpOnly;
  - **đăng nhập bằng Zalo**: tài khoản mới để trống email; khách **tự chọn** đăng nhập bằng Zalo hoặc email/mật khẩu (thêm email ở trang tài khoản, rồi đặt mật khẩu qua "Quên mật khẩu");
  - **quên mật khẩu** bằng mã OTP gửi qua email;
  - **đổi mật khẩu** thì các thiết bị khác tự đăng xuất, thiết bị đang dùng vẫn giữ phiên.
- **Thông tin tài khoản:** sửa họ tên, số điện thoại; **thêm / đổi email** có xác thực bằng mã gửi tới email mới (tài khoản có mật khẩu phải nhập mật khẩu hiện tại) — mục 1.1.7
- Trang chủ, danh mục, tìm kiếm và lọc sản phẩm; **lọc theo thông số dạng số** (VD: RAM ≥ 8GB, màn hình 6–7 inch) — mục 1.1.1, 1.1.2, 1.1.3
- **Chi tiết sản phẩm** — mục 1.1.4:
  - chọn **màu** (ô màu) và **dung lượng/kích thước**; giá, ảnh và tồn kho theo từng cửa hàng đổi theo phiên bản đã chọn;
  - thư viện ảnh, breadcrumb;
  - 4 tab: mô tả, **thông số kỹ thuật chia theo nhóm**, đánh giá kèm ảnh (khách tải lên tối đa 3 ảnh, bấm để phóng to), hỏi đáp;
  - tính trả góp, danh sách yêu thích, thanh mua hàng cố định ở cuối trang.
- **So sánh sản phẩm** song song, thông số chia theo nhóm, **tự làm nổi bật giá trị tốt nhất** ở mỗi dòng — mục 1.1.5
- **Giỏ hàng và thanh toán** theo phiên bản, áp mã giảm giá, chọn hình thức nhận hàng — mục 1.1.6
  - giỏ hàng tự cảnh báo dòng hàng **ngừng bán** hoặc **không đủ hàng** ("Chỉ còn N sản phẩm") và khóa nút thanh toán cho tới khi khách điều chỉnh;
  - **chọn nhanh địa chỉ trong sổ địa chỉ** (địa chỉ mặc định được chọn sẵn) hoặc "Giao đến địa chỉ khác";
  - ô **Tỉnh/Thành phố** + ô **Phường/Xã có gợi ý** theo đúng tỉnh đang chọn, gõ không dấu vẫn ra (dùng ở đăng ký, thanh toán, sổ địa chỉ);
  - **thanh toán online qua VNPay** (thẻ ATM, Visa/Master, QR):
    - kiểm tra chữ ký và số tiền của mọi kết quả VNPay gửi về, nhận kết quả qua cả trang trả về và IPN (ghi nhận 1 lần, không trùng);
    - thanh toán lại khi thất bại; khách trả tiền ở lần thử cũ (tab cũ) vẫn được ghi nhận đúng đơn;
    - **đơn quá 30 phút chưa thanh toán tự hủy** và trả lại tồn kho; không tạo link thanh toán mới cho đơn sắp hết hạn;
    - hủy đơn đã thanh toán thì chuyển "đã hoàn tiền" (mô phỏng);
    - chưa cấu hình VNPay thì trang thanh toán tự ẩn lựa chọn này.
- Sổ địa chỉ, danh sách yêu thích — mục 1.1.7
- Đánh giá (kèm tối đa 3 ảnh) và hỏi đáp (Q&A) sản phẩm; khách **sửa lại được đánh giá của mình** (số sao, nội dung, ảnh - hiện nhãn "đã chỉnh sửa") — mục 1.1.8
- **Trang khuyến mãi** công khai (sao chép mã) — mục 1.1.9
- **Tin tức & Cẩm nang công nghệ**: nội dung có thể chèn ảnh giữa bài (dòng `![mô tả](https://...)`) — mục 1.1.10
- **Hệ thống cửa hàng**: tra cứu theo tỉnh/thành, chỉ đường Google Maps — mục 1.1.11
- **Chat trực tuyến với CSKH** (widget nổi, real-time qua Socket.io, lưu lịch sử) — mục 1.1.12
- Bảo hành: gửi yêu cầu, theo dõi tiến độ, lịch sử; tra cứu bảo hành công khai — mục 1.1.14
- Theo dõi đơn hàng thời gian thực (Socket.io), hủy đơn
- **Trung tâm thông báo** — mục 1.1.18
- **Email thông báo** tự động: xác nhận đặt hàng, đổi trạng thái đơn, thanh toán thành công, bảo hành (khách chưa có email thì bỏ qua)
- Các trang chính sách (đổi trả, bảo hành, giao hàng, thanh toán, bảo mật, điều khoản), hướng dẫn mua hàng
- **Hiệu ứng trang trí theo mùa** (tuyết rơi, hoa mai, lá thu) theo template màu admin chọn

**Quản trị:**
- **Quản lý sản phẩm** — mục 1.2.1:
  - bảng **phiên bản** (màu, mã màu, dung lượng, giá, giá khuyến mãi, ảnh riêng, đang bán/ngừng bán); không cho xóa phiên bản còn hàng trong kho;
  - **thông số kỹ thuật theo mẫu của danh mục**;
  - **tải ảnh lên** cho sản phẩm và từng phiên bản (Cloudinary nếu đã cấu hình, nếu không thì lưu trên máy chủ);
  - **nhập nhanh từ link thegioididong.com**: tự điền tên, thương hiệu, danh mục, các màu kèm giá, thông số (ghép vào mẫu của danh mục) và **tải ảnh về kho ảnh của website**; không tự lưu - admin kiểm tra rồi mới lưu. Nếu máy chủ bị trang nguồn chặn: dán mã nguồn trang (Ctrl+U) để nhập.
- **Quản lý tồn kho** theo chi nhánh và phiên bản, cảnh báo sắp hết hàng
- Quản lý đơn hàng theo luồng trạng thái (chặn nhảy cóc trạng thái; đơn VNPay chưa thanh toán không được xác nhận/giao, chỉ được hủy) — mục 1.2.2
- **Quản lý khách hàng**: tìm kiếm, khóa/mở tài khoản (hiện rõ khách Zalo chưa có email) — mục 1.2.3
- **Quản lý nhân viên và nhóm quyền** — mục 1.2.4:
  - phân quyền chi tiết theo từng chức năng;
  - tài khoản gắn chi nhánh chỉ thao tác được trên chi nhánh của mình: tồn kho, đơn hàng (xem, xử lý) và thống kê đơn hàng/doanh thu;
  - nhóm quyền mẫu **"Quản lý cửa hàng"**: tồn kho, đơn hàng, thống kê, xem khuyến mãi.
- **Khuyến mãi/voucher**: tạo, xem, vô hiệu hóa, giới hạn số lần dùng mỗi khách — mục 1.2.5
- **Tin tức (CMS)** — mục 1.2.6:
  - viết/sửa bài, 4 chuyên mục;
  - **nhập nhanh từ link tinhte.vn**: tự điền tiêu đề, tóm tắt, ảnh bìa, nội dung kèm ảnh trong bài (dùng link ảnh gốc), cuối bài ghi nguồn;
  - **xóa hàng loạt** (tick chọn nhiều bài) và **xóa tất cả bài viết** (phải gõ "XOA TAT CA" để xác nhận) - chỉ admin.
- **Quản lý đánh giá**: ẩn/hiện, phản hồi (tự tính lại điểm trung bình) — mục 1.2.7
- Dashboard thống kê (MongoDB Aggregation + Recharts) — mục 1.2.8
- **Tỉnh thành & phường xã**: thêm, sửa, ẩn/hiện, xóa; nút bổ sung dữ liệu mặc định
- **Tìm kiếm tiếng Việt không dấu** ở các trang quản lý (đơn hàng, sản phẩm, tồn kho, khách hàng, bảo hành, đánh giá, khuyến mãi, tin tức): gõ "nguyen van" vẫn ra "Nguyễn Văn"; kèm bộ lọc, từ khóa lưu trên đường link, phím tắt "/"
- Quản lý bảo hành, trả lời chat khách hàng
- **Nhật ký thao tác (Audit Log)** — mục 1.2.0:
  - tự động ghi mọi thao tác tạo/sửa/xóa của admin và nhân viên (che dữ liệu nhạy cảm);
  - tìm kiếm theo người thực hiện/hành động/đường dẫn/IP, lọc theo loại hành động, vai trò, khoảng ngày;
  - **xóa tất cả nhật ký**; cấu hình **số ngày lưu** (0 = không ghi, N = chỉ giữ N ngày gần nhất, cũ hơn tự xóa).
- **Cấu hình hệ thống** (chỉ admin), gồm các tab:
  - **Thông tin chung** (tên, slogan, logo, favicon, dòng bản quyền cuối trang), **Liên hệ**, **Hiển thị & phân trang**, **Vận chuyển**, **SEO**, **Bảo trì**;
  - **Màu sắc giao diện**: 8 màu (màu chính, header, footer, nền, màu nhấn...) + hiệu ứng trang trí, xem trước ngay; **lưu thành template** để chọn lại; có sẵn template **Giáng sinh, Tết, Mùa thu**;
  - **Chân trang (Footer)**: dòng giới thiệu, tiêu đề cột, danh sách liên kết (thêm, xóa, đổi thứ tự), dòng bản quyền (`{year}`, `{siteName}`);
  - **Bảo mật**: bật/tắt chống lạm dụng & tấn công dồn dập (mặc định bật, có mô tả ảnh hưởng khi bật/tắt) và **sửa số lần cho phép** của từng nhóm;
  - **Nhật ký thao tác**: số ngày lưu nhật ký;
  - **Cấu hình gửi email**: SMTP / Resend / Gmail API, gửi thử;
  - **Cấu hình thanh toán VNPay**: Terminal ID, Secret Key (mã hóa), kiểm tra kết nối, hiện sẵn IPN URL.

**Kỹ thuật nổi bật:**
- Bảo mật:
  - JWT access + refresh token (cookie httpOnly), bcrypt, OTP lưu dạng băm, tự hết hạn (TTL index), giới hạn số lần nhập sai;
  - `tokenVersion` thu hồi mọi phiên cũ khi đổi/đặt lại mật khẩu;
  - **giới hạn tần suất theo IP** (toàn API, đăng nhập, OTP, quên mật khẩu, đặt hàng, đánh giá, tải ảnh) - bật/tắt và chỉnh số lần trong trang quản trị;
  - giới hạn phân trang (tối đa 200 bản ghi/trang), chặn tham số lạ (`limit[$gt]=...`);
  - mã hóa AES-256-GCM cho các bí mật admin nhập (không bao giờ trả về trình duyệt);
  - chữ ký HMAC-SHA512 cho VNPay; so sánh chữ ký an toàn thời gian (`timingSafeEqual`);
  - nhập dữ liệu từ link chỉ chấp nhận đúng tên miền nguồn, không đi theo chuyển hướng ra ngoài, kiểm tra ảnh theo nội dung file; nội dung bài viết lưu dạng văn bản (không chèn HTML) nên không bị chèn mã độc.
- Tồn kho: cập nhật nguyên tử theo phiên bản và chi nhánh.
- Tốc độ lọc/sắp xếp: số liệu thông số và giá thực trả được tính sẵn khi lưu (`specNumbers`, `effectivePrice`).
- **Tác vụ nền** (chạy trong tiến trình máy chủ): tự hủy đơn VNPay quá hạn (mỗi 5 phút), dọn nhật ký quá hạn lưu (mỗi giờ).
- **Tự chuyển đổi dữ liệu khi khởi động** (chạy lại nhiều lần vẫn an toàn): nạp tỉnh/phường, xóa email tạm của tài khoản Zalo cũ và đổi chỉ số email.
- Cursor-based pagination, Socket.io real-time, kiến trúc RESTful chia theo tầng rõ ràng.

## Script cập nhật dữ liệu (không xóa dữ liệu, chạy lại nhiều lần vẫn an toàn)

Các script dưới đây dùng để nâng cấp dữ liệu **đang có** (VD: database trên Atlas) mà không cần seed lại. Chạy trong thư mục `backend`:

```
node seed/<tên-script>.js                                # database trong .env
MONGO_URI="<chuỗi-kết-nối>" node seed/<tên-script>.js    # database khác (VD: Atlas)
```

| Script | Việc làm |
|---|---|
| `backfillEffectivePrice.js` | Tính giá thực trả `effectivePrice` cho sản phẩm cũ |
| `backfillVoucherPerCustomerLimit.js` | Thêm giới hạn lượt dùng voucher mỗi khách |
| `backfillStaffPermissions.js` | Tạo nhóm quyền mặc định và gán cho nhân viên cũ |
| `backfillSpecTemplates.js [--fill-products]` | Nạp mẫu thông số cho danh mục (và bổ sung thông số cho sản phẩm) |
| `migrateVariants.js [--demo-colors]` | Chuyển sang mô hình phiên bản: tạo phiên bản mặc định, gắn tồn kho/đơn hàng/giỏ hàng cũ vào phiên bản (`--demo-colors`: thêm màu mẫu kèm tồn kho) |
| `seedProductReviews.js` | Bổ sung cho đủ 10 đánh giá kèm ảnh mỗi sản phẩm, tính lại điểm đánh giá |
| `backfillOnlinePaymentStatus.js` | Sửa trạng thái thanh toán của đơn mẫu thanh toán online: đơn đã xác nhận trở đi thành "đã thanh toán", đơn hủy/trả thành "đã hoàn tiền" |
| `seedStoreManager.js` | Tạo nhóm quyền "Quản lý cửa hàng" và tài khoản `manager@example.com` / `manager123` quản lý chi nhánh TechShop Quận 1 |
| `backfillSearchTokens.js` | Tạo dữ liệu tìm kiếm không dấu (`searchTokens` + index) cho sản phẩm, khách hàng, đơn hàng, bảo hành, đánh giá, voucher, bài viết đang có |
| `fixSlugs.js` | Sửa đường dẫn (slug) chứa ký tự không hợp lệ như "/" cho bài viết, sản phẩm, danh mục, thương hiệu |
| `fixProductImages.js` | Cập nhật ảnh sản phẩm theo đúng loại sản phẩm, đồng bộ ảnh phiên bản và ảnh đánh giá |

Các việc sau **không cần chạy script** - máy chủ tự làm khi khởi động: nạp tỉnh/thành - phường/xã (khi chưa có), nạp template màu (khi admin mở tab Màu sắc lần đầu), xóa email tạm `zalo…@zalo.techshop.local` của tài khoản Zalo cũ và đổi chỉ số email.

**Ghi chú về ảnh mẫu:** ảnh sản phẩm là ảnh stock từ Unsplash, chọn đúng **loại** sản phẩm, không phải ảnh chính hãng của từng mẫu máy. Admin có thể thay bằng ảnh thật trong trang quản lý sản phẩm; `fixProductImages.js` giữ nguyên các ảnh admin đã tự nhập.

**Ghi chú về dữ liệu nhập từ trang khác:** sản phẩm nhập từ thegioididong.com và bài viết nhập từ tinhte.vn là dữ liệu thuộc bản quyền của các trang đó, chỉ dùng cho mục đích minh họa (bài viết tự ghi nguồn ở cuối).

## Còn thiếu so với tài liệu phân tích đầy đủ (chưa triển khai trong bản demo này)

- Ví MoMo (VNPay đã tích hợp)
- Gọi API hoàn tiền thật của VNPay (hiện chỉ chuyển trạng thái "đã hoàn tiền")
- Tải ảnh lên cho yêu cầu bảo hành (vẫn lưu ảnh dạng base64 trong dữ liệu)
- Chatbot tư vấn sản phẩm tự động (mục 1.1.22)
- Gamification / vòng quay may mắn (mục 1.1.19)
- Cache Redis, unit test Frontend (React Testing Library)
- Xác thực hai yếu tố 2FA, quản lý phiên đăng nhập nhiều thiết bị (mục 1.1.21 — nâng cao)
- Header bảo mật (helmet), lọc NoSQL injection tập trung

**Thẻ ngân hàng thanh toán thử của VNPay (sandbox):**

| | |
|---|---|
| Ngân hàng | NCB |
| Số thẻ | 9704198526191432198 |
| Tên in trên thẻ | NGUYEN VAN A |
| Ngày phát hành | 07/15 |
| Mật khẩu OTP | 123456 |

## Tài liệu đi kèm trong bộ hồ sơ nộp

- `khao-sat-hien-trang-thegioididong.md` — Báo cáo khảo sát hiện trạng (Bước 1)
- `muc-tieu-va-yeu-cau-do-an.md` — Mục tiêu và yêu cầu đồ án
- `ke-hoach-du-an.md` — Kế hoạch dự án chi tiết theo 6 bước
- `DanhSach_TestCase_TechShop.docx` — Danh sách test case
- `Khao-sat-hien-trang-hinh-anh-minh-hoa.docx` — Hình ảnh minh họa cho báo cáo khảo sát
- `Huong-dan-trien-khai-TechShop-len-Internet.docx` — Hướng dẫn triển khai lên Render + MongoDB Atlas
- `Bao-cao-kiem-tra-khac-phuc-loi-TechShop*.docx` — Báo cáo kiểm tra và khắc phục lỗi (3 đợt)
