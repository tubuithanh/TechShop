# TechShop — Website Thương mại điện tử Đa chi nhánh (TLCN — MERN Stack)

Mô phỏng mô hình kinh doanh và chức năng cốt lõi của **thegioididong.com**, xây dựng bằng **MongoDB – Express.js – React.js – Node.js**.

**Điểm chính của thiết kế:**
- **Đa chi nhánh thực sự:** mỗi cửa hàng có tồn kho riêng, tính theo **từng phiên bản** sản phẩm (màu × dung lượng).
- **Tách biệt tài khoản:** collection `users` (khách hàng) tách riêng với `admins` (quản trị/nhân viên).
- **Phân quyền chi tiết** cho nhân viên theo nhóm quyền, có giới hạn theo chi nhánh.
- **Cấu hình không cần sửa code:** email, thanh toán VNPay và MoMo, màu sắc giao diện, chân trang, bảo mật, nhật ký... đều chỉnh trong trang quản trị.

**Bản demo trực tuyến (Render + MongoDB Atlas):**
- Website: https://frontend-i3sp.onrender.com
- API: https://techshop-twv1.onrender.com/api

Gói miễn phí của Render tự "ngủ" khi không có truy cập, nên lần mở đầu tiên có thể mất khoảng 30–60 giây.

## Cấu trúc dự án

```
TechShop/
├── backend/            # RESTful API (Node.js + Express + MongoDB)
│   ├── config/          # Kết nối database
│   ├── models/          # Mongoose Schema (38 collection - xem mục Cấu trúc Database)
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
| Thanh toán VNPay | Tab **Thanh toán** (gộp VNPay + MoMo): Terminal ID, Secret Key, kiểm tra kết nối; chọn chế độ **Sandbox** hoặc **Giả lập** | `VNP_TMN_CODE`, `VNP_HASH_SECRET`, `VNP_URL`, `VNP_RETURN_URL` |
| Thanh toán MoMo | Tab **Thanh toán**: Partner Code, Access Key, Secret Key, kiểm tra kết nối, nút điền **bộ khóa thử công khai**; chế độ **Sandbox** hoặc **Giả lập** | `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_ENDPOINT`, `MOMO_REDIRECT_URL`, `MOMO_IPN_URL` |
| Đơn vị giao hàng (GHN sandbox / giả lập) | Tab **Giao hàng**: chọn đơn vị đang dùng, token, Shop ID, mã cửa hàng của từng chi nhánh; thêm đơn vị mới qua `utils/shippingProviders.js` | `SHIPPING_PROVIDER`, `GHN_TOKEN`, `GHN_SHOP_ID`, `ROUTING_API_URL` (dịch vụ tính đường bộ OSRM) |
| Lưu ảnh tải lên | — | `CLOUDINARY_URL` (dòng Cloudinary cung cấp trên Dashboard) **hoặc** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Đăng nhập bằng Zalo | — | `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_REDIRECT_URI`, `HTTPS_PORT` |
| Khóa mã hóa bí mật (mật khẩu SMTP, API key, Secret Key VNPay) | — | `SETTINGS_SECRET` (bỏ trống thì dùng `JWT_ACCESS_SECRET`) |
| Giới hạn tần suất | Tab **Bảo mật**: bật/tắt và số lần cho phép | `API_RATE_LIMIT` (mặc định 1000), `RATE_LIMIT_DISABLED=true` để tắt hẳn |
| Thời gian chờ thanh toán online (VNPay, MoMo) | — | `VNPAY_PAYMENT_TIMEOUT_MINUTES` (mặc định 30) |

Lưu ý:
- **MongoDB phải chạy dạng replica set** (Atlas luôn là replica set). Bán tại quầy, điều phối đơn giữa chi nhánh, gộp thẻ thành viên dùng **transaction**; MongoDB standalone sẽ báo "Bán tại quầy cần MongoDB replica set". Bật replica set 1 nút cho MongoDB cài trên Windows: thêm vào `mongod.cfg`
  ```
  replication:
    replSetName: rs0
  ```
  khởi động lại dịch vụ MongoDB, rồi chạy một lần `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })` (mongosh). Dữ liệu cũ giữ nguyên, không cần sửa `MONGO_URI`.
- **Cổng thanh toán sandbox không kết nối được** (VNPay/MoMo lỗi, bị chặn mạng): chuyển sang chế độ **Giả lập** trong tab Thanh toán để thử trọn luồng thanh toán / IPN / hoàn tiền mà không cần cổng thật.
- **Chưa cấu hình gửi email** thì chạy chế độ demo: mã OTP hiện ngay trên màn hình. Kiểm tra gửi thật bằng `node scripts/testEmail.js <email-nhận>`.
- **Chưa cấu hình Cloudinary** thì ảnh lưu vào `backend/uploads`. Trên Render ổ đĩa không bền (**mất khi deploy lại hoặc khởi động lại**), nên production cần Cloudinary.
- **VNPay:** đăng ký sandbox miễn phí tại https://sandbox.vnpayment.vn/devreg; khai báo IPN URL trên VNPay là `<backend>/api/payments/vnpay/ipn`. Chưa cấu hình thì trang thanh toán tự ẩn lựa chọn VNPay.
- **MoMo:** môi trường thử nghiệm `https://test-payment.momo.vn` dùng được ngay với bộ khóa thử công khai trong code mẫu của MoMo (tab MoMo có nút điền sẵn). IPN URL được gửi kèm mỗi giao dịch (mặc định `<backend>/api/payments/momo/ipn`), không cần khai báo trên trang MoMo. MoMo chỉ nhận đơn **từ 1.000đ đến 50.000.000đ**; đơn ngoài khoảng này khách không chọn được MoMo.

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

