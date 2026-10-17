# Chat với nhân viên

## Sử dụng

1. Khởi động lại backend và frontend sau khi cập nhật code.
2. Admin vào **Quản lý nhân viên**, gán người hỗ trợ vào nhóm **Chăm sóc khách hàng**. Nhóm này cần bật quyền **Chat hỗ trợ khách hàng**.
3. Nhân viên mở **Chat với khách hàng** và bật **Đang trực · Nhận chat**.
4. Khách mở bong bóng, nhập tên và số điện thoại. Email, giới tính và nội dung đầu tiên không bắt buộc.
5. Nhân viên chọn hội thoại trong **Chờ tiếp nhận**, bấm **Tiếp nhận**, trao đổi và **Kết thúc**.
6. Admin có thể chuyển người phụ trách hoặc đưa cuộc chat về hàng chờ.
7. Hai phía dùng nút **Đính kèm tệp** hoặc **Emoji và sticker** dưới ô nhập. Emoji chèn tại con trỏ; sticker và tệp có bản xem trước, bỏ được trước khi bấm **Gửi**. Có thể gửi chỉ sticker hoặc chỉ tệp.
8. Khi nhân viên kết thúc chat, khách chọn **1–5 sao**, thêm nhận xét nếu muốn (tối đa 1.000 ký tự), bấm **Gửi đánh giá** hoặc **Để sau**. Có thể bắt đầu chat mới mà không đánh giá; quay lại cuộc chat cũ để đánh giá cần còn mã phiên của cuộc đó.
9. Mục **Đã kết thúc** hiển thị đánh giá/nhận xét/thời gian. Có bộ lọc số sao và ngày kết thúc, điểm trung bình và số lượt đánh giá theo bộ lọc. Admin lọc thêm nhân viên phụ trách lúc đóng chat; nhân viên chỉ xem các cuộc do mình phụ trách.

Nhóm CSKH có mã hệ thống `customer_support`, vì vậy đổi tên nhóm không làm mất nhận diện. Các nhóm khác chỉ có quyền `chat.support` vẫn không được tiếp nhận chat. Admin có toàn quyền.

Backend tự bổ sung mã cho nhóm CSKH hiện có (hoặc tạo nhóm nếu chưa có), tạo chỉ mục và bổ sung bản ghi hội thoại cho lịch sử cũ khi khởi động. Không cần chạy seed; lịch sử cũ được giữ trong mục chờ tiếp nhận của quản trị.

## Phiên khách và vận hành

- Không bắt buộc tài khoản. Khách đã đăng nhập được điền sẵn thông tin liên hệ.
- Mã phiên ngẫu nhiên chỉ có quyền truy cập một cuộc chat, backend chỉ lưu bản băm. Email và số điện thoại không cấp quyền đọc lịch sử.
- Phiên được giữ trong `sessionStorage`: tiếp tục được khi tải lại/chuyển trang trong cùng tab; hết hạn sau 7 ngày. Đóng tab có thể mất phiên khách, dữ liệu hội thoại vẫn được lưu cho CSKH.
- Thu nhỏ bong bóng không kết thúc chat. Cuộc đã kết thúc chỉ được đọc; khách có thể bắt đầu cuộc mới.
- Trạng thái có nhân viên trực chỉ tính người đủ quyền, đang kết nối và bật nhận chat trong trang chat.
- Gửi tin qua HTTP để xác nhận lưu thành công; Socket.IO cập nhật tức thời, đồng bộ HTTP mỗi 15 giây phục hồi khi mất kết nối. Mã tin gửi chống trùng khi thử lại.
- Nhận hội thoại dùng điều kiện cập nhật nguyên tử trong MongoDB. Các thay đổi tin nhắn/trạng thái được tuần tự trong một backend. Bản hiện tại dành cho một tiến trình backend; chạy nhiều replica cần thêm Socket.IO adapter và cơ chế phối hợp thay đổi hội thoại.
- Giới hạn nội dung 2.000 ký tự; giới hạn tạo phiên và tốc độ gửi tin. Lịch sử và danh sách hội thoại có phân trang.
- Chấp nhận JPG, PNG, WEBP, GIF và PDF: tối đa 5 tệp/tin, 5 MB/tệp, 100 MB tổng tệp/hội thoại. Backend kiểm tra chữ ký tệp và MIME, không chấp nhận SVG/HTML/tệp thực thi.
- Tệp chat lưu riêng trong MongoDB (`chat_attachments`), mỗi tệp là một document; không có URL tải công khai. Mọi lần tải đều kiểm tra phiên khách hoặc quyền CSKH và quyền xem hội thoại. Tệp đã gửi vẫn tải được sau khi chat kết thúc.
- Mã tệp và mã tin do client tạo giữ nguyên khi **Gửi lại**, tránh lưu trùng nếu mất phản hồi. Bản nháp đã upload nhưng chưa gửi tự dọn sau 24 giờ bằng TTL của MongoDB; tệp đã gửi được giữ cùng lịch sử. Ảnh xem trực tiếp/phóng to, PDF tải xuống.
- Mỗi hội thoại chỉ nhận một đánh giá từ phiên khách sở hữu và chỉ sau khi đóng. Gửi lại cùng đánh giá trả kết quả cũ; đổi nội dung đã đánh giá bị từ chối. Thông tin người đóng và nhân viên phụ trách tại thời điểm đóng được lưu cố định để không đổi theo tên tài khoản về sau. Để sau sẽ được nhắc lại khi mở lại bong bóng/tải lại trang nếu phiên còn hiệu lực.

