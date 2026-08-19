# KẾ HOẠCH DỰ ÁN ĐỒ ÁN TỐT NGHIỆP
## Đề tài: Xây dựng website thương mại điện tử theo mô hình thegioididong.com (MERN Stack)

---

## Phân công công việc nhóm

| Giai đoạn (Phase) | Nhiệm vụ cụ thể (Task) | Người phụ trách (Assignee) |
|---|---|---|
| Bước 1: Khảo sát | Khảo sát 3 website (thegioididong, FPT Shop, CellphoneS) | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 1: Khảo sát | Xác định mục tiêu, phạm vi & yêu cầu đồ án (SRS sơ bộ) | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 2: Phân tích & thiết kế | Đặc tả yêu cầu chức năng & phi chức năng (SRS hoàn chỉnh) | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 2: Phân tích & thiết kế | Mô hình Use-case & Use-case description | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 2: Phân tích & thiết kế | Mô hình Activity & Sequence Diagram | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 2: Phân tích & thiết kế | Class Diagram & Thiết kế CSDL (MongoDB Schema, ERD) | Bùi Thành Tú (chính), Bá Hoài Sơn |
| Bước 2: Phân tích & thiết kế | Thiết kế kiến trúc hệ thống & Wireframe/UI prototype | Bá Hoài Sơn (chính), Bùi Thành Tú |
| Bước 3: Xây dựng Backend (API) | Khởi tạo NodeJS, MongoDB. Thiết kế API Specs (Swagger/Postman) & Mock Data cho Frontend | Bùi Thành Tú |
| Bước 3: Xây dựng Backend (API) | Xác thực & phân quyền (JWT, bcrypt, Middleware Auth/Role) | Bùi Thành Tú |
| Bước 3: Xây dựng Backend (API) | API CRUD: Sản phẩm, Danh mục. API Bộ lọc động phức tạp (Aggregation) | Bùi Thành Tú |
| Bước 3: Xây dựng Backend (API) | API Giỏ hàng, Đơn hàng & Tích hợp VNPay/Momo | Bùi Thành Tú |
| Bước 3: Xây dựng Backend (API) | API Đánh giá, Bảo hành, Khuyến mãi & Thống kê Dashboard | Bùi Thành Tú |
| Bước 3: Xây dựng Backend (API) | Tích hợp Socket.io (Thông báo/Chat), Cloudinary, Nodemailer | Bùi Thành Tú |
| Bước 4: Xây dựng UI Frontend | Khởi tạo React, Router, UI Lib. Dựng UI khung & tích hợp Mock API | Bá Hoài Sơn |
| Bước 4: Xây dựng UI Frontend | UI Khách hàng: Trang chủ, Danh sách SP & Xử lý Bộ lọc động trên URL | Bá Hoài Sơn |
| Bước 4: Xây dựng UI Frontend | UI Khách hàng: Chi tiết SP, Đánh giá & Giỏ hàng, Checkout Flow | Bá Hoài Sơn |
| Bước 4: Xây dựng UI Frontend | UI Tài khoản, Auth, Tích hợp Socket.io (Nhận thông báo real-time/Chat) | Bá Hoài Sơn |
| Bước 4: Xây dựng UI Frontend | UI Quản trị (Admin): Dashboard biểu đồ, Quản lý SP, Đơn hàng, Bảo hành | Bá Hoài Sơn |
| Bước 4: Xây dựng UI Frontend | Thay thế Mock API bằng API thật. Tối ưu UX/UI, Responsive | Bá Hoài Sơn |
| Bước 5: Triển khai (Deployment) | Cấu hình MongoDB Atlas & Deploy Backend lên Server (Render/VPS) | Bùi Thành Tú |
| Bước 5: Triển khai (Deployment) | Deploy Frontend lên Vercel/Netlify & Cấu hình Domain | Bá Hoài Sơn |
| Bước 6: Testing (Kiểm thử) | Lập kế hoạch test & Thiết kế Test Cases, Test API (Postman) | Bùi Thành Tú |
| Bước 6: Testing (Kiểm thử) | Kiểm thử UI/UX, Luồng End-to-End (E2E) & Test trên Server Live | Bá Hoài Sơn |
| Bước 6: Testing (Kiểm thử) | Bug tracking & Fix bug toàn hệ thống | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 7: Viết báo cáo | Viết Báo cáo - Chương 1, 2, 3 (Mở đầu, Cơ sở lý thuyết, Phân tích thiết kế) | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 7: Viết báo cáo | Viết Báo cáo - Chương 4 (Cài đặt) & Chương 5, 6 (Kiểm thử, Kết luận) | Bùi Thành Tú, Bá Hoài Sơn |
| Bước 7: Viết báo cáo | Chuẩn bị Slide thuyết trình, Video kịch bản demo & Câu hỏi phản biện | Bùi Thành Tú, Bá Hoài Sơn |