Khi khởi động, máy chủ còn **tự nạp** (chỉ lần đầu, không ghi đè dữ liệu admin đã sửa): 34 tỉnh/thành và 3.321 phường/xã, 4 template màu sắc giao diện, 3 slide trang chủ mặc định.

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
Có **315 test case** (68 bộ test), bao gồm:
- đơn hàng: phân trang theo nhóm trạng thái, tìm kiếm, người xác nhận, nhật ký sửa, điều phối chi nhánh, hộp "Việc cần làm" có SLA;
- giao hàng: giới hạn 20 km, nhân viên theo chi nhánh, GHN sandbox / giả lập, thông báo trạng thái vận đơn, **giao hỏa tốc 2 giờ**;
- khuyến mãi theo danh mục / sản phẩm / chiến dịch / chi nhánh / hạng, voucher theo phạm vi, **gợi ý top 3 mã có lợi nhất**, ví voucher cá nhân;
- hoàn tiền qua API VNPay / MoMo, bảo hành điện tử và gói gia hạn;
- đánh giá nhiều tiêu chí, thống kê đánh giá, xếp hạng nhân viên / đơn vị giao hàng;
- nhân viên: điều chuyển, quản lý nhiều chi nhánh, tuyến báo cáo, báo cáo hiệu suất;
- bán tại quầy: chống bán trùng, nhận diện khách theo SĐT, tạo thẻ thành viên, gộp lịch sử mua tại cửa hàng;
- tài khoản: đăng ký/đăng nhập, quên mật khẩu, đổi mật khẩu (đăng xuất thiết bị khác), đăng xuất xóa đúng cookie, không lộ trạng thái khóa khi sai mật khẩu, đăng nhập Zalo, thêm/đổi email có xác thực;
- mua hàng: giỏ hàng (cảnh báo ngừng bán/hết hàng), đặt hàng, tồn kho và giá theo phiên bản, tự hủy đơn VNPay quá hạn, số lượng "đã bán" chỉ tính khi giao thành công;
- thanh toán VNPay và MoMo: chữ ký, sai số tiền, thanh toán lại, hoàn tiền, giới hạn số tiền của MoMo, cấu hình trong trang quản trị;
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
| `staff_assignments` | Quá trình làm việc: chi nhánh chính theo thời gian, **điều chuyển tạm thời** (VD 6 tháng) |
| `staff_reviews` | Đánh giá hiệu suất cuối năm + tiền thưởng (chụp lại số liệu lúc chấm) |
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
| `orders` | Đơn hàng (gắn chi nhánh; mỗi dòng hàng ghi rõ phiên bản đã mua; lịch sử trạng thái; thông tin thanh toán online: mã giao dịch từng lần thử, mã giao dịch của cổng, hình thức/ngân hàng, thời điểm thanh toán) |
| `vouchers` | Mã giảm giá (giới hạn lượt dùng, lượt dùng mỗi khách; phạm vi: danh mục, sản phẩm, chi nhánh, hạng thành viên) |
| `promotions` | Chương trình khuyến mãi tự động (theo danh mục / thương hiệu / sản phẩm / chiến dịch marketing / chi nhánh / hạng khách) |
| `order_transfers` | Yêu cầu điều phối đơn sang chi nhánh khác |
| `express_windows` | **Khung giờ giao hỏa tốc**: chi nhánh, danh sách sản phẩm, bán kính, phụ phí, cam kết thời gian, số suất |
| `warranties` | Phiếu bảo hành / sửa chữa (tiến trình, kỹ thuật viên, đánh giá của khách) |
| `warranty_cards`, `warranty_plans` | **Sổ bảo hành điện tử** (tạo khi giao hàng, 12 tháng từ ngày mua hoặc ngày kích hoạt, hãng quản lý) và các **gói gia hạn** bán thêm |
| `reviews`, `questions` | Đánh giá **nhiều tiêu chí** (5 tiêu chí, thẻ nhận xét, ảnh, ẩn danh, phân loại đã mua, lượt "Hữu ích", phản hồi của shop); hỏi đáp sản phẩm |

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
| `payment_configs` | Cấu hình VNPay và MoMo (chế độ sandbox / giả lập); Secret Key của cả 2 cổng lưu **đã mã hóa** |
| `shipping_configs` | Cấu hình đơn vị giao hàng (GHN sandbox / giả lập), mã cửa hàng của từng chi nhánh, dịch vụ tính đường bộ |
| `slides` | Slide (banner lớn) đầu trang chủ: nội dung, nút bấm, nền (màu giao diện / dải màu / ảnh), thứ tự, bật/tắt, thời gian hiển thị |
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
- Trang chủ, danh mục, tìm kiếm và lọc sản phẩm — mục 1.1.1, 1.1.2, 1.1.3:
  - **lọc giá bằng thanh kéo 2 đầu** (giới hạn theo giá rẻ nhất – đắt nhất thực tế của danh mục) + mức giá chọn nhanh ("Dưới 5 triệu", "10 - 20 triệu"...);
  - **lọc theo thông số dạng số bằng thanh kéo** (VD: RAM 8 – 16 GB, màn hình 6,1 – 6,9 inch);
  - tự áp dụng khi thả tay (không cần bấm "Áp dụng"), kéo được bằng chuột, cảm ứng và phím mũi tên; khoảng giá lưu trên đường link.
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
  - **thanh toán online qua VNPay** (thẻ ATM, Visa/Master, QR) hoặc **ví MoMo** (ví MoMo quét QR / mở app, thẻ ATM, Visa/Master/JCB) - 2 cổng dùng chung 1 luồng xử lý:
    - kiểm tra chữ ký (VNPay: HMAC-SHA512, MoMo: HMAC-SHA256) và số tiền của mọi kết quả gửi về, nhận kết quả qua cả trang trả về và IPN (ghi nhận 1 lần, không trùng);
    - thanh toán lại khi thất bại; khách trả tiền ở lần thử cũ (tab cũ) vẫn được ghi nhận đúng đơn;
    - **đơn quá 30 phút chưa thanh toán tự hủy** và trả lại tồn kho; không tạo link thanh toán mới cho đơn sắp hết hạn; khách lỡ trả tiền sau khi đơn đã hủy thì đơn chuyển "đã hoàn tiền";
    - hủy đơn đã thanh toán thì chuyển "đã hoàn tiền" (mô phỏng);
    - cổng nào chưa cấu hình thì trang thanh toán tự ẩn lựa chọn đó; đơn ngoài giới hạn 1.000đ – 50.000.000đ không chọn được MoMo.