## Kiểm thử

```powershell
cd backend
npm test -- --runTestsByPath tests/chat.test.js tests/chatSocket.test.js tests/chatExtras.test.js tests/chatDeploy.test.js --testTimeout=30000
```

Kiểm tra giao diện với MongoDB tạm (không đọc `.env`, không dùng dữ liệu thật):

```powershell
cd backend
node scripts/previewChat.js
```

Mở terminal khác:

```powershell
cd frontend
$env:VITE_API_URL='http://127.0.0.1:5098/api'
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
```

Mở `http://127.0.0.1:5178`. Tài khoản tạm `support@chat.test` hoặc `admin@chat.test`, mật khẩu `qa123456`. Dừng hai tiến trình bằng Ctrl+C khi kiểm tra xong. Dữ liệu tạm không được giữ sau khi dừng.

## Triển khai lên website Render hiện có

Website: `https://frontend-i3sp.onrender.com`. API: `https://techshop-twv1.onrender.com/api`.

| Service | Root Directory | Build Command | Start / Publish | Environment |
|---|---|---|---|---|
| Backend Web Service | `backend` | `npm ci --omit=dev` | `npm start` | `NODE_ENV=production`, `CLIENT_URL=https://frontend-i3sp.onrender.com`, giữ nguyên các khóa JWT và `MONGO_URI` hiện có |
| Frontend Static Site | `frontend` | `npm ci && npm run build` | Publish Directory: `dist` | `VITE_API_URL=https://techshop-twv1.onrender.com/api` |

Nếu service đang dùng lệnh tương đương và chạy đúng, không cần đổi. Không đổi khóa JWT/MongoDB khi cập nhật chat. Biến `VITE_API_URL` được đưa vào bundle lúc build: thay biến cần rebuild frontend. Giữ rewrite SPA `/* → /index.html` để tải lại `/admin/chat` vẫn mở được ứng dụng.

Danh mục sticker nằm trong `backend/data/chatStickers.json` và `frontend/src/data/chatStickers.json`. Hai service không import tệp ngoài Root Directory. Khi thêm sticker, cập nhật cả hai danh mục; `chatDeploy.test.js` kiểm tra tính đồng nhất khi chạy từ toàn bộ repository và kiểm tra backend không phụ thuộc đường dẫn ngoài `backend`.

Đưa toàn bộ mã chat, models, migration, socket middleware, danh mục sticker và hai lockfile của ứng dụng lên GitHub. Không đưa thay đổi `.env`, `node_modules`, cache hoặc bản nháp QA vào commit. Deploy backend trước, chờ hoàn tất rồi deploy frontend để khách không gọi API mới vào backend cũ. Không chạy seed trên MongoDB đang dùng: backend tự migration khi khởi động.

Xác minh sau deploy:

1. `/api/health` trả HTTP 200 và `/api/chat/availability` trả HTTP 200 có `onlineCount` mà không cần đăng nhập.
2. Mở website: khách tạo chat với dữ liệu kiểm thử; CSKH đã được gán nhóm tiếp nhận trong `/admin/chat`.
3. Hai phía gửi tin/emoji/sticker và ảnh/PDF, thử gửi chỉ tệp hoặc chỉ sticker; ảnh xem được và PDF tải được đúng phiên.
4. Thu nhỏ/mở lại, tải lại trang và kết nối lại vẫn lấy được lịch sử. Mất socket sẽ đồng bộ HTTP mỗi 15 giây.
5. CSKH kết thúc: khách thấy đánh giá 1–5 sao; gửi nhận xét, CSKH/admin thấy cùng đánh giá và thống kê. Khách khác/người không có quyền không tải được tệp.
6. Sau deploy/restart tiếp theo, các tệp đã gửi vẫn tồn tại trong MongoDB Atlas; không phụ thuộc đĩa tạm Render.
