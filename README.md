# TechShop — Website Thương mại điện tử Đa chi nhánh (TLCN — MERN Stack)

Mô phỏng mô hình kinh doanh và chức năng cốt lõi của **thegioididong.com**, xây dựng bằng **MongoDB – Express.js – React.js – Node.js**.

**Điểm chính của thiết kế:**
- **Đa chi nhánh thực sự:** mỗi cửa hàng có tồn kho riêng, tính theo **từng phiên bản** sản phẩm (màu × dung lượng).
- **Tách biệt tài khoản:** collection `users` (khách hàng) tách riêng với `admins` (quản trị/nhân viên).
- **Phân quyền chi tiết** cho nhân viên theo nhóm quyền, có giới hạn theo chi nhánh.

**Bản demo trực tuyến (Render + MongoDB Atlas):**
- Website: https://frontend-i3sp.onrender.com
- API: https://techshop-twv1.onrender.com/api

Gói miễn phí của Render tự "ngủ" khi không có truy cập, nên lần mở đầu tiên có thể mất khoảng 30–60 giây.

## Cấu trúc dự án

```
TechShop/
├── backend/            # RESTful API (Node.js + Express + MongoDB)
│   ├── config/          # Kết nối database
│   ├── models/          # Mongoose Schema (User, Product, Order, StoreInventory...)
│   ├── controllers/     # Xử lý nghiệp vụ
│   ├── routes/          # Định nghĩa API endpoint
│   ├── middlewares/     # Xác thực JWT, phân quyền, ghi audit log, xử lý lỗi
│   ├── utils/           # Mẫu thông số kỹ thuật, tách số từ thông số...
│   ├── seed/            # Sinh dữ liệu mẫu + các script cập nhật dữ liệu
│   ├── tests/           # Integration test (Jest + Supertest + mongodb-memory-server)
│   ├── app.js           # Cấu hình Express app
│   └── server.js        # Điểm khởi chạy + Socket.io (+ cổng HTTPS tùy chọn cho Zalo)
└── frontend/           # Giao diện React (Vite + React Bootstrap)
    └── src/
        ├── components/  # Header, Footer, ProductCard, admin/VariantsEditor, admin/SpecificationsEditor...
        ├── pages/       # Trang khách hàng + trang quản trị (admin/)
        ├── services/    # Gọi API (axios)
        ├── store/       # AuthContext, CartContext, SettingsContext (state toàn cục)
        └── utils/       # Nhóm thông số, so sánh sản phẩm...
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
Mở file `.env` và chỉnh `MONGO_URI` trỏ đến MongoDB của bạn nếu cần.

**Cấu hình tùy chọn** (bỏ trống vẫn chạy được):
- **VNPay:** `VNP_TMN_CODE`, `VNP_HASH_SECRET` (đăng ký sandbox miễn phí tại https://sandbox.vnpayment.vn/devreg). Khai báo IPN URL trên VNPay là `<backend>/api/payments/vnpay/ipn`. Chưa cấu hình thì đơn VNPay vẫn tạo được, trang đơn hàng báo cổng thanh toán chưa sẵn sàng.
- **Gửi email** (mã OTP đăng ký): cấu hình ngay trong **Admin → Cấu hình hệ thống → Cấu hình gửi email** với 3 cách gửi: SMTP, Resend, hoặc **Gmail API (OAuth2)** - gửi từ chính địa chỉ @gmail.com qua HTTPS nên chạy được cả khi máy chủ chặn cổng SMTP (có nút gửi thử; mật khẩu được mã hóa bằng `SETTINGS_SECRET`), hoặc bằng biến môi trường SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, ví dụ Gmail với "Mật khẩu ứng dụng") **hoặc** Resend (`RESEND_API_KEY`), cùng `MAIL_FROM`. Kiểm tra bằng `node scripts/testEmail.js <email-nhận>`. Chưa cấu hình thì chạy chế độ demo: mã OTP hiện ngay trên màn hình đăng ký.
- **Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Chưa cấu hình thì ảnh tải lên được lưu vào `backend/uploads` — trên Render ổ đĩa không bền (mất khi deploy lại), nên production cần Cloudinary. Các biến `ZALO_*`/`HTTPS_PORT` chỉ cần khi thử đăng nhập bằng Zalo; bỏ trống vẫn chạy bình thường. Nếu cổng HTTPS bị chiếm, server chỉ cảnh báo chứ không dừng.

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
Có 64 test case, bao gồm: đăng ký/đăng nhập, giỏ hàng (kể cả cảnh báo ngừng bán/hết hàng), đặt hàng, tồn kho và giá theo phiên bản, thanh toán VNPay (chữ ký, sai số tiền, thanh toán lại, trả tiền ở lần thử cũ, hoàn tiền, chặn xác nhận đơn chưa thanh toán), tải ảnh lên, giới hạn theo chi nhánh của quản lý cửa hàng (đơn hàng, thống kê, quyền).

Bộ test dùng `mongodb-memory-server` để tạo MongoDB tạm trong bộ nhớ. Lần chạy đầu cần có kết nối internet để tải MongoDB.


## Cấu trúc Database (ecommerce_multistore_db)

| Collection | Vai trò |
|---|---|
| `users` | Tài khoản khách hàng (nhúng địa chỉ, danh sách yêu thích, bài viết đã lưu) |
| `admins` | Tài khoản quản trị/nhân viên, **tách riêng khỏi users**; nhân viên có thể gắn với 1 chi nhánh |
| `permission_groups` | Nhóm quyền (VD: CSKH, Kho, Bán hàng); nhân viên có quyền theo các nhóm được gán |
| `brands`, `categories` | Nhãn hàng; danh mục (kèm **mẫu thông số kỹ thuật** của từng danh mục) |
| `products` | Sản phẩm; nhúng danh sách **phiên bản** (`variants`) và thông số kỹ thuật |
| `stores` | Cửa hàng/chi nhánh |
| `store_inventories` | **Tồn kho theo bộ ba (cửa hàng, sản phẩm, phiên bản)** |
| `orders` | Đơn hàng (gắn với chi nhánh; mỗi dòng hàng ghi rõ phiên bản đã mua) |
| `carts` | Giỏ hàng (mỗi dòng là 1 phiên bản) |
| `reviews` | Đánh giá sản phẩm (có ảnh, nhãn "Đã mua hàng", phản hồi của shop) |
| `collections`, `posts`, `warranties`, `vouchers`, `notifications`, `questions`, `otps`, `chat_messages`, `audit_logs`, `settings` | Các collection nghiệp vụ mở rộng |

**Đặc điểm quan trọng cần lưu ý khi trình bày báo cáo:**
- Đăng nhập phải tìm ở cả 2 collection (`users` rồi `admins`) vì không có trường `role` chung trong 1 bảng.
- Đặt hàng bắt buộc chọn chi nhánh. Hệ thống kiểm tra và trừ tồn kho của **đúng phiên bản tại đúng chi nhánh** đó, và trừ theo cách nguyên tử (atomic) nên không bán vượt số lượng tồn kho. Bấm đặt hàng 2 lần cùng lúc cũng chỉ tạo 1 đơn.
- Khi hủy đơn hoặc trả hàng, tồn kho được hoàn lại đúng phiên bản, đúng chi nhánh, và chỉ hoàn 1 lần.
- Giá luôn tính ở backend theo giá hiện tại của phiên bản; giá trong giỏ hàng tự đồng bộ khi admin đổi giá.

## Tính năng đã triển khai

**Khách hàng:**
- Đăng ký 3 bước (email → OTP → thông tin) — mục 1.1.21:
  - bắt buộc: họ tên (2–50 ký tự, chỉ chữ cái), số điện thoại di động Việt Nam (10 số, đầu 03/05/07/08/09, không trùng tài khoản khác), mật khẩu tối thiểu 8 ký tự có chữ và số, nhập lại mật khẩu, đồng ý điều khoản;
  - không bắt buộc: thêm tối đa 5 địa chỉ nhận hàng (Nhà riêng, Công ty hoặc tự đặt tên), chọn 1 địa chỉ mặc định;
  - báo lỗi ngay dưới từng ô, khóa nút đăng ký tới khi hợp lệ; backend kiểm tra lại toàn bộ (kể cả khi sửa số điện thoại trong hồ sơ).
- Đăng nhập JWT, phiên đăng nhập duy trì bằng refresh token lưu trong cookie httpOnly; đăng nhập bằng Zalo (tùy chọn)
- Trang chủ, danh mục, tìm kiếm và lọc sản phẩm; **lọc theo thông số dạng số** (VD: RAM ≥ 8GB, màn hình 6–7 inch) — mục 1.1.1, 1.1.2, 1.1.3
- **Chi tiết sản phẩm** — mục 1.1.4:
  - chọn **màu** (ô màu) và **dung lượng/kích thước**; giá, ảnh và tồn kho theo từng cửa hàng đổi theo phiên bản đã chọn;
  - thư viện ảnh, breadcrumb;
  - 4 tab: mô tả, **thông số kỹ thuật chia theo nhóm**, đánh giá kèm ảnh (khách tải lên tối đa 3 ảnh, bấm để phóng to), hỏi đáp;
  - tính trả góp, danh sách yêu thích, thanh mua hàng cố định ở cuối trang.
- **So sánh sản phẩm** song song, thông số chia theo nhóm, **tự làm nổi bật giá trị tốt nhất** ở mỗi dòng — mục 1.1.5
- Giỏ hàng và đặt hàng theo phiên bản, áp mã giảm giá, chọn hình thức nhận hàng — mục 1.1.6
  - giỏ hàng tự cảnh báo dòng hàng **ngừng bán** hoặc **không đủ hàng** ("Chỉ còn N sản phẩm") và khóa nút thanh toán cho tới khi khách điều chỉnh;
  - **thanh toán online qua VNPay** (thẻ ATM, Visa/Master, QR):
    - kiểm tra chữ ký và số tiền của mọi kết quả VNPay gửi về, nhận kết quả qua cả trang trả về và IPN (ghi nhận 1 lần, không trùng);
    - thanh toán lại khi thất bại; khách trả tiền ở lần thử cũ (tab cũ) vẫn được ghi nhận đúng đơn;
    - trang kết quả không bắt đăng nhập lại (phiên có thể hết hạn trong lúc thanh toán);
    - hủy đơn đã thanh toán thì chuyển "đã hoàn tiền" (mô phỏng).
- **Trung tâm tài khoản**: thông tin cá nhân, đổi mật khẩu, sổ địa chỉ, danh sách yêu thích — mục 1.1.7
- Đánh giá (kèm tối đa 3 ảnh) và hỏi đáp (Q&A) sản phẩm; khách **sửa lại được đánh giá của mình** (số sao, nội dung, ảnh - hiện nhãn "đã chỉnh sửa", không sửa được đánh giá đã bị ẩn) — mục 1.1.8
- **Trang khuyến mãi** công khai (sao chép mã) — mục 1.1.9
- **Tin tức & Cẩm nang công nghệ** — mục 1.1.10
- **Hệ thống cửa hàng**: tra cứu theo tỉnh/thành, chỉ đường Google Maps — mục 1.1.11
- **Chat trực tuyến với CSKH** (widget nổi, real-time qua Socket.io, lưu lịch sử) — mục 1.1.12
- Bảo hành: gửi yêu cầu, theo dõi tiến độ, lịch sử — mục 1.1.14
- Theo dõi đơn hàng thời gian thực (Socket.io), hủy đơn
- **Trung tâm thông báo** — mục 1.1.18

**Quản trị:**
- **Quản lý sản phẩm** — mục 1.2.1:
  - bảng **phiên bản** (màu, mã màu, dung lượng, giá, giá khuyến mãi, ảnh riêng, đang bán/ngừng bán); không cho xóa phiên bản còn hàng trong kho;
  - **thông số kỹ thuật theo mẫu của danh mục**;
  - **tải ảnh lên** cho sản phẩm và từng phiên bản (lưu trên Cloudinary nếu đã cấu hình, nếu không thì lưu trên máy chủ; giới hạn 5 ảnh × 5MB mỗi lần, 30 lần mỗi 15 phút).
- **Quản lý tồn kho** theo chi nhánh và phiên bản, cảnh báo sắp hết hàng
- Quản lý đơn hàng theo luồng trạng thái (chặn nhảy cóc trạng thái; đơn VNPay chưa thanh toán không được xác nhận/giao, chỉ được hủy) — mục 1.2.2
- **Quản lý khách hàng**: tìm kiếm, khóa/mở tài khoản — mục 1.2.3
- **Quản lý nhân viên và nhóm quyền** — mục 1.2.4:
  - phân quyền chi tiết theo từng chức năng;
  - tài khoản gắn chi nhánh chỉ thao tác được trên chi nhánh của mình: tồn kho, đơn hàng (xem, xử lý) và thống kê đơn hàng/doanh thu;
  - nhóm quyền mẫu **"Quản lý cửa hàng"**: tồn kho, đơn hàng, thống kê, xem khuyến mãi. Không gồm các quyền toàn hệ thống (sản phẩm, đánh giá, bảo hành, tin tức, chat, danh sách khách hàng).
- **Khuyến mãi/voucher**: tạo, xem, vô hiệu hóa, giới hạn số lần dùng mỗi khách — mục 1.2.5
- **Tin tức (CMS)** — mục 1.2.6
- **Quản lý đánh giá**: ẩn/hiện, phản hồi (tự tính lại điểm trung bình) — mục 1.2.7
- Dashboard thống kê (MongoDB Aggregation + Recharts) — mục 1.2.8
- **Tìm kiếm tiếng Việt không dấu** ở 8 trang quản lý (đơn hàng, sản phẩm, tồn kho, khách hàng, bảo hành, đánh giá, khuyến mãi, tin tức): gõ "nguyen van" vẫn ra "Nguyễn Văn", tìm theo mã đơn/mã phiếu/SĐT theo phần đầu; kèm bộ lọc (trạng thái, chi nhánh, khoảng ngày...), từ khóa và bộ lọc lưu trên đường link, phím tắt "/"
- Quản lý bảo hành, trả lời chat khách hàng, cấu hình hệ thống
- **Nhật ký thao tác (Audit Log)**: tự động ghi mọi thao tác tạo/sửa/xóa — mục 1.2.0

**Kỹ thuật nổi bật:**
- Bảo mật: JWT access + refresh token, bcrypt, OTP tự hết hạn (TTL index), rate limiting.
- Tồn kho: cập nhật nguyên tử theo phiên bản và chi nhánh.
- Tốc độ lọc/sắp xếp: số liệu thông số và giá thực trả được tính sẵn khi lưu (`specNumbers`, `effectivePrice`).
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
| `backfillOnlinePaymentStatus.js` | Sửa trạng thái thanh toán của đơn mẫu thanh toán online: đơn đã xác nhận trở đi thành "đã thanh toán", đơn hủy/trả thành "đã hoàn tiền" (**chạy trước khi deploy** bản chặn xử lý đơn VNPay chưa thanh toán) |
| `seedStoreManager.js` | Tạo nhóm quyền "Quản lý cửa hàng" và tài khoản `manager@example.com` / `manager123` quản lý chi nhánh TechShop Quận 1 |
| `backfillSearchTokens.js` | Tạo dữ liệu tìm kiếm không dấu (`searchTokens` + index) cho sản phẩm, khách hàng, đơn hàng, bảo hành, đánh giá, voucher, bài viết đang có. **Chạy trước khi deploy** bản có tìm kiếm mới |
| `fixSlugs.js` | Sửa đường dẫn (slug) chứa ký tự không hợp lệ như "/" (VD bài viết "32GB/1TB SSD" mở ra trang trắng) cho bài viết, sản phẩm, danh mục, thương hiệu |
| `fixProductImages.js` | Cập nhật ảnh sản phẩm theo đúng loại sản phẩm (loa, tai nghe, chuột, cáp...), đồng bộ ảnh phiên bản và ảnh đánh giá |

**Ghi chú về ảnh mẫu:** ảnh sản phẩm là ảnh stock từ Unsplash, chọn đúng **loại** sản phẩm, không phải ảnh chính hãng của từng mẫu máy. Admin có thể thay bằng link ảnh thật trong trang quản lý sản phẩm; `fixProductImages.js` giữ nguyên các ảnh admin đã tự nhập.

## Còn thiếu so với tài liệu phân tích đầy đủ (chưa triển khai trong bản demo này)

- Ví MoMo (VNPay đã tích hợp)
- Tự hủy đơn VNPay quá hạn chưa thanh toán để trả lại tồn kho giữ chỗ (hiện khách hoặc admin hủy thủ công)
- Gọi API hoàn tiền thật của VNPay (hiện chỉ chuyển trạng thái "đã hoàn tiền")
- Tải ảnh lên cho yêu cầu bảo hành (vẫn lưu ảnh dạng base64 trong dữ liệu)
- Chatbot tư vấn sản phẩm tự động (mục 1.1.22)
- Gamification / vòng quay may mắn (mục 1.1.19)
- Cache Redis, unit test Frontend (React Testing Library)
- Xác thực hai yếu tố 2FA, quản lý phiên đăng nhập nhiều thiết bị (mục 1.1.21 — nâng cao)

## Tài liệu đi kèm trong bộ hồ sơ nộp

- `khao-sat-hien-trang-thegioididong.md` — Báo cáo khảo sát hiện trạng (Bước 1)
- `muc-tieu-va-yeu-cau-do-an.md` — Mục tiêu và yêu cầu đồ án
- `ke-hoach-du-an.md` — Kế hoạch dự án chi tiết theo 6 bước
