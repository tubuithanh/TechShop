import { useEffect, useState } from 'react';
import { auditLogService } from '../../services/auditLogService';

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    auditLogService.getLogs({ page }).then((res) => {
      setLogs(res.data);
      setTotalPages(res.totalPages);
    });
  }, [page]);

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">Nhật ký thao tác quản trị (Audit Log)</h1>
      <p className="text-sm text-gray-500 mb-4">
        Ghi lại mọi thao tác thêm/sửa/xóa do quản trị viên và nhân viên thực hiện, phục vụ truy vết khi có sự cố.
      </p>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Thời gian</th>
              <th className="p-3">Người thực hiện</th>
              <th className="p-3">Vai trò</th>
              <th className="p-3">Hành động</th>
              <th className="p-3">Đường dẫn</th>
              <th className="p-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id} className="border-b">
                <td className="p-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                <td className="p-3">{log.userName}</td>
                <td className="p-3">{log.userRole}</td>
                <td className="p-3">{log.action}</td>
                <td className="p-3 text-xs text-gray-500">{log.path}</td>
                <td className="p-3 text-xs text-gray-400">{log.ip}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  Chưa có nhật ký nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2 mt-4 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="border rounded px-3 py-1 disabled:opacity-50"
        >
          Trước
        </button>
        <span className="px-2 py-1">
          Trang {page}/{totalPages || 1}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="border rounded px-3 py-1 disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
