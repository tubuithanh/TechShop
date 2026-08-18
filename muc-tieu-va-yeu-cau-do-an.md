# MỤC TIÊU VÀ YÊU CẦU ĐỒ ÁN TỐT NGHIỆP

## Đề tài: Xây dựng website thương mại điện tử bán lẻ thiết bị công nghệ theo mô hình thegioididong.com
### Công nghệ triển khai: MERN Stack (MongoDB – Express.js – React.js – Node.js)

---

## 1. Lý do chọn đề tài

- Thương mại điện tử tại Việt Nam đang tăng trưởng mạnh, đặc biệt trong lĩnh vực bán lẻ thiết bị công nghệ (điện thoại, laptop, phụ kiện...)
- thegioididong.com là một trong những website TMĐT B2C tiêu biểu nhất Việt Nam, có mô hình kinh doanh và chức năng rõ ràng, phù hợp làm đối tượng nghiên cứu/mô phỏng cho đồ án
- MERN Stack là bộ công nghệ JavaScript full-stack phổ biến, được nhiều doanh nghiệp sử dụng, phù hợp để sinh viên thực hành xây dựng ứng dụng web hiện đại (SPA, RESTful API, NoSQL, real-time)
- Đề tài giúp vận dụng tổng hợp kiến thức đã học: phân tích thiết kế hệ thống, lập trình front-end/back-end, cơ sở dữ liệu, bảo mật, triển khai hệ thống

---

## 2. Mục tiêu đồ án

### 2.1. Mục tiêu tổng quát
Xây dựng một hệ thống website thương mại điện tử hoàn chỉnh mô phỏng theo mô hình kinh doanh và các chức năng cốt lõi của thegioididong.com, ứng dụng công nghệ MERN Stack, đảm bảo đầy đủ luồng nghiệp vụ từ tìm kiếm sản phẩm, đặt hàng, thanh toán, đến quản lý vận hành phía quản trị.

### 2.2. Mục tiêu cụ thể

**Về mặt nghiệp vụ (chức năng)**
1. Xây dựng hệ thống cho phép khách hàng tìm kiếm, xem, so sánh và mua sắm sản phẩm công nghệ trực tuyến một cách thuận tiện
2. Xây dựng quy trình đặt hàng – thanh toán – giao hàng – theo dõi đơn hàng khép kín, minh bạch
3. Xây dựng chức năng bảo hành – hậu mãi trực tuyến, giúp khách hàng tra cứu và gửi yêu cầu bảo hành không cần đến trực tiếp cửa hàng
4. Xây dựng hệ thống quản trị (admin) giúp doanh nghiệp quản lý sản phẩm, đơn hàng, khách hàng, khuyến mãi và theo dõi hiệu quả kinh doanh qua dashboard thống kê

**Về mặt kỹ thuật**
5. Áp dụng kiến trúc RESTful API rõ ràng, tách biệt front-end (React) và back-end (Node.js/Express), giúp hệ thống dễ mở rộng, bảo trì
6. Thiết kế cơ sở dữ liệu NoSQL (MongoDB) phù hợp với đặc thù dữ liệu sản phẩm đa dạng thuộc tính
7. Áp dụng cơ chế xác thực – phân quyền hiện đại (JWT) đảm bảo an toàn cho hệ thống multi-role (khách hàng, nhân viên, quản trị viên)
8. Khai thác tối thiểu một tính năng thời gian thực (real-time) bằng Socket.io để thể hiện thế mạnh của Node.js
9. Tối ưu hiệu năng hệ thống (phân trang hiệu quả, xử lý ảnh, cache dữ liệu) ở mức độ phù hợp với phạm vi đồ án

**Về mặt nghiên cứu/phân tích**
10. Khảo sát, phân tích ưu nhược điểm của các website thương mại điện tử cùng lĩnh vực để rút ra định hướng thiết kế phù hợp, có cải tiến hơn (không sao chép nguyên bản)
11. Xây dựng đầy đủ tài liệu phân tích – thiết kế hệ thống (yêu cầu, use-case, ERD, sơ đồ kiến trúc) theo quy trình phát triển phần mềm chuẩn

---

## 3. Đối tượng và phạm vi nghiên cứu

**Đối tượng nghiên cứu**
- Mô hình kinh doanh và chức năng của website thegioididong.com và các website TMĐT bán lẻ công nghệ tương tự (FPT Shop, CellphoneS)
- Công nghệ MERN Stack và các thư viện/dịch vụ liên quan (JWT, Socket.io, Cloudinary, Redis...)