*(Bùi Thành Tú phụ trách chính Backend, Bá Hoài Sơn phụ trách chính Frontend. Trong quá trình thực hiện, hai thành viên vẫn phối hợp trao đổi, hỗ trợ chéo lẫn nhau khi cần để đảm bảo tiến độ chung của đồ án — bảng trên thể hiện vai trò/đầu mối phụ trách chính của từng người.)*

---

## Tổng quan kế hoạch

| Bước | Nội dung | Kết quả bàn giao chính | Thời gian dự kiến |
|---|---|---|---|
| 1 | Khảo sát hiện trạng | Báo cáo khảo sát, bảng ưu/nhược điểm | Tuần 1 |
| 2 | Phân tích & thiết kế hệ thống | SRS, các sơ đồ UML, thiết kế CSDL | Tuần 2-3 |
| 3 | Xây dựng Backend | API hoàn chỉnh, tài liệu API | Tuần 4-6 |
| 4 | Xây dựng UI (Frontend) | Giao diện hoàn chỉnh, tích hợp API | Tuần 6-9 |
| 5 | Testing | Test case, báo cáo kết quả kiểm thử | Tuần 10-11 |
| 6 | Viết báo cáo | Quyển báo cáo hoàn chỉnh, slide bảo vệ | Tuần 11-12 |

*(Mốc thời gian mang tính tham khảo, điều chỉnh theo thời lượng thực tế của đồ án và lịch của giảng viên hướng dẫn. Bước 3-4 có thể triển khai song song nếu nhóm có từ 2 thành viên trở lên.)*

---

## BƯỚC 1: Khảo sát hiện trạng

**Mục tiêu:** Tìm ra ưu điểm/nhược điểm của tối thiểu 3 website liên quan đến đề tài, làm cơ sở định hướng thiết kế.

**Công việc cụ thể**
1. Chọn 3 website khảo sát: thegioididong.com (đối tượng chính), FPT Shop, CellphoneS (đối thủ cạnh tranh)
2. Phân tích chi tiết chức năng của từng website (front-end khách hàng + back-end quản trị nếu tiếp cận được thông tin công khai)
3. Đánh giá ưu điểm, nhược điểm của từng trang, có dẫn chứng cụ thể
4. Lập ma trận so sánh chức năng "có/không có" giữa các trang
5. Rút ra định hướng thiết kế: kế thừa điểm mạnh, khắc phục điểm yếu, chọn điểm khác biệt cho đồ án
6. Xác định mục tiêu, phạm vi, yêu cầu chức năng/phi chức năng cho đồ án (dựa trên khảo sát)

**Kết quả bàn giao**
- Báo cáo khảo sát hiện trạng (đã hoàn thành — file "khao-sat-hien-trang-thegioididong.md")
- Tài liệu Mục tiêu và Yêu cầu đồ án (đã hoàn thành — file "muc-tieu-va-yeu-cau-do-an.md")

**Trạng thái:** ✅ Đã hoàn thành

---

## BƯỚC 2: Phân tích hệ thống

**Mục tiêu:** Chuyển yêu cầu nghiệp vụ thành các mô hình phân tích/thiết kế hệ thống theo chuẩn UML, làm nền tảng cho việc lập trình ở Bước 3-4.

**Công việc cụ thể**

### 2.1. Đặc tả yêu cầu chức năng & phi chức năng
- Chuẩn hóa danh sách yêu cầu chức năng thành bảng đặc tả (SRS – Software Requirements Specification): mã yêu cầu, mô tả, actor liên quan, độ ưu tiên
- Chuẩn hóa yêu cầu phi chức năng: hiệu năng, bảo mật, khả năng mở rộng, khả năng bảo trì...

