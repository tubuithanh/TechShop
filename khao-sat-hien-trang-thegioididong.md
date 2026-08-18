# BƯỚC 1: KHẢO SÁT HIỆN TRẠNG
## Đề tài: Xây dựng website thương mại điện tử theo mô hình thegioididong.com (MERN Stack)

### Mục lục
1. [Phân tích chức năng của thegioididong.com (TGDD)](#1-phân-tích-chức-năng-của-thegioididongcom-tgdd)
2. [Khảo sát 3 website liên quan (FPT Shop, CellphoneS)](#2-khảo-sát-3-website-liên-quan-đối-thủ-cạnh-tranh-trực-tiếp)
3. [Đề xuất định hướng cho đồ án](#3-đề-xuất-định-hướng-cho-đồ-án-rút-ra-từ-khảo-sát)
4. [Đề xuất phạm vi chức năng (MVP – Nên có – Mở rộng)](#4-đề-xuất-phạm-vi-chức-năng-cho-đồ-án-phân-loại-mvp--nên-có--mở-rộng)
5. [Yêu cầu phi chức năng](#5-yêu-cầu-phi-chức-năng-non-functional-requirements--bắt-buộc-phải-có-để-đạt-điểm-cao)
6. [Kiến trúc kỹ thuật & điểm nhấn MERN Stack](#6-đề-xuất-kiến-trúc-kỹ-thuật--chức-năng-nổi-bật-khi-dùng-mern-stack)
7. [Tổng kết: tiêu chí đánh giá & chiến lược bảo vệ đồ án](#7-tổng-kết-tiêu-chí-đánh-giá--chiến-lược-bảo-vệ-đồ-án-để-nhắm-điểm-1010)

### Giới thiệu

Tài liệu này là kết quả **Bước 1 – Khảo sát hiện trạng** của đồ án tốt nghiệp "Xây dựng website thương mại điện tử theo mô hình thegioididong.com", triển khai bằng công nghệ **MERN Stack** (MongoDB – Express.js – React.js – Node.js). Nội dung gồm:

- Phân tích chi tiết toàn bộ chức năng của thegioididong.com (cả phía khách hàng và quản trị)
- Khảo sát, so sánh ưu/nhược điểm với 2 website cùng lĩnh vực (FPT Shop, CellphoneS)
- Đề xuất phạm vi chức năng khả thi cho đồ án, phân loại theo mức độ ưu tiên
- Yêu cầu phi chức năng (hiệu năng, bảo mật, khả năng mở rộng...)
- Định hướng kiến trúc kỹ thuật tận dụng đúng thế mạnh của MERN Stack
- Tiêu chí tự đánh giá và chiến lược trình bày khi bảo vệ đồ án

---

## 1. Phân tích chức năng của thegioididong.com (TGDD)

### 1.1. Nhóm chức năng dành cho Khách hàng (Front-end) — chi tiết theo module

#### 1.1.1. Trang chủ
| Chức năng con | Mô tả chi tiết |
|---|---|
| Banner/slider quảng cáo | Nhiều banner luân phiên tự động, mỗi banner link tới trang khuyến mãi/sản phẩm cụ thể |
| Menu danh mục ngành hàng | Menu ngang cố định (sticky header) + mega-menu sổ xuống khi hover |
| Khối "Deal hot theo khung giờ" | Đồng hồ đếm ngược, giới hạn số lượng, tạo cảm giác khan hiếm |
| Khối sản phẩm theo ngành hàng | Mỗi ngành hàng có khối riêng gồm 8-10 sản phẩm tiêu biểu + nút "Xem tất cả" |
| Khối thương hiệu nổi bật | Logo các hãng lớn, click để lọc theo hãng |
| Banner chương trình | Thu cũ đổi mới, trả góp 0%, ưu đãi sinh viên... dẫn tới landing page riêng |
| Popup ưu đãi cho thành viên mới | Thu thập email/SĐT đổi voucher khi truy cập lần đầu |
| Chat widget nổi | Icon nổi góc màn hình (Messenger/Zalo/Hotline), hiển thị trên mọi trang |

#### 1.1.2. Danh mục & danh sách sản phẩm
| Chức năng con | Mô tả chi tiết |
|---|---|
| Phân loại đa cấp | Ngành hàng → nhóm sản phẩm → hãng → dòng sản phẩm |
| Bộ lọc nhiều tiêu chí đồng thời | Hãng, khoảng giá (thanh trượt), RAM/ROM, kích thước màn hình, nhu cầu sử dụng, tình trạng còn hàng |
| Sắp xếp | Theo giá, bán chạy, mới nhất, khuyến mãi, đánh giá cao nhất |
| Chuyển đổi hiển thị | Grid view / list view |
| Phân trang / tải thêm | Phân trang số hoặc nút "Xem thêm" (infinite scroll) |
| Nhãn trạng thái sản phẩm | "Hàng mới", "Trả góp 0%", "Giảm sốc", "Sắp hết hàng" |
| So sánh nhanh trên danh sách | Checkbox chọn sản phẩm ngay tại danh sách để đưa vào so sánh |
| Đăng ký thông báo còn hàng | Nhận thông báo khi sản phẩm hết hàng có trở lại |

#### 1.1.3. Tìm kiếm
| Chức năng con | Mô tả chi tiết |
|---|---|
| Gợi ý tức thời (autocomplete) | Gợi ý sản phẩm/danh mục/bài viết ngay khi gõ |
| Tìm kiếm mờ (fuzzy search) | Chấp nhận gõ sai chính tả, không dấu |
| Tìm kiếm nâng cao | Kết hợp nhiều điều kiện: hãng + giá + cấu hình |
| Lịch sử & từ khóa phổ biến | Gợi ý dựa trên lịch sử cá nhân và xu hướng chung |
| Trang kết quả tìm kiếm | Cho lọc/sắp xếp lại như trang danh mục |

#### 1.1.4. Trang chi tiết sản phẩm
| Chức năng con | Mô tả chi tiết |
|---|---|
| Thư viện ảnh/video | Nhiều góc độ, zoom ảnh, video giới thiệu/trên tay |
| Chọn biến thể (màu, dung lượng) | Giá và ảnh cập nhật theo lựa chọn |
| Bảng thông số kỹ thuật | Chi tiết CPU/RAM/pin/camera, có thể thu gọn/mở rộng |
| So sánh nhanh | Nút "So sánh" ngay trên trang |
| Khuyến mãi kèm theo | Quà tặng, giảm giá phụ kiện, ưu đãi thanh toán qua ngân hàng |
| Kiểm tra tồn kho theo cửa hàng | Nhập khu vực để xem cửa hàng còn hàng gần nhất |
| Công cụ tính trả góp | Tính số tiền trả góp theo kỳ hạn, đối tác tài chính |
| Đánh giá & xếp hạng sao | Điểm trung bình, lọc theo số sao |
| Hỏi đáp (Q&A) | Khách đặt câu hỏi, được trả lời bởi shop/khách khác |
| Sản phẩm liên quan | Gợi ý cross-sell, up-sell, phụ kiện đi kèm |
| Nút hành động | Mua ngay / thêm vào giỏ / mua trả góp |
| Chia sẻ mạng xã hội | Nút chia sẻ Facebook/Zalo |

#### 1.1.5. So sánh sản phẩm
- Chọn tối đa 3-4 sản phẩm cùng loại để so sánh song song
- Bảng so sánh theo nhóm thông số (thiết kế, cấu hình, camera, pin, kết nối)
- Đánh dấu điểm khác biệt/nổi bật giữa các sản phẩm
- Thêm/xóa sản phẩm ngay trong bảng, thêm vào giỏ hàng trực tiếp

#### 1.1.6. Giỏ hàng & Thanh toán
| Chức năng con | Mô tả chi tiết |
|---|---|
| Thêm/sửa/xóa sản phẩm trong giỏ | Cập nhật số lượng, xóa từng món hoặc toàn bộ |
| Chọn sản phẩm để thanh toán | Tick chọn một phần giỏ hàng để mua trước |
| Áp mã giảm giá/voucher | Kiểm tra hợp lệ theo điều kiện áp dụng |
| Tính phí vận chuyển tự động | Theo địa chỉ và hình thức giao |
| Chọn hình thức nhận hàng | Giao tận nơi / nhận tại cửa hàng (click & collect) |
| Chọn khung giờ giao hàng | Khung giờ mong muốn |
| Đa dạng phương thức thanh toán | COD, chuyển khoản, thẻ nội địa/quốc tế, ví điện tử, trả góp |
| Xuất hóa đơn điện tử (VAT) | Nhập thông tin công ty để xuất hóa đơn |
| Xác nhận đơn qua SMS/email | Gửi tự động sau khi đặt hàng |

#### 1.1.7. Quản lý tài khoản khách hàng
| Chức năng con | Mô tả chi tiết |
|---|---|
| Đăng ký/Đăng nhập | SĐT/email + OTP, hoặc liên kết Google/Facebook |
| Quên/đổi mật khẩu | Qua OTP SMS hoặc email |
| Thông tin cá nhân | Họ tên, SĐT, email, sổ địa chỉ (nhiều địa chỉ) |
| Lịch sử đơn hàng | Danh sách đơn đã mua, trạng thái, chi tiết từng đơn |
| Theo dõi vận đơn | Đang xử lý → đang giao → đã giao → đã hủy, tích hợp mã vận đơn |
| Hủy đơn / yêu cầu đổi trả | Gửi yêu cầu trực tuyến, đính kèm ảnh minh chứng |
| Điểm thưởng / hạng thành viên | Tích điểm theo giá trị đơn, quy đổi voucher |
| Sản phẩm yêu thích (wishlist) | Lưu sản phẩm quan tâm để theo dõi giá |
| Quản lý bảo hành | Danh sách sản phẩm kèm hạn bảo hành, đặt lịch sửa chữa |

#### 1.1.8. Đánh giá, bình luận & cộng đồng
- Viết đánh giá kèm ảnh/video thực tế sau khi nhận hàng
- Bình chọn đánh giá hữu ích (helpful vote)
- Trả lời bình luận giữa khách hàng và shop
- Lọc đánh giá theo số sao, có ảnh/video, đã mua hàng (verified)

#### 1.1.9. Khuyến mãi & chương trình ưu đãi
- Trang tổng hợp mọi chương trình khuyến mãi đang diễn ra
- Mã giảm giá cá nhân hóa theo lịch sử mua hàng
- Thu cũ – đổi mới: định giá máy cũ online, đặt lịch thu máy
- Trả góp 0% lãi suất qua nhiều đối tác tài chính/ngân hàng
- Ưu đãi theo đối tượng (học sinh - sinh viên, khách hàng doanh nghiệp)
- Flash sale theo khung giờ, đếm ngược

#### 1.1.10. Nội dung & Tin tức
- Bài viết tư vấn chọn mua, so sánh, đánh giá chuyên sâu
- Bài viết thủ thuật, hướng dẫn sử dụng
- Tin tức công nghệ cập nhật hằng ngày (hỗ trợ SEO)
- Liên kết nội bộ từ bài viết tới sản phẩm liên quan (tăng chuyển đổi)

#### 1.1.11. Hệ thống cửa hàng & bản đồ
- Tra cứu cửa hàng gần nhất theo GPS/nhập địa chỉ
- Hiển thị giờ mở cửa, số điện thoại, chỉ đường (Google Maps)
- Kiểm tra tồn kho thực tế theo từng cửa hàng cụ thể

#### 1.1.12. Chăm sóc khách hàng & hỗ trợ
- Live chat với nhân viên/chatbot trả lời câu hỏi thường gặp
- Tổng đài hotline theo mục đích (mua hàng, kỹ thuật, khiếu nại)
- Trang FAQ theo chủ đề
- Tra cứu chính sách bảo hành/đổi trả theo loại sản phẩm
- Đặt lịch sửa chữa/bảo hành trực tuyến

#### 1.1.13. Ứng dụng di động (mở rộng)
- Đồng bộ toàn bộ chức năng với web
- Thông báo đẩy (push notification) khuyến mãi, trạng thái đơn hàng
- Quét mã QR để tra cứu nhanh sản phẩm/bảo hành

#### 1.1.14. Bảo hành & Hậu mãi (chi tiết)

Đây là nhóm chức năng quan trọng nhưng thường bị mô tả sơ sài — dưới đây là phân rã chi tiết dành cho khách hàng:

| Chức năng con | Mô tả chi tiết |
|---|---|
| Tra cứu thông tin bảo hành theo IMEI/Số serial/SĐT | Khách nhập IMEI hoặc SĐT đã mua để xem: ngày mua, hạn bảo hành còn lại, trung tâm bảo hành phụ trách, lịch sử bảo hành trước đó (nếu có) |
| Đăng ký bảo hành điện tử (e-Warranty) | Với sản phẩm mua tại cửa hàng, hệ thống tự động kích hoạt bảo hành gắn với tài khoản khách hàng, không cần giữ phiếu giấy |
| Xem chính sách bảo hành theo từng loại sản phẩm/hãng | Mỗi hãng/dòng sản phẩm có điều kiện bảo hành riêng (1 đổi 1 trong 30 ngày, bảo hành 12 tháng, bảo hành mở rộng...) — hiển thị rõ ngay trên trang chính sách hoặc trang sản phẩm |
| Đặt lịch hẹn mang máy đi bảo hành/sửa chữa | Chọn cửa hàng/trung tâm bảo hành, chọn ngày giờ hẹn, mô tả lỗi trước khi đến (giảm thời gian chờ tại quầy) |
| Gửi yêu cầu bảo hành trực tuyến (online claim) | Khách mô tả lỗi, đính kèm ảnh/video, chọn hình thức: mang trực tiếp / gửi qua bưu điện / nhân viên đến thu tại nhà |
| Theo dõi tiến độ sửa chữa (repair tracking) | Trạng thái: tiếp nhận → đang kiểm tra → đang sửa chữa → chờ linh kiện → sửa xong → đã trả máy, có thông báo qua SMS/email/app ở mỗi bước |
| Tra cứu bảng giá sửa chữa ngoài bảo hành | Bảng giá thay thế linh kiện (màn hình, pin, main...) theo từng model, ước tính chi phí trước khi mang máy đến |
| Bảo hành mở rộng (extended warranty) | Mua thêm gói bảo hành kéo dài thời gian hoặc mở rộng phạm vi (rơi vỡ, vào nước), hiển thị và cho phép mua ngay lúc thanh toán sản phẩm hoặc mua bổ sung sau |
| Chính sách 1 đổi 1 | Điều kiện, thời hạn áp dụng đổi máy mới ngay khi phát sinh lỗi phần cứng do nhà sản xuất trong thời gian quy định |
| Lịch sử bảo hành/sửa chữa trong tài khoản | Danh sách tất cả lượt bảo hành đã thực hiện với từng sản phẩm, kèm biên nhận điện tử, chi phí phát sinh (nếu có) |
| Đánh giá dịch vụ bảo hành | Khách chấm điểm/nhận xét trải nghiệm sau khi nhận lại máy, giúp cải thiện chất lượng dịch vụ |
| Thông báo hết hạn bảo hành | Gửi email/SMS/push notification nhắc trước khi hết hạn bảo hành, gợi ý mua gói mở rộng |
| Hỗ trợ bảo hành ủy quyền chính hãng | Với sản phẩm Apple, Samsung..., hiển thị rõ trung tâm bảo hành ủy quyền chính hãng gần nhất, phân biệt với bảo hành từ nhà bán lẻ |
| Quy định sao lưu dữ liệu trước khi bảo hành | Trang hướng dẫn/khuyến cáo khách tự sao lưu dữ liệu, nêu rõ trách nhiệm của cửa hàng với dữ liệu trên máy khi sửa chữa |

**Quy trình bảo hành đề xuất cho đồ án (workflow):**
1. Khách đăng nhập → vào mục "Bảo hành của tôi" → chọn sản phẩm cần bảo hành (hệ thống tự liệt kê từ lịch sử mua hàng)
2. Mô tả lỗi, đính kèm ảnh/video (không bắt buộc) → chọn hình thức xử lý (mang tới cửa hàng/gửi chuyển phát)
3. Hệ thống tạo **phiếu tiếp nhận bảo hành** (mã tra cứu riêng) → gửi xác nhận qua email/SMS
4. Nhân viên kỹ thuật (phía admin) cập nhật trạng thái xử lý theo từng bước
5. Khách tra cứu tiến độ bất kỳ lúc nào bằng mã phiếu hoặc trong tài khoản
6. Khi hoàn tất, hệ thống thông báo và ghi nhận vào lịch sử bảo hành

**Chức năng quản trị (Admin) tương ứng cần bổ sung:**
- Quản lý phiếu tiếp nhận bảo hành: tiếp nhận, phân công kỹ thuật viên, cập nhật trạng thái, ghi chú nội bộ
- Quản lý kho linh kiện thay thế phục vụ sửa chữa
- Cấu hình chính sách bảo hành theo từng danh mục/hãng sản phẩm (thời hạn, điều kiện, chi phí phát sinh)
- Báo cáo thống kê bảo hành: tỷ lệ lỗi theo sản phẩm, thời gian xử lý trung bình, chi phí bảo hành phát sinh



#### 1.1.15. Vận chuyển & Giao hàng (chi tiết)

| Chức năng con | Mô tả chi tiết |
|---|---|
| Tính phí ship tự động theo địa chỉ | Dựa trên khoảng cách, khối lượng/kích thước sản phẩm, khu vực nội/ngoại thành |
| Nhiều hãng vận chuyển tích hợp | Cho phép chọn đơn vị giao hàng (GHN, GHTK, Viettel Post, tự vận hành...) |
| Giao hàng nhanh trong ngày/2h | Áp dụng cho khu vực nội thành, phụ phí giao nhanh |
| Nhận tại cửa hàng (Click & Collect) | Chọn cửa hàng, hẹn giờ đến lấy, được giữ hàng trong khoảng thời gian nhất định |
| Theo dõi vận đơn thời gian thực | Tích hợp API đối tác vận chuyển, hiển thị bản đồ/trạng thái từng chặng |
| Giao hàng thu hộ (COD) | Xác nhận thu tiền mặt khi nhận hàng, có giới hạn giá trị đơn |
| Lắp đặt tại nhà (cho hàng điện máy) | Đặt lịch lắp đặt/hướng dẫn sử dụng cho tủ lạnh, máy giặt, điều hòa... |
| Đổi trả hàng qua vận chuyển | Yêu cầu đơn vị vận chuyển đến lấy hàng hoàn/đổi tận nhà |
| Thông báo trạng thái giao hàng | SMS/email/push tại các mốc: đã lấy hàng, đang giao, giao thành công/thất bại |
| Đánh giá dịch vụ giao hàng | Khách chấm điểm shipper/đơn vị vận chuyển sau khi nhận hàng |

#### 1.1.16. Thanh toán (chi tiết)

| Chức năng con | Mô tả chi tiết |
|---|---|
| Thanh toán khi nhận hàng (COD) | Mặc định phổ biến nhất tại Việt Nam |
| Chuyển khoản ngân hàng | Hiển thị QR code động (VietQR) kèm nội dung chuyển khoản tự sinh mã đơn |
| Cổng thanh toán thẻ nội địa/quốc tế | Tích hợp cổng như VNPay, OnePay, Momo, ZaloPay (qua sandbox/test mode cho đồ án) |
| Ví điện tử | MoMo, ZaloPay, ShopeePay... |
| Trả góp qua thẻ tín dụng | Chọn ngân hàng phát hành thẻ, kỳ hạn (3/6/9/12 tháng), tự tính lãi suất/phí |
| Trả góp qua công ty tài chính | Home Credit, FE Credit... yêu cầu thông tin CMND/CCCD để duyệt hồ sơ |
| Mua trước trả sau (BNPL) | Tích hợp kiểu Kredivo/Fundiin, duyệt nhanh theo hạn mức |
| Xác thực thanh toán OTP/3D Secure | Bảo mật giao dịch thẻ theo chuẩn ngân hàng |
| Quản lý trạng thái giao dịch | Chờ thanh toán, thành công, thất bại, đã hoàn tiền |
| Hoàn tiền tự động/thủ công | Với đơn hủy/trả hàng đã thanh toán online |
| Xuất hóa đơn điện tử (e-invoice) | Tự động hoặc theo yêu cầu, gửi qua email, tra cứu lại bất kỳ lúc nào |

#### 1.1.17. Tiếp thị liên kết & Affiliate (nếu mở rộng phạm vi đồ án)
- Đăng ký làm cộng tác viên/affiliate, nhận link giới thiệu riêng
- Theo dõi hoa hồng theo đơn hàng phát sinh từ link giới thiệu
- Dashboard thống kê lượt click, tỷ lệ chuyển đổi, hoa hồng tích lũy
- Yêu cầu rút tiền hoa hồng

#### 1.1.18. Trung tâm thông báo (Notification Center)
- Danh sách thông báo tập trung trong tài khoản: đơn hàng, khuyến mãi, bảo hành, tin nhắn hỗ trợ
- Phân loại thông báo đã đọc/chưa đọc, đánh dấu tất cả đã đọc
- Cài đặt tùy chọn nhận thông báo (email/SMS/push/tất cả)
- Thông báo đẩy (push notification) trên web (Web Push API) và app

#### 1.1.19. Gamification & Tương tác giữ chân khách hàng
- Vòng quay may mắn nhận voucher (mini-game trúng thưởng)
- Điểm danh nhận xu/điểm thưởng hằng ngày
- Nhiệm vụ đổi quà (mời bạn bè, đánh giá sản phẩm, hoàn thành đơn đầu tiên...)
- Bảng xếp hạng khách hàng thân thiết (nếu phù hợp phạm vi đồ án)

#### 1.1.21. Bảo mật & An toàn tài khoản (chức năng dành cho khách hàng)

Đây là nhóm chức năng người dùng trực tiếp thao tác/nhìn thấy, khác với các yêu cầu phi chức năng kỹ thuật ở mục 5 (mã hóa, chống tấn công...) — nên tách riêng để hội đồng thấy rõ sản phẩm có "tính năng bảo mật" thực sự, không chỉ nói suông:

| Chức năng con | Mô tả chi tiết |
|---|---|
| Đăng ký/Đăng nhập an toàn | Yêu cầu mật khẩu đủ mạnh (độ dài, chữ hoa/thường, số, ký tự đặc biệt), kiểm tra độ mạnh mật khẩu trực quan khi nhập |
| Xác thực OTP qua SMS/Email | Bắt buộc khi đăng ký, đổi mật khẩu, hoặc thực hiện giao dịch quan trọng (đổi SĐT, đổi email liên kết) |
| Xác thực hai yếu tố (2FA/Two-Factor Authentication) | Tùy chọn bật thêm lớp bảo vệ (mã OTP/ứng dụng xác thực) khi đăng nhập từ thiết bị lạ |
| Đăng nhập qua mạng xã hội (OAuth2) | Google/Facebook — giảm rủi ro lộ mật khẩu tự tạo, đồng thời tận dụng bảo mật của bên thứ 3 |
| Quản lý phiên đăng nhập (session) | Xem danh sách thiết bị/phiên đang đăng nhập, đăng xuất từ xa thiết bị lạ |
| Thông báo đăng nhập từ thiết bị mới | Gửi email/SMS cảnh báo khi phát hiện đăng nhập từ vị trí/thiết bị chưa từng dùng |
| Khóa tài khoản tạm thời sau nhiều lần đăng nhập sai | Giới hạn số lần thử (VD: 5 lần), yêu cầu xác minh lại qua OTP hoặc captcha |
| CAPTCHA / reCAPTCHA | Chống bot đăng ký ảo, spam đánh giá, spam đặt hàng |
| Ẩn/che một phần thông tin nhạy cảm | Che số điện thoại, email, số thẻ (chỉ hiện vài ký tự cuối) khi hiển thị trong tài khoản |
| Lịch sử hoạt động tài khoản | Nhật ký các thay đổi quan trọng: đổi mật khẩu, đổi địa chỉ, đổi thông tin thanh toán |
| Xác nhận lại mật khẩu khi thao tác nhạy cảm | Yêu cầu nhập lại mật khẩu/OTP trước khi đổi email, xóa tài khoản, hoặc thanh toán giá trị lớn |
| Chính sách bảo mật & quyền riêng tư công khai | Trang riêng nêu rõ cách thu thập/lưu trữ/sử dụng dữ liệu cá nhân, quyền yêu cầu xóa dữ liệu của khách hàng |
| Đồng ý điều khoản (Consent) khi đăng ký | Checkbox bắt buộc đồng ý điều khoản sử dụng & chính sách bảo mật, có lưu log thời điểm đồng ý |
| Xóa/vô hiệu hóa tài khoản theo yêu cầu | Cho phép khách yêu cầu xóa tài khoản và dữ liệu cá nhân (tuân thủ quyền riêng tư) |

#### 1.1.22. Trợ lý ảo / Chatbot hỗ trợ mua hàng (điểm cộng sáng tạo cho đồ án)
- Chatbot trả lời câu hỏi thường gặp (FAQ) tự động theo kịch bản (rule-based) hoặc AI (tùy năng lực triển khai)
- Gợi ý sản phẩm theo nhu cầu qua hội thoại ("tư vấn điện thoại tầm giá 5 triệu chụp ảnh đẹp")
- Chuyển tiếp sang nhân viên thật khi chatbot không xử lý được
- Lưu lịch sử hội thoại trong tài khoản khách hàng

### 1.2. Nhóm chức năng dành cho Quản trị (Back-end / Admin) – cần có trong đồ án

#### 1.2.0. Bảo mật & Quản trị hệ thống (Admin)

| Chức năng con | Mô tả chi tiết |
|---|---|
| Phân quyền theo vai trò (RBAC) | Admin, quản lý kho, nhân viên bán hàng, nhân viên CSKH... mỗi vai trò chỉ thấy/thao tác đúng phạm vi chức năng được cấp |
| Nhật ký thao tác quản trị (audit log) | Ghi lại ai thao tác gì, thời gian nào, trên dữ liệu nào — phục vụ truy vết khi có sự cố |
| Quản lý phiên đăng nhập quản trị viên | Buộc đăng xuất, giới hạn IP/địa điểm truy cập trang quản trị (đề xuất nâng cao) |
| Cảnh báo hành vi bất thường | Cảnh báo khi có nhiều đơn hàng bất thường từ 1 tài khoản/IP, nhiều lần đăng nhập sai liên tiếp vào trang quản trị |
| Sao lưu & phục hồi dữ liệu | Lên lịch backup định kỳ CSDL, có quy trình khôi phục khi sự cố |
| Quản lý API key / tích hợp bên thứ ba | Quản lý khóa bí mật kết nối cổng thanh toán, đơn vị vận chuyển, không hard-code trong source code |
| Cấu hình chính sách mật khẩu hệ thống | Độ dài tối thiểu, thời hạn bắt buộc đổi mật khẩu định kỳ cho tài khoản quản trị |

#### 1.2.1. Quản lý danh mục & sản phẩm
- Quản lý ngành hàng, danh mục, danh mục con (cây danh mục nhiều cấp)
- Thêm/sửa/xóa sản phẩm: thuộc tính (SKU, biến thể màu/dung lượng), ảnh, mô tả, thông số
- Quản lý giá bán, giá gốc, mức giảm theo thời gian
- Quản lý kho hàng, tồn kho theo từng chi nhánh, cảnh báo sắp hết hàng
- Quản lý nhà cung cấp, nhập hàng

#### 1.2.2. Quản lý đơn hàng
- Danh sách đơn hàng, lọc theo trạng thái (chờ xác nhận, đang xử lý, đang giao, hoàn tất, hủy, hoàn trả)
- Xác nhận đơn, phân công vận chuyển, in phiếu giao hàng/hóa đơn
- Xử lý yêu cầu đổi trả, hoàn tiền
- Xuất báo cáo đơn hàng theo khoảng thời gian

#### 1.2.3. Quản lý khách hàng
- Danh sách khách hàng, lịch sử mua hàng, phân nhóm (VIP, thân thiết)
- Quản lý điểm thưởng, hạng thành viên
- Gửi thông báo/email marketing theo nhóm khách hàng

#### 1.2.4. Quản lý nhân sự & phân quyền
- Tài khoản quản trị/nhân viên phân quyền theo vai trò
- Nhật ký thao tác (audit log) để truy vết thay đổi

#### 1.2.5. Quản lý khuyến mãi & marketing
- Tạo/quản lý mã giảm giá, điều kiện áp dụng, thời gian hiệu lực
- Quản lý flash sale, trả góp, thu cũ đổi mới
- Quản lý banner, popup quảng cáo trang chủ

#### 1.2.6. Quản lý nội dung (CMS)
- Soạn thảo, đăng bài viết tin tức/cẩm nang
- Quản lý trang tĩnh (giới thiệu, chính sách, FAQ)
- Quản lý SEO (meta title, description, URL thân thiện)

#### 1.2.7. Quản lý đánh giá & tương tác khách hàng
- Duyệt/ẩn đánh giá, bình luận vi phạm
- Trả lời câu hỏi khách hàng trên trang sản phẩm

#### 1.2.8. Thống kê & báo cáo (Dashboard)
- Doanh thu theo ngày/tháng/năm, theo ngành hàng, theo chi nhánh
- Sản phẩm bán chạy, sản phẩm tồn kho lâu
- Tỷ lệ chuyển đổi, tỷ lệ hủy đơn/hoàn trả
- Biểu đồ trực quan (line/bar/pie chart)

#### 1.2.9. Cấu hình hệ thống
- Cấu hình phương thức thanh toán, đơn vị vận chuyển
- Cấu hình thuế, hóa đơn điện tử
- Cấu hình chung website (logo, thông tin liên hệ, mạng xã hội)

### 1.3. Đặc điểm mô hình kinh doanh
Đây là **website bán hàng riêng của một doanh nghiệp (B2C)**, không phải sàn thương mại điện tử đa người bán như Shopee/Lazada. Điểm đặc trưng: **mô hình "tư vấn bán hàng"** – hỗ trợ khách hàng ra quyết định qua so sánh, đánh giá, tư vấn, thay vì chỉ là giao dịch mua bán đơn thuần. Đây là gợi ý quan trọng cho định hướng đồ án: nên tập trung vào trải nghiệm tư vấn – so sánh sản phẩm, không chỉ giỏ hàng/thanh toán.

---

## 2. Khảo sát 3 website liên quan (đối thủ cạnh tranh trực tiếp)

*(Cập nhật dựa trên khảo sát thực tế giao diện 3 website tháng 8/2026, kết hợp các bài phân tích/đánh giá đã công bố)*

### 2.1. thegioididong.com (Thế Giới Di Động)

**Ưu điểm**
- Giao diện quen thuộc, phổ biến với người dùng Việt Nam; điều hướng danh mục rõ ràng, đa ngành hàng (điện thoại, laptop, đồng hồ, gia dụng, mẹ & bé qua AVAKids...)
- Chức năng **so sánh sản phẩm** mạnh, là điểm khác biệt cốt lõi giúp khách "tư vấn" thay vì chỉ bán hàng
- Nội dung tư vấn/tin tức (Thế Giới Di Động 24h) phong phú, hỗ trợ SEO và tăng độ tin cậy
- Hệ thống lọc sản phẩm chi tiết theo nhiều tiêu chí (giá, RAM/ROM, nhu cầu sử dụng...)
- Tích hợp tốt online–offline: tra cứu tồn kho theo từng cửa hàng, mạng lưới cửa hàng rộng khắp cả nước (đông đảo nhất trong 3 site)
- Đã thử nghiệm quay lại mảng thương mại điện tử qua nền tảng **MWG Shop** (tích hợp trong app "Quà Tặng VIP"), gom sản phẩm nhiều chuỗi (TGDD, Điện Máy Xanh, TopZone, AVAKids) — cho thấy xu hướng hợp nhất trải nghiệm mua sắm đa chuỗi <cite index="3-1">Thế Giới Di Động vừa mở lại mảng thương mại điện tử với nền tảng MWG Shop, tích hợp trong ứng dụng chăm sóc khách hàng "Quà Tặng VIP", tập hợp sản phẩm từ các chuỗi Thegioididong.com, Điện Máy Xanh, TopZone và AVAKids</cite>

**Nhược điểm**
- Giao diện nhiều nơi bị trùng lặp thông tin (menu chính và menu phụ lặp lại nội dung như PHỤ KIỆN, ĐIỆN THOẠI DI ĐỘNG...) <cite index="5-1">Trong menu bên phải, có nhiều thông tin bị trùng lặp với menu ở trên như PHỤ KIỆN, ĐIỆN THOẠI DI ĐỘNG, DOWNLOAD</cite>
- Trang chứa quá nhiều nội dung (tin tức, khuyến mãi, sản phẩm) trên cùng một trang, gây cảm giác nặng, rối mắt, không tách bạch rõ mục đích sử dụng của người dùng <cite index="5-1">việc đặt quá nhiều thông tin sẽ làm trang web trở nên nặng nề</cite>
- Chức năng tìm kiếm nâng cao tồn tại nhưng khó nhận biết do thiếu hướng dẫn trực quan <cite index="5-1">trong trang kết quả tìm kiếm có phần TÌM KIẾM NÂNG CAO, tuy nhiên người sử dụng sẽ khó nhận biết được chức năng này tồn tại</cite>
- Các phân loại sản phẩm (hàng cao cấp, siêu cấp...) dùng chung một kiểu thiết kế nên chưa tạo được điểm nhấn phân biệt, giảm sức thu hút
- Việc tách mảng TMĐT riêng (MWG Shop) thay vì tích hợp thẳng vào web chính cho thấy kiến trúc hệ thống hiện tại còn phân mảnh giữa các chuỗi

### 2.2. fptshop.com.vn (FPT Shop)

**Ưu điểm**
- Giao diện các khối nội dung được nhóm theo chủ đề rõ ràng ("Trạm không gian", "Trạm tiếp sức tựu trường"...), bớt cảm giác dồn nén hơn TGDD
- **Đa dạng phương thức thanh toán/trả sau** rất tốt: ngoài thẻ quốc tế (Visa/Master/JCB/Amex), có VNPAY, ZaloPay, Kredivo, Home PayLater, Muadee, AlePay, Foxpay, Apple Pay, Samsung Pay, Google Pay — nhiều hơn hẳn 2 site còn lại
- Có hệ sinh thái dịch vụ viễn thông tích hợp ngay trên web: bán SIM FPT, nạp thẻ điện thoại, đóng phí Internet, thanh toán cước trả sau — đây là chức năng **chỉ FPT Shop có** nhờ lợi thế tập đoàn viễn thông
- Tra cứu hóa đơn điện tử, tra cứu bảo hành, tra cứu bảng giá sửa chữa ngay trên web, có trang "Hỗ trợ kỹ thuật trực tuyến" riêng
- Danh sách chính sách/điều khoản rất chi tiết, minh bạch (chính sách giá, chính sách kiểm hàng/khui hộp, quy trình khiếu nại...)

**Nhược điểm**
- Không thấy chức năng **so sánh sản phẩm song song** rõ ràng như TGDD
- Nội dung tư vấn/cẩm nang công nghệ mỏng hơn TGDD (không có mục tin tức tổng hợp tương đương "TGDD 24h")
- Trang chủ có nhiều khối banner/khuyến mãi rời rạc, thiếu một "câu chuyện" điều hướng xuyên suốt như CellphoneS
- Không có chương trình thành viên/loyalty program rõ ràng hiển thị công khai như Smember của CellphoneS

### 2.3. cellphones.com.vn (CellphoneS)

**Ưu điểm**
- Giao diện hiện đại, tốc độ tải nhanh, phân nhóm sản phẩm trực quan theo icon ngay đầu trang
- Có **chương trình thành viên riêng (Smember)** với đăng nhập/đăng ký, tích điểm, ưu đãi riêng — tích hợp sâu hơn 2 site còn lại
- Có kênh **khách hàng doanh nghiệp (B2B/S-Business)** riêng biệt, tách bạch nhu cầu cá nhân và doanh nghiệp — chức năng chưa thấy rõ ở TGDD/FPT Shop
- Đa dạng cổng thanh toán trả sau/trả góp: Kredivo, Fundiin, MoMo, VNPAY, OnePay, Apple Pay
- Tra cứu hóa đơn điện tử, tra cứu bảo hành, và đặc biệt có **VAT Refund** (hoàn thuế GTGT cho khách quốc tế) — chức năng riêng biệt không thấy ở 2 site kia
- Hệ sinh thái nội dung được tách thành các trang con chuyên biệt: Sforum (tin công nghệ), Schannel (giải trí công nghệ giới trẻ) — tách bạch tốt hơn việc nhồi tin tức vào trang bán hàng như TGDD

**Nhược điểm**
- Danh mục ngành hàng tổng thể (đặc biệt đồ gia dụng, điện máy lớn như tủ lạnh/máy giặt) không đa dạng bằng FPT Shop và TGDD
- Số lượng cửa hàng vật lý (khoảng 180) ít hơn TGDD, nên tính năng "tìm cửa hàng gần nhất" kém hữu ích hơn ở khu vực xa trung tâm
- Không tích hợp dịch vụ viễn thông (SIM, cước điện thoại) như FPT Shop
- Trang chủ khá nặng về banner khuyến mãi động (nhiều hiệu ứng, đếm ngược flash sale) có thể gây rối với người dùng lớn tuổi

### 2.4. Ma trận so sánh chức năng — chức năng nào trang có, trang nào không

| Chức năng | TGDD | FPT Shop | CellphoneS | Ghi chú |
|---|:---:|:---:|:---:|---|
| So sánh sản phẩm song song | ✅ | ❌ (không nổi bật) | ❌ (không nổi bật) | Thế mạnh riêng của TGDD |
| Trang tin tức/cẩm nang công nghệ tích hợp trực tiếp | ✅ (TGDD 24h) | ⚠️ (chỉ tin khuyến mãi) | ✅ (Sforum/Schannel, nhưng tách site riêng) | TGDD nhồi vào cùng trang, CellphoneS tách site |
| Chương trình thành viên/loyalty hiển thị rõ (đăng nhập tích điểm) | ⚠️ (qua app riêng) | ⚠️ (chưa rõ trên web) | ✅ (Smember) | CellphoneS mạnh nhất |
| Kênh khách hàng doanh nghiệp (B2B) riêng | ❌ | ⚠️ ("Dự án doanh nghiệp") | ✅ (S-Business) | CellphoneS có trang riêng rõ ràng |
| Dịch vụ viễn thông (bán SIM, nạp thẻ, đóng cước) | ❌ | ✅ | ❌ | Lợi thế riêng của FPT (tập đoàn viễn thông) |
| Thu cũ – đổi mới (trade-in) | ✅ | ✅ | ✅ | Cả 3 đều có |
| Trả góp 0% / mua trước trả sau (BNPL) | ✅ | ✅ (nhiều đối tác nhất: Kredivo, Home PayLater, Muadee...) | ✅ (Kredivo, Fundiin) | FPT Shop có nhiều đối tác BNPL nhất |
| Tra cứu hóa đơn điện tử online | ⚠️ (chưa nổi bật) | ✅ | ✅ | |
| Tra cứu bảo hành / bảng giá sửa chữa online | ✅ | ✅ (có cả bảng giá sửa chữa chi tiết) | ✅ | |
| Hoàn thuế GTGT cho khách quốc tế (VAT Refund) | ❌ | ❌ | ✅ | Chỉ CellphoneS có công khai |
| Kiểm tra tồn kho theo từng cửa hàng cụ thể | ✅ | ⚠️ | ✅ | |
| Sàn thương mại điện tử đa chuỗi tích hợp | ✅ (MWG Shop, qua app) | ❌ | ❌ | Xu hướng mới của TGDD |
| Ứng dụng di động riêng | ✅ | ✅ | ✅ (qua app Smember) | Cả 3 đều có |
| Đánh giá/review sản phẩm bằng video | ⚠️ | ⚠️ | ✅ (nổi bật hơn) | |

**Nhận xét rút ra**: mỗi trang có 1–2 chức năng "độc quyền" xuất phát từ lợi thế hệ sinh thái riêng của công ty mẹ (FPT Shop dựa vào viễn thông FPT; CellphoneS dựa vào mô hình thành viên Smember dùng chung nhiều chuỗi con). Với đồ án của một sinh viên (không có hệ sinh thái tập đoàn), nên **ưu tiên các chức năng lõi cả 3 trang đều có** (trade-in, trả góp, tra cứu bảo hành/hóa đơn, tồn kho theo cửa hàng) và **chọn 1–2 điểm khác biệt khả thi** để làm nổi bật đồ án, ví dụ: chức năng so sánh sản phẩm (như TGDD) kết hợp chương trình thành viên/tích điểm đơn giản (như CellphoneS).

---

## 3. Đề xuất định hướng cho đồ án (rút ra từ khảo sát)

1. **Kế thừa điểm mạnh của TGDD**: chức năng so sánh sản phẩm, bộ lọc chi tiết, tích hợp tồn kho theo cửa hàng.
2. **Khắc phục điểm yếu đã khảo sát**:
   - Thiết kế giao diện gọn hơn, tránh lặp thông tin giữa các menu
   - Làm nổi bật chức năng tìm kiếm nâng cao bằng hướng dẫn/gợi ý trực quan
   - Tối ưu tốc độ tải trang (lazy load hình ảnh, phân trang sản phẩm)
   - Thiết kế phân loại sản phẩm (cao cấp/phổ thông) có giao diện khác biệt rõ ràng
3. **Học hỏi từ CellphoneS**: UI hiện đại, hiệu ứng flash sale tạo cảm giác khẩn cấp, video đánh giá sản phẩm.
4. **Học hỏi từ FPT Shop**: quy trình trả góp/thu cũ đổi mới đơn giản, rõ ràng.

---

## 4. Đề xuất phạm vi chức năng cho đồ án (phân loại MVP – Nên có – Mở rộng)

Đây là bảng tổng hợp **toàn bộ chức năng đã phân tích ở Mục 1, 5, 6** thành phạm vi triển khai thực tế, giúp bạn quản lý tiến độ đồ án và trình bày rõ tư duy "scope management" trước hội đồng — một tiêu chí luôn được đánh giá cao.

### 4.1. Nhóm MVP — Bắt buộc phải có (đảm bảo hệ thống chạy được luồng nghiệp vụ cốt lõi)

**Phía khách hàng**
- Đăng ký/đăng nhập (email hoặc SĐT + mật khẩu, có mã hóa bcrypt), đăng xuất, quên/đổi mật khẩu
- Xem danh mục, chi tiết sản phẩm, tìm kiếm & lọc cơ bản (hãng, giá, danh mục)
- Giỏ hàng: thêm/sửa/xóa sản phẩm, tính tổng tiền
- Đặt hàng & thanh toán: COD + tối thiểu 1 cổng thanh toán online (VD: VNPay/Momo sandbox)
- Theo dõi trạng thái đơn hàng (không cần real-time, cập nhật khi load lại trang cũng được)
- Đánh giá sản phẩm (sao + bình luận văn bản)
- Quản lý tài khoản cơ bản: thông tin cá nhân, sổ địa chỉ, lịch sử đơn hàng

**Phía quản trị**
- Quản lý sản phẩm/danh mục (CRUD)
- Quản lý đơn hàng (xác nhận, cập nhật trạng thái, hủy)
- Quản lý khách hàng (xem danh sách, khóa/mở tài khoản)
- Dashboard thống kê doanh thu cơ bản (tổng đơn, tổng doanh thu theo ngày/tháng)
- Phân quyền tối thiểu 2 vai trò: Admin và Nhân viên

**Kỹ thuật nền tảng bắt buộc (MERN)**
- RESTful API chuẩn (Express.js), Mongoose schema rõ ràng
- JWT xác thực (tối thiểu access token)
- Middleware kiểm tra phân quyền, chống truy cập trái phép vào route admin
- Validate dữ liệu đầu vào (chống lỗi cơ bản, sơ khai chống injection)

### 4.2. Nhóm Nên có — Nâng chất lượng & điểm số đáng kể

**Phía khách hàng**
- So sánh sản phẩm song song (điểm đặc trưng học từ TGDD)
- Bộ lọc nâng cao (RAM/ROM, nhu cầu sử dụng), sắp xếp nhiều tiêu chí
- Wishlist (sản phẩm yêu thích)
- Mã giảm giá/voucher, chương trình khuyến mãi
- **Bảo hành điện tử**: tra cứu bảo hành theo đơn hàng, gửi yêu cầu bảo hành online, theo dõi tiến độ xử lý
- Xác thực OTP khi đăng ký/đổi mật khẩu, CAPTCHA chống bot
- Trang chính sách bảo mật, điều khoản sử dụng (consent khi đăng ký)
- Trung tâm thông báo cơ bản (đơn hàng, khuyến mãi)

**Phía quản trị**
- Quản lý khuyến mãi/mã giảm giá
- Quản lý bảo hành: tiếp nhận, cập nhật trạng thái xử lý
- Nhật ký thao tác quản trị (audit log) cơ bản
- Dashboard nâng cao: sản phẩm bán chạy, biểu đồ trực quan (dùng MongoDB Aggregation)
- Quản lý đánh giá (duyệt/ẩn bình luận vi phạm)

**Kỹ thuật MERN nên có**
- JWT access token + refresh token (chuẩn bảo mật SPA)
- Xử lý upload ảnh qua Cloudinary/AWS S3 + Multer
- Cursor-based pagination cho danh sách sản phẩm/đơn hàng
- MongoDB Aggregation Pipeline cho thống kê dashboard
- Giới hạn số lần đăng nhập sai (rate limiting)

### 4.3. Nhóm Mở rộng — Điểm cộng sáng tạo nếu còn thời gian

**Phía khách hàng**
- Theo dõi đơn hàng **real-time** (Socket.io)
- Chat trực tuyến với CSKH (Socket.io)
- Thông báo đẩy real-time (chuông thông báo có số đếm)
- Chatbot tư vấn sản phẩm (rule-based hoặc tích hợp AI)
- Gợi ý sản phẩm cá nhân hóa dựa trên lịch sử xem/mua
- Gamification (vòng quay may mắn, điểm danh nhận xu)
- Tính năng trả góp/BNPL mô phỏng
- Progressive Web App (PWA) — cài đặt như app di động
- Xác thực hai yếu tố (2FA)
- Affiliate/tiếp thị liên kết

**Phía quản trị**
- Quản lý kho linh kiện bảo hành, báo cáo thống kê bảo hành chuyên sâu
- Cảnh báo hành vi bất thường (nhiều đơn từ 1 IP, đăng nhập sai liên tục)
- Sao lưu & phục hồi dữ liệu tự động theo lịch
- Quản lý affiliate/cộng tác viên

**Kỹ thuật MERN mở rộng**
- Redis cache cho danh mục/sản phẩm truy cập nhiều, đo lường và so sánh hiệu năng
- Unit test/integration test (Jest + Supertest)
- Tài liệu API tự động (Swagger/OpenAPI)
- Elasticsearch/MongoDB Atlas Search cho tìm kiếm nâng cao
- CI/CD cơ bản (GitHub Actions)

### 4.4. Bảng tổng hợp nhanh (dùng để báo cáo tiến độ với giảng viên)

| Giai đoạn | Trọng tâm | Thời điểm hoàn thành đề xuất |
|---|---|---|
| **Giai đoạn 1 — MVP** | Luồng mua hàng hoàn chỉnh end-to-end (xem → giỏ hàng → thanh toán → theo dõi đơn) | Tuần 1-4 |
| **Giai đoạn 2 — Nên có** | Bảo hành, bảo mật cơ bản, dashboard nâng cao, so sánh sản phẩm | Tuần 5-8 |
| **Giai đoạn 3 — Mở rộng** | Real-time, chatbot, cache, kiểm thử tự động, hoàn thiện tài liệu | Tuần 9-12 |

> **Lưu ý quan trọng**: Luôn đảm bảo Giai đoạn 1 chạy ổn định và có demo được trước khi đầu tư thời gian vào Giai đoạn 2-3. Hội đồng đánh giá cao một hệ thống MVP hoàn chỉnh, mượt mà hơn là một hệ thống nhiều chức năng nhưng lỗi/thiếu ổn định.

---

## 5. Yêu cầu phi chức năng (Non-functional Requirements) — bắt buộc phải có để đạt điểm cao

Đồ án tốt nghiệp không chỉ được đánh giá qua *số lượng chức năng*, mà còn qua *chất lượng hệ thống*. Hội đồng chấm thường hỏi sâu vào các tiêu chí sau — nên trình bày rõ trong báo cáo:

| Nhóm | Yêu cầu cụ thể |
|---|---|
| **Hiệu năng (Performance)** | Thời gian phản hồi trang chủ/trang danh mục < 2-3 giây; tối ưu ảnh (lazy load, nén ảnh, dùng CDN); phân trang/infinite scroll thay vì tải toàn bộ dữ liệu |
| **Bảo mật (Security)** | Mã hóa mật khẩu (bcrypt/argon2), chống SQL Injection/XSS/CSRF, giới hạn tần suất đăng nhập sai (rate limiting/captcha), HTTPS toàn site, phân quyền rõ ràng giữa khách/admin/nhân viên |
| **Khả năng mở rộng (Scalability)** | Thiết kế database chuẩn hóa, tách API rõ ràng (RESTful/GraphQL), có thể triển khai microservice hoặc module hóa để dễ mở rộng sau này |
| **Khả năng sử dụng (Usability/UX)** | Giao diện responsive (di động/tablet/desktop), điều hướng trực quan, thời gian hoàn tất đơn hàng tối thiểu số bước |
| **Độ tin cậy (Reliability)** | Xử lý lỗi rõ ràng (thông báo lỗi thân thiện), sao lưu dữ liệu định kỳ, cơ chế retry khi thanh toán/API bên thứ 3 lỗi |
| **Khả năng bảo trì (Maintainability)** | Code có chuẩn coding convention, viết tài liệu API (Swagger/Postman collection), tách lớp rõ ràng (MVC/Clean Architecture) |
| **Khả năng kiểm thử (Testability)** | Có unit test cho các module quan trọng (giỏ hàng, thanh toán, tính giá), test case cho từng use-case chính |
| **SEO & khả năng truy cập (Accessibility)** | URL thân thiện, thẻ meta đầy đủ, alt text cho ảnh, tuân thủ cơ bản WCAG (tương phản màu, điều hướng bàn phím) |
| **Đa nền tảng** | Responsive trên trình duyệt phổ biến (Chrome, Safari, Edge), tương thích di động (iOS/Android qua web hoặc app) |
| **Pháp lý/tuân thủ** | Chính sách bảo mật dữ liệu cá nhân, điều khoản sử dụng, tuân thủ quy định về TMĐT tại Việt Nam (Nghị định 52/2013, sửa đổi bổ sung) |

## 6. Đề xuất kiến trúc kỹ thuật & chức năng nổi bật khi dùng MERN Stack

Vì đồ án dùng **MongoDB – Express.js – React.js – Node.js**, nên ngoài các chức năng nghiệp vụ đã liệt kê, bạn nên chủ động thiết kế một số chức năng/kỹ thuật **khai thác đúng thế mạnh của từng thành phần MERN**. Đây là điểm hội đồng thường đánh giá cao vì cho thấy hiểu bản chất công nghệ, không chỉ "làm cho có".

### 6.1. Kiến trúc tổng thể đề xuất

| Thành phần | Vai trò | Công nghệ đề xuất |
|---|---|---|
| Frontend (khách hàng) | SPA React, giao diện mua sắm | React + React Router + Redux Toolkit/Context API + Axios |
| Frontend (quản trị) | SPA admin dashboard riêng biệt | React (project riêng hoặc route riêng), Ant Design/Material UI cho tốc độ dựng UI |
| Backend API | RESTful API xử lý nghiệp vụ | Node.js + Express.js, kiến trúc theo layer (routes → controllers → services → models) |
| Cơ sở dữ liệu | Lưu trữ dữ liệu chính | MongoDB (Atlas) — thiết kế schema với Mongoose ODM |
| Xác thực | Đăng nhập/phân quyền | JWT (access token + refresh token), middleware xác thực Express |
| Realtime | Thông báo, chat, theo dõi đơn hàng | Socket.io (Node.js) kết hợp React |
| Lưu trữ ảnh/file | Ảnh sản phẩm, avatar, ảnh đánh giá | Cloudinary hoặc AWS S3 + Multer xử lý upload |
| Cache | Tăng tốc truy vấn lặp lại | Redis (cache danh mục, sản phẩm hot, session) |
| Tìm kiếm nâng cao | Tìm kiếm sản phẩm mờ, gợi ý | MongoDB Atlas Search / Elasticsearch (nếu mở rộng) |
| Thanh toán | Cổng thanh toán | Tích hợp API VNPay/Momo/Stripe sandbox qua Node.js backend |
| Gửi email/SMS | OTP, xác nhận đơn hàng | Nodemailer (email), Twilio/eSMS (SMS) |
| Triển khai (Deployment) | Đưa hệ thống lên môi trường thật | Frontend: Vercel/Netlify; Backend: Render/Railway/VPS; DB: MongoDB Atlas; có thể đóng gói Docker |
| CI/CD (nếu mở rộng) | Tự động kiểm thử/triển khai | GitHub Actions |

### 6.2. Chức năng nên bổ sung để "khoe" đúng thế mạnh MERN

| Chức năng | Vì sao làm nổi bật MERN | Công nghệ áp dụng cụ thể |
|---|---|---|
| **Theo dõi đơn hàng thời gian thực (real-time order tracking)** | Thể hiện thế mạnh Node.js + Socket.io cho real-time, thứ mà PHP/Laravel truyền thống khó làm mượt bằng | Socket.io emit sự kiện cập nhật trạng thái đơn hàng, React lắng nghe và cập nhật UI không cần reload |
| **Thông báo đẩy real-time (chuông thông báo có số đếm)** | Cùng cơ chế Socket.io, cho thấy khả năng xử lý sự kiện bất đồng bộ của Node.js | Socket.io room theo từng userId, React Context quản lý state thông báo toàn cục |
| **Chat trực tuyến giữa khách hàng và admin/CSKH** | Ứng dụng thực tế rõ nhất của Socket.io, dễ demo trực quan trước hội đồng | Socket.io + lưu lịch sử chat vào MongoDB (schema linh hoạt, phù hợp dữ liệu hội thoại dạng document) |
| **Tìm kiếm gợi ý tức thời (instant search) không giật lag** | Thể hiện SPA React xử lý UI mượt, kết hợp debounce + API Node.js phản hồi nhanh | React (useEffect + debounce hook), Express API + MongoDB text index/Atlas Search |
| **Giỏ hàng đồng bộ real-time đa thiết bị** | Cho thấy khả năng đồng bộ state giữa nhiều phiên đăng nhập cùng tài khoản | Lưu giỏ hàng trên MongoDB gắn với userId thay vì chỉ localStorage, đồng bộ qua API/Socket khi đăng nhập thiết bị khác |
| **Infinite scroll / lazy loading sản phẩm mượt** | Thể hiện tối ưu hiệu năng phía React (virtualization, code-splitting) | React lazy + Suspense, Intersection Observer API, API phân trang (cursor-based pagination) từ MongoDB |
| **Dashboard thống kê trực quan, cập nhật real-time** | Thể hiện sức mạnh Aggregation Framework của MongoDB kết hợp biểu đồ React | MongoDB Aggregation Pipeline (group, sort, $facet) để tính doanh thu/sản phẩm bán chạy, hiển thị bằng Recharts/Chart.js trong React |
| **Gợi ý sản phẩm cá nhân hóa cơ bản** | Thể hiện khả năng truy vấn linh hoạt của MongoDB (dữ liệu hành vi dạng document) | Lưu lịch sử xem/mua dạng document, dùng Aggregation để gợi ý sản phẩm cùng danh mục/hãng đã xem |
| **Xác thực JWT với access token + refresh token** | Thể hiện hiểu đúng chuẩn bảo mật hiện đại cho SPA, khác với session truyền thống | Middleware Express xác thực JWT, refresh token lưu httpOnly cookie, access token ngắn hạn lưu bộ nhớ React (không localStorage để chống XSS) |
| **API RESTful chuẩn, có tài liệu Swagger** | Thể hiện tư duy backend chuyên nghiệp, dễ bảo trì/mở rộng | Swagger/OpenAPI tự sinh từ Express (swagger-jsdoc), hoặc dùng Postman Collection làm tài liệu minh chứng |
| **Xử lý ảnh sản phẩm tối ưu (resize, nén, nhiều kích thước)** | Thể hiện xử lý file phía Node.js kết hợp dịch vụ cloud | Multer nhận file → upload lên Cloudinary (tự động resize/tối ưu qua URL transform) |
| **Phân trang hiệu năng cao (cursor-based) cho danh sách sản phẩm/đơn hàng lớn** | Cho thấy hiểu về tối ưu truy vấn MongoDB thay vì skip/limit cơ bản (chậm với dữ liệu lớn) | MongoDB cursor pagination dùng `_id`/index, so sánh hiệu năng với offset pagination trong báo cáo |
| **Áp dụng Redis cache cho danh mục/sản phẩm truy cập nhiều** | Thể hiện tư duy tối ưu hệ thống thực tế, không chỉ CRUD cơ bản | Cache kết quả truy vấn MongoDB phổ biến vào Redis, đo và so sánh thời gian phản hồi có/không cache |
| **Kiểm thử API tự động (unit test/integration test)** | Thể hiện quy trình phát triển phần mềm chuyên nghiệp | Jest + Supertest test các API quan trọng (đăng nhập, giỏ hàng, thanh toán) |
| **Progressive Web App (PWA) cơ bản** | Tận dụng React để web hoạt động gần như app di động (điểm cộng sáng tạo) | Service Worker, manifest.json, cho phép "Add to Home Screen", cache offline cơ bản |

### 6.3. Gợi ý minh chứng kỹ thuật khi bảo vệ đồ án (đặc thù MERN)

1. **Sơ đồ kiến trúc hệ thống (System Architecture Diagram)**: vẽ rõ luồng Client (React) ⇄ REST API/Socket.io (Express/Node.js) ⇄ MongoDB, kèm các dịch vụ ngoài (Cloudinary, cổng thanh toán, email/SMS)
2. **Giải thích lựa chọn NoSQL (MongoDB) thay vì SQL**: nên chuẩn bị sẵn câu trả lời — vì dữ liệu sản phẩm có thuộc tính linh hoạt (mỗi ngành hàng thông số khác nhau), MongoDB schema-less phù hợp hơn để mở rộng mà không cần migrate liên tục như SQL
3. **Trình bày rõ Mongoose Schema/Model** cho các collection chính: User, Product, Order, Cart, Review, Warranty...
4. **Demo trực tiếp tính năng real-time** (theo dõi đơn hàng/chat/thông báo) — đây là phần "ăn điểm" trực quan nhất vì hội đồng thấy ngay sự khác biệt so với web CRUD thông thường
5. **So sánh hiệu năng có/không tối ưu** (có/không Redis cache, offset vs cursor pagination) bằng số liệu đo thực tế (dùng Postman/Apache Bench) — thể hiện tư duy đánh giá hệ thống định lượng, không chỉ định tính

### 6.4. Lưu ý về phạm vi (tránh ôm đồm)

Không cần làm tất cả các mục ở 7.2 — hãy chọn theo nguyên tắc ở mục 4 (MVP – Nên có – Mở rộng):
- **Bắt buộc nên có** để thể hiện đúng MERN: JWT auth, RESTful API chuẩn, MongoDB Aggregation cho dashboard, xử lý upload ảnh qua cloud
- **Nên có nếu đủ thời gian**: real-time order tracking, thông báo real-time, cache Redis
- **Điểm cộng nếu dư thời gian**: chat real-time, gợi ý cá nhân hóa, PWA, unit test tự động

---

## 7. Tổng kết: Tiêu chí đánh giá & chiến lược bảo vệ đồ án (để nhắm điểm 10/10)

1. **Tính đầy đủ của chức năng**: mapping rõ ràng giữa chức năng đề xuất và chức năng thực tế trên TGDD/đối thủ (dùng chính bảng khảo sát ở mục 1 và 2 làm minh chứng "vì sao chọn chức năng này")
2. **Tính khả thi/thực tế**: không tham lam liệt kê 100% chức năng của TGDD (một mình không làm nổi trong thời gian đồ án) — hãy phân loại rõ 3 nhóm: **Bắt buộc (MVP)** – **Nên có** – **Mở rộng nếu còn thời gian**, thể hiện tư duy quản lý phạm vi dự án (scope management)
3. **Chiều sâu kỹ thuật**: có sơ đồ ERD, use-case diagram, sequence diagram cho ít nhất các luồng chính (đặt hàng, thanh toán, bảo hành)
4. **Yếu tố khác biệt/sáng tạo**: chọn 1-2 điểm nhấn không có ở bản gốc để tạo dấu ấn cá nhân cho đồ án (ví dụ: chatbot tư vấn, gamification, dashboard phân tích dữ liệu bán hàng bằng AI...)
5. **Chất lượng phi chức năng**: bảo mật, hiệu năng, khả năng mở rộng — trình bày như mục 5 ở trên
6. **Kiểm thử & minh chứng vận hành thực tế**: có test case, demo luồng nghiệp vụ đầy đủ (không chỉ giao diện tĩnh)
7. **Tài liệu đầy đủ**: đặc tả yêu cầu (SRS), thiết kế CSDL, hướng dẫn sử dụng, báo cáo kết quả kiểm thử

---