**Phạm vi nghiên cứu**
- Phạm vi nghiệp vụ: tập trung vào ngành hàng thiết bị công nghệ (điện thoại, laptop, phụ kiện) — không mở rộng toàn bộ ngành hàng như bản gốc (gia dụng, điện máy lớn...) để đảm bảo tính khả thi
- Phạm vi người dùng: 3 vai trò — Khách hàng (Customer), Nhân viên (Staff), Quản trị viên (Admin)
- Phạm vi kỹ thuật: xây dựng và triển khai trên môi trường demo (không xử lý thanh toán thật, dùng sandbox/test mode của cổng thanh toán)
- Không bao gồm: hệ thống ERP kết nối kho vật lý thực tế, hệ thống thanh toán thật, mở rộng đa chi nhánh quy mô lớn

---

## 4. Yêu cầu đồ án

### 4.1. Yêu cầu chức năng (Functional Requirements)

#### a) Nhóm chức năng dành cho Khách hàng
| Mã YC | Yêu cầu | Mức độ ưu tiên |
|---|---|---|
| KH-01 | Đăng ký, đăng nhập, đăng xuất, quên/đổi mật khẩu | Bắt buộc |
| KH-02 | Xem danh sách sản phẩm theo danh mục, tìm kiếm, lọc, sắp xếp | Bắt buộc |
| KH-03 | Xem chi tiết sản phẩm (ảnh, thông số, giá, đánh giá) | Bắt buộc |
| KH-04 | So sánh sản phẩm | Nên có |
| KH-05 | Thêm/sửa/xóa sản phẩm trong giỏ hàng | Bắt buộc |
| KH-06 | Đặt hàng, chọn hình thức nhận hàng và thanh toán | Bắt buộc |
| KH-07 | Theo dõi trạng thái đơn hàng | Bắt buộc |
| KH-08 | Hủy đơn hàng / yêu cầu đổi trả | Nên có |
| KH-09 | Đánh giá, bình luận sản phẩm | Bắt buộc |
| KH-10 | Tra cứu và gửi yêu cầu bảo hành trực tuyến | Nên có |
| KH-11 | Quản lý thông tin tài khoản, sổ địa chỉ, wishlist | Nên có |
| KH-12 | Áp dụng mã giảm giá/voucher khi thanh toán | Nên có |
| KH-13 | Nhận thông báo về đơn hàng/khuyến mãi | Mở rộng |
| KH-14 | Theo dõi đơn hàng thời gian thực, chat với CSKH | Mở rộng |

#### b) Nhóm chức năng dành cho Quản trị viên/Nhân viên
| Mã YC | Yêu cầu | Mức độ ưu tiên |
|---|---|---|
| QT-01 | Đăng nhập, phân quyền theo vai trò | Bắt buộc |
| QT-02 | Quản lý danh mục, sản phẩm (CRUD) | Bắt buộc |
| QT-03 | Quản lý đơn hàng (xác nhận, cập nhật trạng thái, hủy) | Bắt buộc |
| QT-04 | Quản lý khách hàng | Bắt buộc |
| QT-05 | Quản lý khuyến mãi, mã giảm giá | Nên có |
| QT-06 | Quản lý bảo hành (tiếp nhận, xử lý, cập nhật trạng thái) | Nên có |
| QT-07 | Quản lý đánh giá/bình luận (duyệt, ẩn) | Nên có |
| QT-08 | Thống kê, báo cáo doanh thu (dashboard) | Bắt buộc |
| QT-09 | Quản lý nội dung (banner, bài viết) | Mở rộng |
| QT-10 | Nhật ký thao tác quản trị (audit log) | Mở rộng |

*(Danh sách chi tiết đầy đủ tham khảo tài liệu "Khảo sát hiện trạng – Mục 1 và Mục 4" đã thực hiện ở Bước 1.)*

### 4.2. Yêu cầu phi chức năng (Non-functional Requirements)

