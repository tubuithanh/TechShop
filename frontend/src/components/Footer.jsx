export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-10">
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
        <div>
          <h4 className="text-white font-semibold mb-2">TechShop</h4>
          <p>Đồ án tốt nghiệp - Website TMĐT mô phỏng theo mô hình thegioididong.com</p>
          <p className="mt-1">Công nghệ: MERN Stack (MongoDB - Express - React - Node.js)</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Hỗ trợ khách hàng</h4>
          <ul className="space-y-1">
            <li>Tra cứu bảo hành</li>
            <li>Chính sách đổi trả</li>
            <li>Hướng dẫn mua hàng</li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Chính sách</h4>
          <ul className="space-y-1">
            <li>Chính sách bảo mật</li>
            <li>Điều khoản sử dụng</li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Liên hệ</h4>
          <p>Hotline demo: 1900 0000</p>
          <p>Email demo: support@techshop.demo</p>
        </div>
      </div>
      <div className="text-center text-xs py-4 border-t border-gray-800">
        © 2026 TechShop - Đồ án tốt nghiệp. Dữ liệu và giao dịch chỉ mang tính minh họa.
      </div>
    </footer>
  );
}
