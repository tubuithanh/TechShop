import { PencilSquare } from 'react-bootstrap-icons';

const ACTION = { create: 'Tạo', update: 'Sửa', deactivate: 'Ẩn / tắt', activate: 'Bật lại' };
const fmt = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

// Người thao tác CUỐI CÙNG trên 1 bản ghi (trường `audit` do backend tự đóng dấu - utils/auditStamp.js).
// Rê chuột để xem cả người tạo. Bản ghi tạo trước khi có tính năng (chưa có dấu) thì không hiện gì.
export default function AuditStamp({ audit, className = '' }) {
  if (!audit?.updatedByName && !audit?.createdByName) return null;
  const title = [
    audit.createdByName && `Tạo bởi ${audit.createdByName}${audit.createdAt ? ` lúc ${fmt(audit.createdAt)}` : ''}`,
    audit.updatedByName && `${ACTION[audit.action] || 'Sửa'} gần nhất bởi ${audit.updatedByName}${audit.updatedAt ? ` lúc ${fmt(audit.updatedAt)}` : ''}`
  ].filter(Boolean).join('\n');
  return (
    <div className={`audit-stamp text-muted ${className}`} title={title} style={{ fontSize: '0.72rem' }}>
      <PencilSquare size={10} className="me-1" />
      {ACTION[audit.action] || 'Sửa'}: <b>{audit.updatedByName || audit.createdByName}</b>
      {(audit.updatedAt || audit.createdAt) && <> · {fmt(audit.updatedAt || audit.createdAt)}</>}
    </div>
  );
}