### 2.2. Mô hình Use-case
- Xác định các actor: Khách hàng (Guest/Customer), Nhân viên, Quản trị viên
- Vẽ sơ đồ use-case tổng quát (toàn hệ thống) và use-case chi tiết theo từng nhóm chức năng (quản lý sản phẩm, đặt hàng, thanh toán, bảo hành...)
- Viết đặc tả use-case (use-case description) cho các luồng chính: tiền điều kiện, luồng sự kiện chính, luồng thay thế/ngoại lệ, hậu điều kiện

### 2.3. Mô hình Activity (sơ đồ hoạt động)
- Vẽ activity diagram cho các quy trình nghiệp vụ phức tạp, nhiều bước quyết định:
  - Quy trình đặt hàng – thanh toán
  - Quy trình xử lý đơn hàng phía quản trị
  - Quy trình gửi yêu cầu và xử lý bảo hành
  - Quy trình đăng ký/đăng nhập/xác thực OTP

### 2.4. Class Diagram
- Xác định các lớp đối tượng chính: User, Product, Category, Cart, Order, OrderItem, Payment, Review, Warranty, Voucher, Notification...
- Xác định thuộc tính, phương thức, và mối quan hệ giữa các lớp (association, aggregation, composition, inheritance nếu có — ví dụ User có thể phân biệt Customer, Staff, Admin qua trường "role")
- Ghi chú: với MongoDB (NoSQL), class diagram nên được coi là mô hình khái niệm (conceptual model), sau đó ánh xạ linh hoạt sang Mongoose Schema (không bắt buộc chuẩn hóa như SQL)

### 2.5. Sequence Diagram
- Vẽ sequence diagram cho các luồng tương tác quan trọng giữa Client (React) – API (Express) – Database (MongoDB):
  - Đăng ký/đăng nhập (kèm luồng xác thực JWT)
  - Thêm sản phẩm vào giỏ hàng và đặt hàng
  - Xử lý thanh toán qua cổng thanh toán
  - Gửi và xử lý yêu cầu bảo hành
  - (Nếu triển khai real-time) luồng cập nhật trạng thái đơn hàng qua Socket.io

### 2.6. Thiết kế cơ sở dữ liệu (Database Design)
- Thiết kế các collection MongoDB chính: `users`, `products`, `categories`, `carts`, `orders`, `reviews`, `warranties`, `vouchers`, `notifications`...
- Với mỗi collection: xác định field, kiểu dữ liệu, ràng buộc (required, unique, enum...), quan hệ tham chiếu (ObjectId reference) hoặc nhúng (embedded document) tùy ngữ cảnh
- Vẽ sơ đồ ERD dạng mô tả quan hệ giữa các collection (dù NoSQL không bắt buộc, vẫn nên có để hội đồng dễ hình dung)
- Chuẩn bị dữ liệu mẫu (seed data) phục vụ phát triển và demo

### 2.7. Thiết kế kiến trúc hệ thống
- Vẽ sơ đồ kiến trúc tổng thể: Client (React) ⇄ REST API/Socket.io (Node.js + Express) ⇄ MongoDB, kèm các dịch vụ ngoài (Cloudinary, cổng thanh toán, email/SMS)
- Thiết kế cấu trúc thư mục dự án (folder structure) cho cả front-end và back-end

**Kết quả bàn giao**
- Tài liệu đặc tả yêu cầu (SRS)
- Bộ sơ đồ UML: Use-case diagram + đặc tả, Activity diagram, Class diagram, Sequence diagram
- Thiết kế cơ sở dữ liệu (ERD + mô tả schema chi tiết)
- Sơ đồ kiến trúc hệ thống

**Trạng thái:** ⏳ Chưa thực hiện — đề xuất bước tiếp theo

---

## BƯỚC 3: Xây dựng Backend

**Mục tiêu:** Xây dựng RESTful API hoàn chỉnh, xử lý toàn bộ nghiệp vụ, sẵn sàng để Frontend gọi và hiển thị dữ liệu.

**Công việc cụ thể**

### 3.1. Khởi tạo dự án & cấu hình nền tảng
- Khởi tạo Node.js project, cài đặt Express, Mongoose, dotenv, cors...
- Kết nối MongoDB (local hoặc MongoDB Atlas), cấu hình biến môi trường (.env)
- Thiết lập cấu trúc thư mục theo layer: `routes/`, `controllers/`, `services/`, `models/`, `middlewares/`, `utils/`

