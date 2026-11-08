import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, ListGroup, Spinner } from 'react-bootstrap';
import { notificationService } from '../../services/notificationService';

const typeIcon = { order: '📦', promotion: '🎁', warranty: '🛠️', system: '🔔' };

// Đổi link của thông báo sang trang thật. Thông báo CŨ được tạo với link sai (/orders/:id, /warranties/:id -
// không có trang nào như vậy nên bấm vào ra trang trắng) -> chuyển sang đúng trang trong mục Tài khoản.
// Link không nhận ra -> null (thông báo vẫn hiện nhưng không bấm sang trang khác).
const KNOWN_PREFIXES = ['/account/', '/products', '/promotions', '/tin-tuc', '/stores', '/cart', '/tra-cuu-bao-hanh', '/compare'];
export function resolveNotificationLink(link) {
  if (!link || typeof link !== 'string' || !link.startsWith('/')) return null;
  const legacyOrder = link.match(/^\/orders\/([a-f0-9]{24})$/i);
  if (legacyOrder) return `/account/orders/${legacyOrder[1]}`;
  if (/^\/warranties(\/|$)/.test(link)) return '/account/warranties';
  if (link === '/') return '/';
  return KNOWN_PREFIXES.some((p) => link.startsWith(p)) ? link : null;
}

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

  if (loading)
    return (
      <div className="text-center py-4">
        <Spinner animation="border" />
      </div>
    );

  return (
    <Card>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="fw-bold fs-5 mb-0">Thông báo</h2>
          <Button variant="link" size="sm" className="p-0" onClick={handleMarkAllRead}>
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
        <ListGroup variant="flush">
          {notifications.map((n) => {
            const to = resolveNotificationLink(n.link);
            return (
            <ListGroup.Item
              key={n._id}
              {...(to ? { as: Link, to } : { as: 'button', type: 'button' })}
              onClick={() => handleClickNoti(n)}
              action
              className={`d-flex gap-3 align-items-start text-start ${!n.isRead ? 'bg-primary-subtle' : ''}`}
            >
              <span className="fs-4">{typeIcon[n.type] || '🔔'}</span>
              <div className="flex-grow-1">
                <div className="small fw-medium">{n.title}</div>
                <div className="small text-muted">{n.message}</div>
                <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                  {new Date(n.createdAt).toLocaleString('vi-VN')}
                </div>
              </div>
              {!n.isRead && (
                <span className="rounded-circle bg-primary mt-1" style={{ width: '0.5rem', height: '0.5rem' }} />
              )}
            </ListGroup.Item>
            );
          })}
          {notifications.length === 0 && <div className="small text-muted py-4">Không có thông báo nào</div>}
        </ListGroup>
      </Card.Body>
    </Card>
  );
}