- Sổ địa chỉ, danh sách yêu thích — mục 1.1.7
- Đánh giá sản phẩm **sau khi nhận hàng**: chỉ khách có đơn đã giao thành công chứa sản phẩm mới được đánh giá. Có nút đánh giá trong chi tiết đơn; mỗi khách một đánh giá/sản phẩm, chấm **5 tiêu chí**, chọn thẻ nhận xét, tối đa 5 ảnh, ẩn danh, được sửa lại (xem mục 6 phần Cập nhật tháng 11/2026). Hỏi đáp (Q&A) sản phẩm — mục 1.1.8
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
- Quản lý đơn hàng theo luồng trạng thái (chặn nhảy cóc trạng thái; đơn VNPay/MoMo chưa thanh toán không được xác nhận/giao, chỉ được hủy), lọc theo phương thức thanh toán — mục 1.2.2
- **Quản lý khách hàng**: tìm kiếm, khóa/mở tài khoản (hiện rõ khách Zalo chưa có email) — mục 1.2.3
- **Quản lý nhân viên và nhóm quyền** — mục 1.2.4:
  - phân quyền chi tiết theo từng chức năng;
  - tài khoản gắn chi nhánh chỉ thao tác được trên chi nhánh của mình: tồn kho, đơn hàng (xem, xử lý) và thống kê đơn hàng/doanh thu;
  - nhóm quyền mẫu **"Quản lý cửa hàng"**: tồn kho, đơn hàng, thống kê, xem khuyến mãi.
- **Khuyến mãi/voucher**: tạo, xem, vô hiệu hóa, giới hạn số lần dùng mỗi khách; phạm vi theo danh mục / sản phẩm / chi nhánh / hạng; chương trình khuyến mãi tự động theo chiến dịch — mục 1.2.5
- **Tin tức (CMS)** — mục 1.2.6:
  - viết/sửa bài, 4 chuyên mục;
  - **nhập nhanh từ link tinhte.vn**: tự điền tiêu đề, tóm tắt, ảnh bìa, nội dung kèm ảnh trong bài (dùng link ảnh gốc), cuối bài ghi nguồn;
  - **xóa hàng loạt** (tick chọn nhiều bài) và **xóa tất cả bài viết** (phải gõ "XOA TAT CA" để xác nhận) - chỉ admin.
- **Quản lý đánh giá**: xem, tìm kiếm, lọc số sao/phản hồi và trả lời khách; không còn chức năng ẩn đánh giá. Điểm trung bình cập nhật khi khách gửi hoặc sửa đánh giá — mục 1.2.7
- Dashboard thống kê (MongoDB Aggregation + Recharts) — mục 1.2.8
- **Slide trang chủ**: thêm, sửa, xóa, đổi thứ tự, bật/tắt; nền theo màu giao diện / dải màu tự chọn / ảnh tải lên; hẹn thời gian hiển thị (VD slide khuyến mãi Tết); xem trước trực tiếp khi chỉnh
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
  - **Cấu hình thanh toán VNPay**: Terminal ID, Secret Key (mã hóa), kiểm tra kết nối, hiện sẵn IPN URL;
  - **Cấu hình thanh toán MoMo**: Partner Code, Access Key, Secret Key (mã hóa), kiểm tra kết nối, nút điền bộ khóa thử công khai.

**Kỹ thuật nổi bật:**
- Bảo mật:
  - JWT access + refresh token (cookie httpOnly), bcrypt, OTP lưu dạng băm, tự hết hạn (TTL index), giới hạn số lần nhập sai;
  - `tokenVersion` thu hồi mọi phiên cũ khi đổi/đặt lại mật khẩu;
  - **giới hạn tần suất theo IP** (toàn API, đăng nhập, OTP, quên mật khẩu, đặt hàng, đánh giá, tải ảnh) - bật/tắt và chỉnh số lần trong trang quản trị;
  - giới hạn phân trang (tối đa 200 bản ghi/trang), chặn tham số lạ (`limit[$gt]=...`);
  - mã hóa AES-256-GCM cho các bí mật admin nhập (không bao giờ trả về trình duyệt);
  - chữ ký HMAC-SHA512 cho VNPay, HMAC-SHA256 cho MoMo; so sánh chữ ký an toàn thời gian (`timingSafeEqual`);
  - nhập dữ liệu từ link chỉ chấp nhận đúng tên miền nguồn, không đi theo chuyển hướng ra ngoài, kiểm tra ảnh theo nội dung file; nội dung bài viết lưu dạng văn bản (không chèn HTML) nên không bị chèn mã độc.
- Tồn kho: cập nhật nguyên tử theo phiên bản và chi nhánh.
- Tốc độ lọc/sắp xếp: số liệu thông số và giá thực trả được tính sẵn khi lưu (`specNumbers`, `effectivePrice`).
- **Tác vụ nền** (chạy trong tiến trình máy chủ): tự hủy đơn VNPay/MoMo quá hạn thanh toán (mỗi 5 phút), dọn nhật ký quá hạn lưu (mỗi giờ).
- **Tự chuyển đổi dữ liệu khi khởi động** (chạy lại nhiều lần vẫn an toàn): nạp tỉnh/phường, xóa email tạm của tài khoản Zalo cũ và đổi chỉ số email.
- Cursor-based pagination, Socket.io real-time, kiến trúc RESTful chia theo tầng rõ ràng.

## Cập nhật đơn hàng — 10/11/2026

### Cách sử dụng

- Khách hàng: **Tài khoản → Đơn hàng của tôi**, chọn trạng thái và chuyển trang. Mỗi trang 10 đơn; số đếm chỉ thuộc tài khoản đang đăng nhập.
- Quản trị: **Quản lý đơn hàng**, xác nhận đơn như trước. Cột trạng thái và chi tiết đơn hiển thị người xác nhận, thời gian; chi tiết có lịch sử xử lý.
- **Sửa thông tin**: sửa tên người nhận, điện thoại, ghi chú khi đơn đang chờ/đã xác nhận. Bắt buộc nhập lý do. Lịch sử lưu người sửa và giá trị trước/sau, không có API xóa/sửa lịch sử.
- **Điều phối chi nhánh**: chọn chi nhánh đích và lý do. Đơn nhận tại cửa hàng cần xác nhận đã được khách đồng ý đổi nơi nhận.
- Chi nhánh đích vào **Quản lý đơn hàng → Yêu cầu điều phối đang chờ**, tiếp nhận hoặc từ chối. Chi nhánh nguồn có thể hủy yêu cầu. Nhấn **Tải lại yêu cầu điều phối** để cập nhật danh sách.

### Quy tắc

