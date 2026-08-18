import { useEffect, useState } from 'react';
import { userService } from '../../services/userService';

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [keyword, setKeyword] = useState('');

  const load = () => userService.getAllCustomers({ keyword }).then((res) => setCustomers(res.data));

  useEffect(() => {
    load();
  }, [keyword]);

  const handleToggleActive = async (id) => {
    await userService.toggleCustomerActive(id);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Quản lý khách hàng</h1>
      <input
        placeholder="Tìm theo tên, email, số điện thoại..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="border rounded px-3 py-2 text-sm mb-4 w-full max-w-sm"
      />
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Họ tên</th>
              <th className="p-3">Email</th>
              <th className="p-3">SĐT</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c._id} className="border-b">
                <td className="p-3">{c.displayName}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3">{c.phoneNumber}</td>
                <td className="p-3">
                  <span className={c.isActive ? 'text-green-600' : 'text-red-600'}>
                    {c.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                  </span>
                </td>
                <td className="p-3">
                  <button onClick={() => handleToggleActive(c._id)} className="text-blue-600">
                    {c.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
