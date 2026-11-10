# Cập nhật đơn hàng — 10/11/2026

## Cách sử dụng

- Khách hàng: **Tài khoản → Đơn hàng của tôi**, chọn trạng thái và chuyển trang. Mỗi trang 10 đơn; số đếm chỉ thuộc tài khoản đang đăng nhập.
- Quản trị: **Quản lý đơn hàng**, xác nhận đơn như trước. Cột trạng thái và chi tiết đơn hiển thị người xác nhận, thời gian; chi tiết có lịch sử xử lý.
- **Sửa thông tin**: sửa tên người nhận, điện thoại, ghi chú khi đơn đang chờ/đã xác nhận. Bắt buộc nhập lý do. Lịch sử lưu người sửa và giá trị trước/sau, không có API xóa/sửa lịch sử.
- **Điều phối chi nhánh**: chọn chi nhánh đích và lý do. Đơn nhận tại cửa hàng cần xác nhận đã được khách đồng ý đổi nơi nhận.
- Chi nhánh đích vào **Quản lý đơn hàng → Yêu cầu điều phối đang chờ**, tiếp nhận hoặc từ chối. Chi nhánh nguồn có thể hủy yêu cầu. Nhấn **Tải lại yêu cầu điều phối** để cập nhật danh sách.

## Quy tắc

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

## Kịch bản kiểm thử thủ công

1. Tài khoản có trên 10 đơn: chuyển trang, chọn từng trạng thái, kiểm tra số lượng và không thấy đơn của tài khoản khác.
2. Nhân viên A xác nhận đơn: mở chi tiết, kiểm tra tên, thời gian, chi nhánh. Đổi tên tài khoản sau đó không được làm đổi tên đã lưu trong log mới.
3. Sửa người nhận/ghi chú: kiểm tra lý do, giá trị trước/sau và tìm kiếm được theo tên mới.
4. Gửi điều phối A → B. Thử xử lý/gán shipper/hủy đơn khi đang chờ: phải bị chặn. Nhân viên C không được tiếp nhận.
5. B thiếu một mặt hàng: tiếp nhận thất bại, tồn kho cả A/B giữ nguyên. Từ chối hoặc hủy yêu cầu để mở khóa đơn.
6. B đủ hàng: tiếp nhận một lần, kiểm tra tồn kho hai bên và đơn về chờ xác nhận. B xác nhận lại; sau đó khách hủy thì chỉ hoàn kho B.
7. Đơn nhận tại cửa hàng chưa tích đồng ý của khách: không gửi được. Đơn đã giao/đang giao hoặc VNPay chưa trả tiền: không điều phối được.

## Kiểm thử tự động

`backend/tests/orderUpgrade.test.js` kiểm tra phân trang, quyền truy cập, snapshot người xác nhận, nhật ký sửa, tìm kiếm sau sửa, điều phối đồng thời, hoàn tác kho và các ràng buộc trên. Chạy bằng `npm test -- --runTestsByPath tests/orderUpgrade.test.js --silent` từ thư mục backend.