- Cần quyền `orders.manage`, kiểm tra phạm vi chi nhánh theo cơ chế mới (chi nhánh làm việc/điều chuyển nhân viên/chi nhánh được quản lý thêm). Quản lý nhiều chi nhánh dùng bộ chọn chi nhánh hiện có.
- Chỉ điều phối đơn online ở trạng thái chờ xác nhận, đã xác nhận hoặc đang xử lý; không điều phối đơn đã lấy hàng hoặc bán tại quầy. VNPay/MoMo phải thanh toán thành công trước.
- Khi chờ điều phối, khóa đổi trạng thái, sửa thông tin, xác nhận chuyển khoản, phân công shipper và hủy đơn. Muốn xử lý tiếp tại chi nhánh nguồn thì hủy yêu cầu điều phối trước.
- Tiếp nhận chạy trong MongoDB transaction: trừ tồn khả dụng của từng phiên bản ở chi nhánh đích, trả phần đã giữ về chi nhánh nguồn, đổi chi nhánh đơn. Thiếu bất kỳ mặt hàng nào thì toàn bộ giao dịch được hoàn tác.
- Sau tiếp nhận: đơn trở lại chờ xác nhận, xóa phân công shipper và thông tin xác nhận hiện tại. Lịch sử xác nhận cũ vẫn còn. Chi nhánh đích phải xác nhận lại.
- Giữ nguyên giá, VAT, phí giao, khuyến mãi, voucher và thanh toán. Đây là chuyển chi nhánh thực hiện đơn, không phải tạo lại đơn hay chuyển hàng vật lý giữa kho.
- Không hỗ trợ sửa địa chỉ giao, sản phẩm hoặc số tiền trong biểu mẫu sửa thông tin này.
- Điều phối cần MongoDB replica set (Atlas hoặc replica set local). MongoDB standalone trả lỗi rõ ràng, không thực hiện chuyển kho từng phần.
- Dữ liệu cũ: tra cứu người thao tác bằng ID đã lưu nếu còn tài khoản; không tự suy đoán chi nhánh lịch sử. Dữ liệu mới lưu tên tại thời điểm thao tác.
- Log thao tác được phân biệt với log đổi trạng thái để không làm sai ngày bắt đầu bảo hành và lịch sử tích điểm.

### Kịch bản kiểm thử thủ công

1. Tài khoản có trên 10 đơn: chuyển trang, chọn từng trạng thái, kiểm tra số lượng và không thấy đơn của tài khoản khác.
2. Nhân viên A xác nhận đơn: mở chi tiết, kiểm tra tên, thời gian, chi nhánh. Đổi tên tài khoản sau đó không được làm đổi tên đã lưu trong log mới.
3. Sửa người nhận/ghi chú: kiểm tra lý do, giá trị trước/sau và tìm kiếm được theo tên mới.
4. Gửi điều phối A → B. Thử xử lý/gán shipper/hủy đơn khi đang chờ: phải bị chặn. Nhân viên C không được tiếp nhận.
5. B thiếu một mặt hàng: tiếp nhận thất bại, tồn kho cả A/B giữ nguyên. Từ chối hoặc hủy yêu cầu để mở khóa đơn.
6. B đủ hàng: tiếp nhận một lần, kiểm tra tồn kho hai bên và đơn về chờ xác nhận. B xác nhận lại; sau đó khách hủy thì chỉ hoàn kho B.
7. Đơn nhận tại cửa hàng chưa tích đồng ý của khách: không gửi được. Đơn đã giao/đang giao hoặc VNPay chưa trả tiền: không điều phối được.

### Kiểm thử tự động

`backend/tests/orderUpgrade.test.js` kiểm tra phân trang, quyền truy cập, snapshot người xác nhận, nhật ký sửa, tìm kiếm sau sửa, điều phối đồng thời, hoàn tác kho và các ràng buộc trên. Chạy bằng `npm test -- --runTestsByPath tests/orderUpgrade.test.js --silent` từ thư mục backend.

## Cập nhật chức năng — tháng 11/2026 (theo ghi chú yêu cầu ngày 09/11/2026)

### 1. Đơn hàng
- **Đơn hàng của tôi** (khách):
  - gom 11 trạng thái thành 5 tab dễ hiểu (Tất cả · Chờ xử lý · Đang giao · Đã nhận · Hủy/Trả hàng), tab trống hiện mờ, tab cần chú ý có chấm đỏ;
  - phân trang, tìm theo mã đơn / tên sản phẩm;
  - khối **"Cần bạn làm"**: đơn chưa thanh toán, đơn đang giao, sản phẩm chờ đánh giá;
  - thẻ đơn có ảnh sản phẩm, thanh tiến trình 4 bước, câu gợi ý tình trạng, nút theo trạng thái (Thanh toán, Hủy đơn, Theo dõi vận chuyển, Đánh giá, Bảo hành, **Mua lại**);
  - ô **"Thêm đơn mua tại cửa hàng"** (xem mục Bán tại quầy).
- **Quản trị**:
  - hộp **"Việc cần làm"** chia nhóm theo việc tiếp theo, có ngưỡng **SLA** (admin chỉnh) và cảnh báo quá hạn;
  - bộ lọc trạng thái hoàn tiền;
  - **xuất CSV** danh sách đơn.
- **Người xác nhận và nhật ký:** mỗi lần xác nhận / đổi trạng thái / sửa thông tin đều lưu người làm, thời gian, chi nhánh, giá trị trước/sau.
- **Ai thêm / sửa / xóa trên toàn trang quản trị:** mọi bản ghi admin tạo hoặc sửa đều có dấu **"người thao tác cuối"** (trường `audit`, ghi tự động bằng plugin Mongoose). Nhật ký thao tác lưu chi tiết từng lần.
- **Điều phối đơn** sang chi nhánh khác: chi nhánh nhận chấp nhận / từ chối, chuyển kho trong transaction (xem mục "Cập nhật đơn hàng — 10/11/2026").