### 3.2. Xây dựng các Model (Mongoose Schema)
- Định nghĩa schema cho từng collection đã thiết kế ở Bước 2 (User, Product, Category, Cart, Order, Review, Warranty, Voucher...)
- Thiết lập validate, index cần thiết (VD: index cho tìm kiếm sản phẩm, unique cho email)

### 3.3. Xây dựng chức năng xác thực & phân quyền
- API đăng ký, đăng nhập, đăng xuất, quên/đổi mật khẩu
- Middleware xác thực JWT, middleware phân quyền theo vai trò (Customer/Staff/Admin)
- Mã hóa mật khẩu bằng bcrypt

### 3.4. Xây dựng API nghiệp vụ theo từng module (ưu tiên theo MVP → Nên có → Mở rộng đã xác định ở Bước 1)
- Module sản phẩm & danh mục: CRUD, tìm kiếm, lọc, phân trang
- Module giỏ hàng: thêm/sửa/xóa sản phẩm, tính tổng tiền
- Module đơn hàng: tạo đơn, cập nhật trạng thái, hủy đơn, lịch sử đơn hàng
- Module thanh toán: tích hợp cổng thanh toán sandbox (VNPay/Momo)
- Module đánh giá/bình luận sản phẩm
- Module bảo hành: gửi yêu cầu, tra cứu, cập nhật trạng thái xử lý
- Module khuyến mãi/voucher
- Module thống kê/dashboard cho admin (dùng MongoDB Aggregation)
- (Mở rộng) Module real-time bằng Socket.io: theo dõi đơn hàng, thông báo, chat

### 3.5. Xử lý file & dịch vụ bên ngoài
- Tích hợp Multer + Cloudinary/AWS S3 để upload ảnh sản phẩm/đánh giá
- Tích hợp Nodemailer/SMS API để gửi OTP, email xác nhận đơn hàng

### 3.6. Kiểm tra & tài liệu hóa API
- Viết tài liệu API (Swagger/Postman Collection) song song với quá trình phát triển
- Test thủ công từng API bằng Postman trước khi bàn giao cho Frontend

**Kết quả bàn giao**
- Mã nguồn Backend hoàn chỉnh (Node.js + Express + MongoDB)
- Tài liệu API (Swagger hoặc Postman Collection)
- Dữ liệu mẫu (seed script) để demo

**Trạng thái:** ⏳ Chưa thực hiện

---

## BƯỚC 4: Xây dựng UI (Frontend)

**Mục tiêu:** Xây dựng giao diện người dùng hoàn chỉnh (khách hàng + quản trị), kết nối với Backend đã xây dựng ở Bước 3.

**Công việc cụ thể**

### 4.1. Khởi tạo dự án & thiết lập nền tảng
- Khởi tạo React project (Vite/CRA), cài đặt React Router, Axios, thư viện quản lý state (Redux Toolkit/Context API)
- Thiết lập cấu trúc thư mục: `components/`, `pages/`, `hooks/`, `services/` (gọi API), `store/` (state), `utils/`
- Thiết lập theme/style chung (Tailwind CSS/Ant Design/Material UI...)

### 4.2. Xây dựng giao diện phía Khách hàng
- Trang chủ: banner, danh mục nổi bật, sản phẩm bán chạy
- Trang danh mục/danh sách sản phẩm: bộ lọc, sắp xếp, phân trang
- Trang chi tiết sản phẩm: thư viện ảnh, thông số, đánh giá, sản phẩm liên quan
- Trang so sánh sản phẩm
- Giỏ hàng & quy trình thanh toán (checkout flow nhiều bước)
- Trang tài khoản: thông tin cá nhân, lịch sử đơn hàng, theo dõi đơn hàng, bảo hành, wishlist
- Trang đăng ký/đăng nhập, quên mật khẩu
- (Mở rộng) Giao diện thông báo real-time, chat với CSKH

### 4.3. Xây dựng giao diện phía Quản trị (Admin Dashboard)
- Trang đăng nhập quản trị (route riêng, bảo vệ bằng middleware phân quyền)
- Quản lý sản phẩm/danh mục (bảng dữ liệu, form thêm/sửa, upload ảnh)
- Quản lý đơn hàng (danh sách, lọc theo trạng thái, cập nhật trạng thái)
- Quản lý khách hàng
- Quản lý khuyến mãi/voucher
- Quản lý bảo hành
- Dashboard thống kê: biểu đồ doanh thu, sản phẩm bán chạy (dùng Recharts/Chart.js)

