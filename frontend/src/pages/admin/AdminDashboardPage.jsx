import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardService } from '../../services/dashboardService';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [bestSelling, setBestSelling] = useState([]);
  const [revenueByStore, setRevenueByStore] = useState([]);

  useEffect(() => {
    dashboardService.getSummary().then(setSummary);
    dashboardService.getRevenueByDay(7).then(setRevenueData);
    dashboardService.getBestSelling(5).then(setBestSelling);
    dashboardService.getRevenueByStore().then(setRevenueByStore);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Tổng quan hệ thống</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Tổng doanh thu (đã giao)</div>
          <div className="text-lg font-bold text-red-600">{formatVND(summary?.totalRevenue || 0)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Tổng đơn hàng</div>
          <div className="text-lg font-bold">{summary?.totalOrders ?? '-'}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Khách hàng</div>
          <div className="text-lg font-bold">{summary?.totalCustomers ?? '-'}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Sản phẩm đang bán</div>
          <div className="text-lg font-bold">{summary?.totalProducts ?? '-'}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm mb-8">
        <h3 className="font-medium mb-3">Doanh thu 7 ngày gần nhất</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="_id" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(value) => formatVND(value)} />
            <Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-medium mb-3">Top sản phẩm bán chạy</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Sản phẩm</th>
                <th className="py-2">Giá</th>
                <th className="py-2">Đã bán</th>
              </tr>
            </thead>
            <tbody>
              {bestSelling.map((p) => (
                <tr key={p._id} className="border-b">
                  <td className="py-2">{p.title}</td>
                  <td className="py-2">{formatVND(p.price)}</td>
                  <td className="py-2">{p.soldCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-medium mb-3">Doanh thu theo cửa hàng (multi-store)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Cửa hàng</th>
                <th className="py-2">Doanh thu</th>
                <th className="py-2">Số đơn</th>
              </tr>
            </thead>
            <tbody>
              {revenueByStore.map((s) => (
                <tr key={s._id} className="border-b">
                  <td className="py-2">{s.store?.name}</td>
                  <td className="py-2">{formatVND(s.revenue)}</td>
                  <td className="py-2">{s.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