### 2. Giao hàng
- **Theo chi nhánh:** nhân viên giao hàng gắn chi nhánh; phân công chỉ chọn shipper của đúng chi nhánh.
- **Nhật ký phân công:** ai phân công / đổi người / gửi đơn vị ngoài.
- **Trang phân công thông minh:** theo từng giai đoạn, có đếm số đơn; riêng mục "giao thất bại" để liên hệ lại khách.
- **Giới hạn 20 km đường bộ** (OSRM): trong 20 km cùng tỉnh thì nhân viên chi nhánh giao. **Quá 20 km hoặc khác tỉnh** thì gửi **đơn vị thứ 3** (GHN sandbox hoặc GHN giả lập), lưu **mã vận đơn**.
- **Khách theo dõi vận chuyển:**
  - trang theo dõi có dòng thời gian trạng thái vận đơn;
  - email tự động khi vận đơn đổi trạng thái (đã lấy hàng, đang giao, giao thất bại, đã giao), có link theo dõi.
- **Cấu hình giao hàng** trong Admin → Cấu hình hệ thống → **Giao hàng**: chọn đơn vị, nhập khóa, mã cửa hàng của từng chi nhánh. Thêm đơn vị mới chỉ cần khai báo trong `utils/shippingProviders.js`.
- **Giao hỏa tốc 2 giờ** (Admin → **Giao hỏa tốc 2 giờ**):
  - **Quản lý mở khung giờ:** thời gian, **danh sách sản phẩm**, **bán kính** (≤ 20 km), **phụ phí**, **cam kết thời gian** (60 / 90 / 120 / 180 phút), **số suất**. Theo dõi số đơn, đã giao, **trễ hạn**, doanh thu; có nút kết thúc sớm.
  - **Trang sản phẩm:** sản phẩm đang trong khung hiện "⚡ Giao hỏa tốc 2 giờ từ <chi nhánh>, bán kính, đặt trước <giờ>, còn N suất".
  - **Trang thanh toán:** khách bấm **Kiểm tra vị trí** (GPS trình duyệt). Hệ thống kiểm tra đủ 4 điều kiện:
    - đúng sản phẩm trong khung;
    - chi nhánh còn hàng;
    - khoảng cách đường bộ trong bán kính;
    - khung còn suất.
    
    Đạt thì khách bật **"Chọn giao hỏa tốc"**: tổng tiền cộng phụ phí, hiện giờ nhận hàng dự kiến. Không đạt thì hiện lý do cụ thể.
  - **Ngay khi đặt:**
    - kiểm tra lại toàn bộ và giữ suất (không vượt số suất khi nhiều khách đặt cùng lúc);
    - **tự xác nhận** (COD / chuyển khoản);
    - **tự phân công shipper rảnh nhất** của chi nhánh;
    - **báo ngay qua Socket.io**: băng đỏ "⚡ ĐƠN HỎA TỐC MỚI" kèm SĐT, địa chỉ khách và âm báo.
  - **Theo dõi hạn giao:** trang shipper có **đồng hồ đếm ngược** (Còn 1h25 → đỏ khi dưới 30 phút → "TRỄ n phút"). Trang chi tiết đơn của khách hiện cam kết giao trước mấy giờ. Hệ thống ghi giờ giao xong để tính đúng hạn hay trễ.

### 3. Doanh thu & thống kê
- **Dashboard:**
  - doanh thu **theo tháng** (chọn năm, so sánh năm trước);
  - doanh thu **theo chi nhánh** (lọc năm / tháng).
- **Trang Phân tích:**
  - sản phẩm bán chạy, cơ cấu danh mục, phương thức thanh toán;
  - tỷ lệ hủy / trả, khách hàng mới / quay lại, khung giờ đặt hàng;
  - **hiệu quả từng chiến dịch khuyến mãi**.

### 4. VAT
- **Ẩn VAT phí ship:** hóa đơn, trang thanh toán và email chỉ hiện **VAT hàng hóa** (đã bao gồm). VAT phí ship vẫn được tính và lưu để xuất hóa đơn điện tử.

### 5. Khuyến mãi / Giảm giá
- **Chương trình khuyến mãi tự động** (Admin → Chương trình khuyến mãi):
  - **áp dụng theo:** danh mục, thương hiệu, từng sản phẩm, **chiến dịch marketing** (tên + kênh), chi nhánh, **hạng khách hàng**;
  - **hình thức giảm:** theo % hoặc số tiền, có giảm tối đa;
  - **giới hạn:** thời gian và số lượng.
  
  Trang chi tiết sản phẩm hiện giá sau khuyến mãi và **danh sách khuyến mãi đang áp dụng**.
- **Voucher theo phạm vi:** danh mục, sản phẩm, chi nhánh, hạng thành viên. Mã chỉ giảm trên phần tiền của sản phẩm thuộc phạm vi.
- **Gợi ý mã có lợi nhất** (POS và trang Thanh toán):
  - tự tính số tiền giảm của từng mã cho đúng giỏ hàng, **chỉ hiện 3 mã có lợi nhất** và **tự áp mã tốt nhất**;
  - gợi ý **"Mua thêm X để dùng mã…"** khi mã đó lợi hơn mã hiện tại;
  - tự loại mã hết hạn, hết lượt, khách đã dùng hết lượt, sai chi nhánh / hạng.
- **Ví voucher cá nhân** (Tài khoản → **Mã giảm giá của tôi**):
  - 5 tab: Dùng được ngay · Sắp hết hạn · Sắp diễn ra · Mở khóa khi lên hạng · Đã dùng;
  - số lượt khách còn được dùng, **tổng tiền đã tiết kiệm nhờ mã**;
  - nút Sao chép, nút Dùng ngay (tới đúng danh mục / sản phẩm của mã).

### 6. Đánh giá sản phẩm
- **Đánh giá nhiều tiêu chí sau khi nhận hàng:**
  - điểm chung + 5 tiêu chí: chất lượng, đúng mô tả, đóng gói, tốc độ giao hàng, thái độ phục vụ;
  - thẻ nhận xét nhanh (khen / chê), tối đa 5 ảnh, **ẩn danh** (tên dạng N***n);
  - tự ghi **phân loại đã mua**.
- **Trang sản phẩm:**
  - tổng quan điểm, phân bố sao, điểm từng tiêu chí, thẻ nhận xét phổ biến;
  - lọc theo sao / có ảnh, sắp xếp (mới nhất, hữu ích nhất, điểm cao / thấp);
  - nút **"Hữu ích"**.