### 4.4. Kết nối Frontend – Backend
- Xây dựng lớp service gọi API (Axios instance, interceptor xử lý token/refresh token)
- Xử lý trạng thái loading/error/empty cho từng màn hình
- Xử lý lưu trữ token an toàn (httpOnly cookie cho refresh token, tránh localStorage cho access token nếu có thể)

### 4.5. Tối ưu giao diện & trải nghiệm người dùng
- Responsive cho desktop/tablet/di động
- Tối ưu hiệu năng: lazy load ảnh, code-splitting, debounce cho ô tìm kiếm
- Kiểm tra khả năng truy cập cơ bản (accessibility)

**Kết quả bàn giao**
- Mã nguồn Frontend hoàn chỉnh (React), đã tích hợp API thực tế
- Giao diện responsive, hoạt động đầy đủ các luồng nghiệp vụ chính

**Trạng thái:** ⏳ Chưa thực hiện

---

## BƯỚC 5: Testing (Kiểm thử)

**Mục tiêu:** Đảm bảo hệ thống hoạt động đúng, ổn định, phát hiện và sửa lỗi trước khi viết báo cáo/bảo vệ.

**Công việc cụ thể**

### 5.1. Lập kế hoạch kiểm thử
- Xác định phạm vi kiểm thử: chức năng nào cần test kỹ (luồng thanh toán, đặt hàng, xác thực), mức độ ưu tiên
- Lập bảng test case: mã test case, mô tả, bước thực hiện, dữ liệu đầu vào, kết quả mong đợi, kết quả thực tế, trạng thái (Pass/Fail)

### 5.2. Kiểm thử đơn vị (Unit Testing) — nếu đủ thời gian
- Viết unit test cho các hàm/service quan trọng ở Backend (tính tổng giỏ hàng, tính giá sau giảm, validate dữ liệu) bằng Jest
- Viết test cho một số component quan trọng ở Frontend (React Testing Library)

### 5.3. Kiểm thử tích hợp (Integration Testing)
- Test các API endpoint bằng Jest + Supertest hoặc Postman (kèm bộ test tự động hóa)
- Kiểm tra luồng end-to-end: đăng ký → đăng nhập → thêm giỏ hàng → đặt hàng → thanh toán → xem lịch sử đơn hàng

### 5.4. Kiểm thử chức năng (Functional Testing) — thủ công
- Test từng use-case đã đặc tả ở Bước 2: luồng chính và luồng thay thế/ngoại lệ (VD: nhập sai OTP, hết hàng khi đặt, mã giảm giá hết hạn...)
- Test trên nhiều vai trò: Khách hàng, Nhân viên, Quản trị viên

### 5.5. Kiểm thử giao diện & khả năng sử dụng (UI/UX Testing)
- Test responsive trên nhiều kích thước màn hình/thiết bị
- Test trên nhiều trình duyệt phổ biến (Chrome, Edge, Firefox, Safari)

### 5.6. Kiểm thử hiệu năng & bảo mật (ở mức cơ bản phù hợp đồ án)
- Đo thời gian phản hồi API với công cụ đơn giản (Postman, Apache Bench)
- Test cơ bản chống lỗi bảo mật phổ biến: SQL/NoSQL Injection, XSS, truy cập trái phép route admin khi chưa đăng nhập/không đủ quyền

### 5.7. Tổng hợp & sửa lỗi
- Tổng hợp danh sách lỗi phát hiện được (bug list), phân loại mức độ nghiêm trọng
- Sửa lỗi, kiểm thử lại (regression test) cho các lỗi đã sửa

**Kết quả bàn giao**
- Bảng test case và kết quả kiểm thử
- Danh sách lỗi đã phát hiện và đã sửa (bug tracking)
- (Nếu có) Báo cáo kết quả unit test/integration test tự động

**Trạng thái:** ⏳ Chưa thực hiện

---

## BƯỚC 6: Viết báo cáo

**Mục tiêu:** Tổng hợp toàn bộ quá trình thực hiện thành quyển báo cáo đồ án hoàn chỉnh theo đúng quy định của khoa/trường, kèm slide bảo vệ.