| Nhóm | Yêu cầu |
|---|---|
| Hiệu năng | Thời gian phản hồi trang chủ/danh mục dưới 2-3 giây trong điều kiện dữ liệu demo; tối ưu ảnh, phân trang hiệu quả |
| Bảo mật | Mã hóa mật khẩu, xác thực JWT, chống các lỗ hổng phổ biến (SQL/NoSQL Injection, XSS, CSRF), phân quyền rõ ràng |
| Khả năng sử dụng | Giao diện responsive (desktop/tablet/di động), thao tác trực quan, tối thiểu số bước để hoàn tất đơn hàng |
| Độ tin cậy | Xử lý lỗi rõ ràng, không mất dữ liệu khi thao tác đồng thời, có cơ chế thử lại khi gọi API bên thứ ba thất bại |
| Khả năng bảo trì | Code tuân thủ coding convention, tách lớp rõ ràng (routes/controllers/services/models), có tài liệu API |
| Khả năng mở rộng | Thiết kế module hóa, dễ bổ sung ngành hàng/tính năng mới mà không phải sửa đổi lớn kiến trúc hiện có |
| Khả năng kiểm thử | Có test case cho các luồng nghiệp vụ chính; khuyến khích viết unit test cho module quan trọng (giỏ hàng, thanh toán) |
| Tương thích | Chạy tốt trên các trình duyệt phổ biến (Chrome, Edge, Safari, Firefox phiên bản gần đây) |
| Pháp lý | Có trang chính sách bảo mật, điều khoản sử dụng; tuân thủ nguyên tắc bảo vệ dữ liệu cá nhân cơ bản |

### 4.3. Yêu cầu về công nghệ

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | ReactJS (Hooks, Router, Redux Toolkit/Context API) | SPA cho khách hàng và trang quản trị |
| Backend | Node.js + Express.js | RESTful API, kiến trúc theo layer |
| Cơ sở dữ liệu | MongoDB + Mongoose | NoSQL, thiết kế schema linh hoạt |
| Xác thực | JWT (JSON Web Token) | Access token, khuyến khích có refresh token |
| Realtime (nếu triển khai) | Socket.io | Theo dõi đơn hàng/thông báo/chat |
| Lưu trữ file | Cloudinary hoặc AWS S3 + Multer | Ảnh sản phẩm, ảnh đánh giá |
| Thanh toán | Cổng thanh toán sandbox (VNPay/Momo/Stripe test mode) | Không xử lý giao dịch thật |
| Triển khai | Vercel/Netlify (FE), Render/Railway (BE), MongoDB Atlas (DB) | Môi trường demo cho báo cáo |

### 4.4. Yêu cầu về sản phẩm bàn giao (Deliverables)

1. Mã nguồn đầy đủ (front-end, back-end), có hướng dẫn cài đặt/chạy thử
2. Tài liệu phân tích thiết kế hệ thống: đặc tả yêu cầu, use-case diagram, ERD, sơ đồ kiến trúc
3. Cơ sở dữ liệu mẫu (seed data) đủ để demo các chức năng
4. Báo cáo đồ án hoàn chỉnh theo mẫu của khoa/trường
5. Bản demo/video minh họa các luồng nghiệp vụ chính
6. Slide thuyết trình bảo vệ đồ án

---

## 5. Đối tượng thụ hưởng / Ý nghĩa thực tiễn

- **Khách hàng**: có kênh mua sắm thiết bị công nghệ trực tuyến tiện lợi, minh bạch thông tin, dễ dàng tra cứu bảo hành
- **Doanh nghiệp (giả định)**: có công cụ quản lý sản phẩm, đơn hàng, khách hàng tập trung, hỗ trợ ra quyết định kinh doanh qua số liệu thống kê
- **Bản thân sinh viên**: củng cố và vận dụng kiến thức phân tích thiết kế hệ thống, lập trình full-stack với MERN, làm nền tảng cho công việc thực tế sau khi tốt nghiệp

---

## 6. Kế hoạch thực hiện (dự kiến)

| Giai đoạn | Nội dung công việc | Thời gian dự kiến |
|---|---|---|
| 1 | Khảo sát hiện trạng, phân tích yêu cầu, thiết kế hệ thống (use-case, ERD) | Tuần 1-2 |
| 2 | Xây dựng chức năng lõi (MVP): sản phẩm, giỏ hàng, đặt hàng, thanh toán cơ bản | Tuần 3-5 |
| 3 | Xây dựng chức năng nâng cao: bảo hành, bảo mật, so sánh sản phẩm, dashboard | Tuần 6-8 |
| 4 | Xây dựng chức năng mở rộng: real-time, chatbot/gợi ý, tối ưu hiệu năng | Tuần 9-10 |
| 5 | Kiểm thử toàn hệ thống, sửa lỗi, hoàn thiện tài liệu, chuẩn bị báo cáo | Tuần 11-12 |

*(Mốc thời gian có thể điều chỉnh theo thời lượng thực tế của đồ án và tiến độ được giảng viên hướng dẫn phê duyệt.)*