- **Admin → Đánh giá, tab "Tổng quan & biểu đồ":**
  - **KPI:** tổng số, điểm TB, % hài lòng, chưa phản hồi, có thẻ chê, có ảnh;
  - **biểu đồ:** theo tháng, phân bố sao, điểm theo tiêu chí, thẻ khen / chê;
  - **xếp hạng:** sản phẩm cần chú ý / được khen; điểm theo chi nhánh;
  - **xếp hạng giao hàng:** nhân viên được đánh giá cao / thấp, **đơn vị giao hàng**.
  
  Bấm vào số liệu để mở danh sách đã lọc sẵn. Tab danh sách hiện đủ tiêu chí, thẻ, ảnh, mã đơn, chi nhánh.
- **Bỏ chức năng ẩn đánh giá** (đánh giá từng bị ẩn được hiện lại khi khởi động).

### 7. Hoàn hàng / Hoàn tiền
- **Quy trình:** trả hàng → chi nhánh nhận lại hàng (hoàn kho) → **xác nhận hoàn tiền**.
- **Đơn VNPay / MoMo:** gọi **API hoàn tiền sandbox** của cổng:
  - VNPay `merchant_webapi`, ký HMAC-SHA512;
  - MoMo `/v2/gateway/api/refund`, ký HMAC-SHA256;
  - hoàn về **đúng tài khoản / thẻ khách đã dùng**.
- **Trạng thái hoàn tiền:** chờ → đang xử lý → đã hoàn. Đơn COD / chuyển khoản thì hoàn thủ công, có ghi chú.
- **Khách thấy thông báo** "tiền sẽ được hoàn về tài khoản đã thanh toán" và thời điểm đã hoàn. Chế độ **giả lập** cũng chạy được trọn luồng hoàn tiền.

### 8. Bảo hành
- **Sổ bảo hành điện tử** tạo tự động khi giao hàng (cả bán tại quầy):
  - **12 tháng** tính từ **ngày mua** hoặc **ngày kích hoạt** (cấu hình theo sản phẩm);
  - bảo hành **tại cửa hàng** hoặc **do hãng quản lý** (thông tin trung tâm bảo hành của nhãn hàng).
- **Kiểm tra còn bảo hành:**
  - khách: Tài khoản → Bảo hành, chia tab;
  - admin / nhân viên: tra theo số serial, mã đơn hoặc SĐT; hệ thống tự xác định còn bảo hành / do hãng / hết hạn (sửa tính phí).
- **Mua thêm thời gian bảo hành:** gói gia hạn do admin cấu hình; nhân viên xác nhận thu tiền.

### 9. Nhân viên & quản lý
- **Điều chuyển tạm thời** giữa chi nhánh (VD 6 tháng), tự hết hạn; ghi **quá trình làm việc** theo thời gian.
- **Một quản lý nhiều chi nhánh** (`managedStoreIds`); quản lý chọn "chi nhánh đang làm việc" trên thanh trên cùng.
- **Một chi nhánh nhiều nhân viên, một nhân viên nhiều chi nhánh:** màn hình nhân sự của từng chi nhánh.
- **Thêm chi nhánh mới** ngay trong admin:
  - kiểm tra dữ liệu, tọa độ, thống kê từng chi nhánh;
  - chặn ngưng hoạt động khi còn đơn / tồn kho / nhân viên.
- **Tuyến báo cáo:** mỗi nhân viên có **quản lý trực tiếp**. Hệ thống chặn vòng báo cáo; khi xóa quản lý, cấp dưới tự chuyển lên cấp trên.
- **Hiệu suất & thưởng cuối năm:** số liệu 12 tháng, đánh giá 1–5 sao, tiền thưởng, điểm mạnh / cần cải thiện.
- **Báo cáo nhân viên** (Admin → Báo cáo nhân viên; admin, quản lý chi nhánh hoặc người có cấp dưới):
  - **chọn kỳ:** tháng này, tháng trước, quý, năm, tùy chọn; **so sánh kỳ trước**; lọc chi nhánh;
  - **phạm vi:** "Báo cáo trực tiếp cho tôi" hoặc tất cả trong phạm vi;
  - **tab Tổng quan:**
    - KPI cả đội;
    - vinh danh: bán hàng giỏi nhất, giao hàng xuất sắc, kỹ thuật viên tiêu biểu;
    - biểu đồ sản lượng, cơ cấu nhân sự;
    - danh sách **"Cần quản lý chú ý"**;
  - **tab Bán hàng / Giao hàng / Bảo hành:** biểu đồ từng người + **bảng xếp hạng** (sắp xếp theo cột);
  - **số liệu theo vai trò:**
    - **bán hàng:** doanh thu, đơn, sản phẩm, TB / đơn, đánh giá;
    - **giao hàng:** thành công / thất bại, tỷ lệ, thời gian giao TB, COD, điểm giao hàng, khen / chê;
    - **bảo hành:** phiếu tiếp nhận / hoàn tất, thời gian xử lý, doanh thu sửa chữa + gia hạn, điểm khách chấm.
- **Báo cáo của tôi** (mọi nhân viên):
  - số liệu của chính mình, so với kỳ trước và trung bình chi nhánh;
  - **hạng trong chi nhánh / toàn hệ thống**;
  - sản phẩm bán chạy của mình, nhận xét của khách.

### 10. Bán hàng tại quầy (POS)
- **Bố cục:** lưới sản phẩm (ảnh, giá, giá gốc, tồn, nhãn bán chạy, lọc danh mục) + giỏ hàng cố định bên phải.
- **Hỗ trợ máy quét mã vạch:** gõ hoặc quét rồi Enter là thêm kết quả đầu tiên.
- **Tự tính tiền:** khuyến mãi, voucher, VAT; ô **"Khách đưa"** + mệnh giá gợi ý + **tiền thừa**.
- **Thanh toán 1 lần bấm** (F9). Khách lẻ không cần tên / SĐT (ghi "Khách lẻ").
- **Lưu tạm đơn** (đơn chờ), **ca bán hôm nay** (số đơn, doanh thu, tiền mặt trong két), đơn vừa bán.
- **Phím tắt:** F2 tìm hàng · F4 tìm khách · F8 lưu tạm · F9 thanh toán.
- **Khách mua lần đầu:**
  - nhập SĐT là **tự nhận diện** thành viên / khách cũ chưa có tài khoản / khách mới;
  - **tạo thẻ thành viên ngay tại quầy** (phải xác nhận đã hỏi ý khách) để **tích điểm + sổ bảo hành theo tài khoản** từ đơn đầu tiên;
  - **tự gộp các đơn cũ cùng SĐT**; có email thì gửi email chào mừng hướng dẫn đặt mật khẩu.
