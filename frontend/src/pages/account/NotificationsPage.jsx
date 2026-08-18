import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { notificationService } from '../../services/notificationService';

const typeIcon = { order: '📦', promotion: '🎁', warranty: '🛠️', system: '🔔' };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => notificationService.getMyNotifications().then((res) => setNotifications(res.data));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    load();
  };

  const handleClickNoti = async (n) => {
    if (!n.isRead) {
      await notificationService.markAsRead(n._id);
      load();
    }
  };

  if (loading) return <div className="text-center py-10">Đang tải...</div>;

  return (
    <div className="bg-white border rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold">Thông báo</h2>
        <button onClick={handleMarkAllRead} className="text-sm text-red-600">
          Đánh dấu tất cả đã đọc
        </button>
      </div>
      <div className="divide-y">
        {notifications.map((n) => (
          <Link
            key={n._id}
            to={n.link || '#'}
            onClick={() => handleClickNoti(n)}
            className={`flex gap-3 py-3 ${!n.isRead ? 'bg-red-50 -mx-5 px-5' : ''}`}
          >
            <span className="text-xl">{typeIcon[n.type] || '🔔'}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-sm text-gray-600">{n.message}</div>
              <div className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('vi-VN')}</div>
            </div>
            {!n.isRead && <span className="w-2 h-2 rounded-full bg-red-600 mt-1" />}
          </Link>
        ))}
        {notifications.length === 0 && <div className="text-sm text-gray-400 py-4">Không có thông báo nào</div>}
      </div>
    </div>
  );
}
