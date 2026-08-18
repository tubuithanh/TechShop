import { useEffect, useState } from 'react';
import { warrantyService } from '../services/warrantyService';

const statusLabel = {
  received: 'Đã tiếp nhận',
  checking: 'Đang kiểm tra',
  repairing: 'Đang sửa chữa',
  waiting_parts: 'Chờ linh kiện',
  done: 'Đã sửa xong',
  returned: 'Đã trả máy'
};

export default function MyWarrantiesPage() {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    warrantyService.getMyWarranties().then(setWarranties).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16">Đang tải...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Yêu cầu bảo hành của tôi</h1>
      {warranties.length === 0 ? (
        <div className="text-gray-500">Bạn chưa có yêu cầu bảo hành nào.</div>
      ) : (
        <div className="space-y-3">
          {warranties.map((w) => (
            <div key={w._id} className="border rounded-lg p-4">
              <div className="flex justify-between mb-1">
                <span className="font-medium">Phiếu #{w.ticketCode}</span>
                <span className="text-sm text-blue-600">{statusLabel[w.status]}</span>
              </div>
              <div className="text-sm text-gray-600">{w.productName}</div>
              <div className="text-sm text-gray-500 mt-1">Mô tả lỗi: {w.issueDescription}</div>
              <div className="text-xs text-gray-400 mt-1">
                Gửi lúc {new Date(w.createdAt).toLocaleString('vi-VN')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