- **Khách tự gộp lịch sử online:** nhập **mã đơn trên hóa đơn**, SĐT phải trùng SĐT tài khoản. Thẻ tại quầy chưa từng đăng nhập được gộp hẳn vào tài khoản thật.
- **Đơn tại quầy của khách có tài khoản** được **cộng điểm thưởng** ngay.
- **Chống lỗi:** bấm 2 lần / mạng chập chờn không tạo 2 đơn, không bán vượt tồn kho (transaction).

### 11. Thanh toán
- **Cấu hình gộp** trong tab **Thanh toán**.
- **Chế độ giả lập VNPay / MoMo:** trang thanh toán giả lập ký khóa thật, có IPN và hoàn tiền. Dùng khi môi trường sandbox của cổng không truy cập được.

### 12. Sức khỏe chi nhánh / Sức khỏe TechShop
- Admin → **Sức khỏe chi nhánh** (admin và quản lý chi nhánh). Xem 1 chi nhánh thì ra báo cáo của chi nhánh đó; xem nhiều chi nhánh thì ra **Sức khỏe TechShop** (gộp) kèm **xếp hạng từng chi nhánh**. Quản lý chỉ thấy chi nhánh mình quản lý.
- **Điểm 0–100** có trọng số theo 6 nhóm, xếp mức 🟢 Khỏe (≥75) / 🟡 Cần theo dõi (55–74) / 🔴 Báo động (<55):
  - **Doanh thu 25%:** tăng trưởng so với kỳ trước, tỷ lệ giảm giá;
  - **Khách hàng 25%:** điểm đánh giá, tỷ lệ phàn nàn, khách quay lại, điểm giao hàng;
  - **Vận hành 20%:** xác nhận đơn trong 2 giờ, tỷ lệ hủy / trả, giao thành công lần đầu, hỏa tốc đúng hạn, bảo hành tồn quá 7 ngày;
  - **Tồn kho 15%:** tỷ lệ còn hàng, hàng tồn không bán được, **sản phẩm bán chạy đang hết hàng**;
  - **Con người 10%:** đủ vai trò (quản lý / bán hàng / giao hàng / kỹ thuật viên), doanh thu mỗi nhân viên;
  - **Rủi ro 5%:** COD shipper giữ quá 2 ngày, đơn chờ hoàn tiền, đánh giá xấu chưa phản hồi.
- **Danh sách vấn đề cần xử lý:** sắp theo mức nghiêm trọng, mỗi dòng kèm **gợi ý hành động**. Có thêm **điểm mạnh** của chi nhánh, 12 chỉ số chính so với kỳ trước.
- **Biểu đồ:** biểu đồ mạng nhện so sánh 6 nhóm giữa các chi nhánh, doanh thu từng chi nhánh theo ngày / tháng.

### 13. Hóa đơn điện tử (giả lập)
- Admin → **Hóa đơn điện tử** (quyền quản lý đơn hàng). Mô phỏng hóa đơn GTGT có mã của cơ quan thuế theo NĐ 123/2020 và TT 78/2021, **không gửi lên cơ quan thuế thật**.
- **Đánh số:** mẫu số 1, ký hiệu `C26TTS`, số hóa đơn **tăng liên tục** theo ký hiệu (bộ đếm nguyên tử, không trùng số kể cả phát hành đồng thời).
- **Thông tin trên hóa đơn:** mã của CQT, **mã tra cứu**, chữ ký số giả lập (HMAC-SHA256, kiểm tra được "Signature Valid"), **số tiền bằng chữ**.
- **Số liệu lấy đúng VAT đã tính khi đặt hàng:** từng dòng hàng (giá chưa thuế, chiết khấu, thuế suất), phí vận chuyển, tổng hợp theo thuế suất.
- **Người mua:** công ty (tên, MST, địa chỉ, email khách nhập lúc thanh toán) hoặc cá nhân.
- **Phát hành:** chỉ cho đơn **đã giao / đã bàn giao** và đã thu tiền.
  - **1 đơn:** từ khung xử lý đơn.
  - **Hàng loạt:** nút "Phát hành cho N đơn đã giao", tối đa 200 đơn / lần.
  
  Tự **gửi email** cho người mua kèm link tra cứu.
- **Hủy hóa đơn** (bắt buộc lý do) và **lập hóa đơn thay thế**: sửa tên / MST / địa chỉ người mua; hóa đơn cũ chuyển "bị thay thế", liên kết với hóa đơn mới. Mỗi đơn chỉ có 1 hóa đơn đang hiệu lực.
- **Bản thể hiện hóa đơn** in được / lưu PDF: dấu "ĐÃ HỦY" / "ĐÃ BỊ THAY THẾ", dấu chìm "GIẢ LẬP".
- **Khách xem hóa đơn:** trong chi tiết đơn, hoặc **tra cứu công khai** tại `/tra-cuu-hoa-don` bằng mã tra cứu.
- **Cấu hình:** Admin → Cấu hình hệ thống → tab **Hóa đơn điện tử**.
  - **Nhà cung cấp:** **Giả lập** (mặc định) hoặc **Bkav eHoadon** (SOAP `ExecCommand`, dữ liệu GZip + AES-256-CBC theo PartnerToken `KEY:IV`; PartnerToken lưu mã hóa; có nút kiểm tra kết nối). Thêm nhà cung cấp mới: khai báo trong `backend/utils/einvoiceProviders.js`, giao diện tự hiện form.
  - **Người bán:** tên, MST (kiểm tra định dạng), địa chỉ, điện thoại, email, tài khoản.
  - **Ký hiệu:** mẫu số, ký hiệu (kiểm tra dạng `C26TAA`).
  - **Tự động:** **tự xuất hóa đơn khi đơn giao thành công / bán tại quầy**, **tự gửi email**.
  - **Bkav lỗi** thì hóa đơn **không** được tạo; hệ thống không tự chuyển sang giả lập.
  - **Lưu ý:** bộ kết nối Bkav viết theo tài liệu tích hợp, cần tài khoản demo Bkav để kiểm chứng.