**Công việc cụ thể**

### 6.1. Xác định cấu trúc báo cáo (theo mẫu của trường, tham khảo cấu trúc phổ biến)
- Trang bìa, lời cảm ơn, mục lục, danh mục hình ảnh/bảng biểu, danh mục từ viết tắt
- **Chương 1 – Mở đầu**: lý do chọn đề tài, mục tiêu, phạm vi, phương pháp thực hiện, bố cục báo cáo (từ tài liệu Bước 1 đã có)
- **Chương 2 – Cơ sở lý thuyết**: giới thiệu MERN Stack, các công nghệ/thư viện sử dụng, khảo sát hiện trạng và các hệ thống liên quan (từ tài liệu khảo sát đã có)
- **Chương 3 – Phân tích và thiết kế hệ thống**: yêu cầu chức năng/phi chức năng, use-case, activity, class diagram, sequence diagram, thiết kế CSDL, kiến trúc hệ thống (từ Bước 2)
- **Chương 4 – Xây dựng hệ thống (Cài đặt)**: mô tả công nghệ triển khai, các chức năng đã cài đặt, hình ảnh giao diện minh họa (từ Bước 3-4)
- **Chương 5 – Kiểm thử và đánh giá**: kế hoạch kiểm thử, kết quả kiểm thử, đánh giá ưu/nhược điểm hệ thống đã xây dựng (từ Bước 5)
- **Chương 6 – Kết luận và hướng phát triển**: kết quả đạt được, hạn chế, hướng phát triển trong tương lai
- Tài liệu tham khảo, phụ lục (nếu có)

### 6.2. Biên soạn nội dung từng chương
- Tổng hợp, biên tập lại các tài liệu đã có ở Bước 1, 2 vào Chương 1-3
- Viết mô tả cài đặt chi tiết ở Chương 4 kèm ảnh chụp màn hình thực tế của hệ thống
- Viết Chương 5 dựa trên bảng test case và kết quả kiểm thử ở Bước 5
- Viết kết luận trung thực về kết quả đạt được và hạn chế còn tồn tại, đề xuất hướng phát triển (khớp với các mục "Mở rộng" chưa kịp làm ở Bước 1)

### 6.3. Chuẩn bị tài liệu bảo vệ
- Soạn slide thuyết trình (súc tích, tập trung vào: vấn đề – giải pháp – công nghệ – demo – kết quả)
- Chuẩn bị kịch bản demo trực tiếp hệ thống (chọn luồng nghiệp vụ tiêu biểu, đặc biệt các điểm nhấn kỹ thuật MERN như real-time, dashboard...)
- Chuẩn bị video demo dự phòng (phòng trường hợp lỗi kỹ thuật khi demo trực tiếp)
- Dự trù các câu hỏi phản biện thường gặp và chuẩn bị câu trả lời (tại sao chọn MongoDB, xử lý bảo mật ra sao, hướng mở rộng...)

### 6.4. Rà soát & hoàn thiện
- Kiểm tra chính tả, định dạng theo đúng quy định trình bày của trường
- Rà soát tính nhất quán giữa các chương (số liệu, sơ đồ, thuật ngữ)
- In ấn, đóng quyển theo yêu cầu, nộp đúng hạn

**Kết quả bàn giao**
- Quyển báo cáo đồ án tốt nghiệp hoàn chỉnh (file Word/PDF)
- Slide thuyết trình bảo vệ
- Video demo hệ thống (dự phòng)

**Trạng thái:** ⏳ Chưa thực hiện

---

## Ghi chú quản lý tiến độ

- Sau khi hoàn thành mỗi bước, nên **báo cáo tiến độ với giảng viên hướng dẫn** trước khi chuyển sang bước tiếp theo, tránh làm sai định hướng phải sửa lại nhiều
- Bước 3 và Bước 4 có thể chạy **song song** nếu backend đã có tài liệu API rõ ràng (Frontend dùng dữ liệu giả/mock trong lúc chờ API thật)
- Nên dành **buffer thời gian** (khoảng 1 tuần) trước hạn nộp cuối cùng để dự phòng rủi ro phát sinh (lỗi khó sửa, yêu cầu chỉnh sửa từ giảng viên...)
- Sử dụng công cụ quản lý công việc (Trello/Notion/GitHub Projects) để theo dõi tiến độ từng module theo các bước trên
