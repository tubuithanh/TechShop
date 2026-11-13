import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'react-bootstrap-icons';
import StaffReportView from '../../components/admin/StaffReportView';
import { staffReportService } from '../../services/staffReportService';

// "Báo cáo của tôi" - mỗi nhân viên xem hiệu suất, sản lượng, đánh giá của chính mình
export function MyReportPage() {
  const load = useCallback((params) => staffReportService.me(params), []);
  return <div className="container-fluid"><StaffReportView load={load} /></div>;
}

// Quản lý / admin xem báo cáo chi tiết 1 nhân viên
export function StaffReportDetailPage() {
  const { id } = useParams();
  const load = useCallback((params) => staffReportService.staff(id, params), [id]);
  return (
    <div className="container-fluid">
      <Link to="/admin/staff-reports" className="small d-inline-flex align-items-center gap-1 mb-2"><ArrowLeft /> Báo cáo nhân viên</Link>
      <StaffReportView load={load} />
    </div>
  );
}