### Tài khoản demo nhân viên
Trang đăng nhập có sẵn danh sách tài khoản demo theo vai trò (quản lý, bán hàng, kho, giao hàng, kỹ thuật viên) của từng chi nhánh. Mật khẩu demo của nhóm tài khoản nhân viên mẫu: `nhanvien123`. Sinh thêm nhân viên mẫu: `node seed/generateStaff.js --staff-only` (`--random-passwords --out=<file>` để tạo mật khẩu ngẫu nhiên và xuất ra file).

## Script cập nhật dữ liệu (không xóa dữ liệu, chạy lại nhiều lần vẫn an toàn)

Khi khởi động phiên bản mới, `migrateProductReviews` tự hiển thị lại các đánh giá cũ từng bị ẩn, tính lại số sao/số lượng đánh giá và lưu dấu mốc chuyển đổi để không chạy lại. Giữ nguyên nội dung đánh giá cũ; không tự gắn nhãn đã mua hàng cho dữ liệu chưa được xác minh. Các đánh giá mới được kiểm tra đơn đã giao và chặn gửi trùng ở API/database.

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
| `generateStaff.js --staff-only` | Sinh quản lý / nhân viên bán hàng / kho / giao hàng / kỹ thuật viên cho từng chi nhánh, nhóm quyền, ngày vào làm, đơn bán tại quầy 12 tháng |
| `generateDeliveryReviews.js [--orders=200] [--days=60]` | Đơn giao tận nơi đã giao (do nhân viên hoặc GHN giả lập) + đánh giá nhiều tiêu chí, để xem xếp hạng giao hàng |
| `generateStaffReportData.js` | Gán tuyến báo cáo (nhân viên → quản lý chi nhánh → admin), lấp doanh số tại quầy 12 tháng (có mùa cao điểm), phiếu bảo hành cho kỹ thuật viên |
| `generateVouchers.js` | 27 voucher đa dạng: toàn shop, theo danh mục / sản phẩm / chi nhánh / hạng, giới hạn lượt, sắp hết hạn, sắp diễn ra, đã hết hạn, đang tắt |
| `generateExpressWindows.js` | Khung giờ hỏa tốc cho mỗi chi nhánh (đang mở, sắp mở, đã kết thúc) với sản phẩm bán chạy còn hàng; gán tọa độ cho chi nhánh chưa có |

Các script `generate*.js` mặc định **chỉ chạy trên MongoDB local**. Muốn ghi lên database online phải đặt `MONGO_URI` và thêm cờ `--allow-remote` (chỉ thêm dữ liệu, không xóa):
```
MONGO_URI="<chuỗi-kết-nối-Atlas>" node seed/generateVouchers.js --allow-remote
```
Không ghi chuỗi kết nối có mật khẩu vào mã nguồn hay README (repo công khai).

**Thử giao hỏa tốc trên máy tính:** Chrome → F12 → ⋮ → More tools → **Sensors** → Location → nhập tọa độ gần chi nhánh (VD Quận 1: `10.7800, 106.6950`; Cầu Giấy: `21.0330, 105.7950`; Hải Châu: `16.0600, 108.2150`), thêm sản phẩm có nhãn "⚡ Giao hỏa tốc" vào giỏ rồi bấm **Kiểm tra vị trí** ở trang Thanh toán.

Các việc sau **không cần chạy script** - máy chủ tự làm khi khởi động: nạp tỉnh/thành - phường/xã (khi chưa có), nạp template màu (khi admin mở tab Màu sắc lần đầu), xóa email tạm `zalo…@zalo.techshop.local` của tài khoản Zalo cũ và đổi chỉ số email.

**Ghi chú về ảnh mẫu:** ảnh sản phẩm là ảnh stock từ Unsplash, chọn đúng **loại** sản phẩm, không phải ảnh chính hãng của từng mẫu máy. Admin có thể thay bằng ảnh thật trong trang quản lý sản phẩm; `fixProductImages.js` giữ nguyên các ảnh admin đã tự nhập.

**Ghi chú về dữ liệu nhập từ trang khác:** sản phẩm nhập từ thegioididong.com và bài viết nhập từ tinhte.vn là dữ liệu thuộc bản quyền của các trang đó, chỉ dùng cho mục đích minh họa (bài viết tự ghi nguồn ở cuối).

## Còn thiếu so với tài liệu phân tích đầy đủ (chưa triển khai trong bản demo này)

- Hoàn tiền qua cổng **môi trường thật** (production) của VNPay / MoMo: hiện gọi API hoàn tiền **sandbox** / giả lập; quy trình thật cần làm việc với ngân hàng
- Gọi API thật của các đơn vị vận chuyển khác ngoài GHN (Shopee Express, GHTK...): đã có khung khai báo trong `utils/shippingProviders.js`
- Chấm công, ca làm việc, nghỉ phép, bảng lương (đã có báo cáo hiệu suất và thưởng cuối năm)
- Tải ảnh lên cho yêu cầu bảo hành (vẫn lưu ảnh dạng base64 trong dữ liệu)
- Chatbot tư vấn sản phẩm tự động (mục 1.1.22)
- Gamification / vòng quay may mắn (mục 1.1.19)
- Cache Redis, unit test Frontend (React Testing Library)
- Xác thực hai yếu tố 2FA, quản lý phiên đăng nhập nhiều thiết bị (mục 1.1.21 — nâng cao)
- Lọc NoSQL injection tập trung (hiện kiểm tra kiểu dữ liệu ở từng API; header bảo mật đã dùng helmet)

**Thanh toán thử MoMo (sandbox):** dùng bộ khóa thử công khai (tab MoMo → "bộ khóa thử công khai của MoMo"). Trên trang MoMo có thể chọn Ví MoMo (quét QR bằng **ứng dụng MoMo bản thử nghiệm** tải từ developers.momo.vn - app MoMo thật không thanh toán được đơn thử), thẻ ATM hoặc thẻ quốc tế với thẻ test trong tài liệu MoMo.

**Thẻ ngân hàng thanh toán thử của VNPay (sandbox):**

| | |
|---|---|
| Ngân hàng | NCB |
| Số thẻ | 9704198526191432198 |
| Tên in trên thẻ | NGUYEN VAN A |
| Ngày phát hành | 07/15 |
| Mật khẩu OTP | 123456 |


