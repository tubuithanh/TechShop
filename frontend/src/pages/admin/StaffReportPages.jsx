import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'react-bootstrap-icons';
import StaffReportView from '../../components/admin/StaffReportView';
import { staffReportService } from '../../services/staffReportService';
import { useAuth } from '../../store/AuthContext';

// "Báo cáo của tôi" - mỗi nhân viên xem hiệu suất, sản lượng, đánh giá + phân tích bán hàng của chính mình
// (nhân viên KHÔNG tự đặt chỉ tiêu - quản lý đặt)
export function MyReportPage() {
  const load = useCallback((params) => staffReportService.me(params), []);
  const loadSales = useCallback((params) => staffReportService.mySales(params), []);
  return <div className="container-fluid"><StaffReportView load={load} loadSales={loadSales} canSetTarget={false} /></div>;
}

// Quản lý / admin xem báo cáo chi tiết 1 nhân viên (được đặt chỉ tiêu tháng; backend kiểm tra lại quyền quản lý)
export function StaffReportDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const load = useCallback((params) => staffReportService.staff(id, params), [id]);
  const loadSales = useCallback((params) => staffReportService.staffSales(id, params), [id]);
  return (
    <div className="container-fluid">
      <Link to="/admin/staff-reports" className="small d-inline-flex align-items-center gap-1 mb-2"><ArrowLeft /> Báo cáo nhân viên</Link>
      <StaffReportView load={load} loadSales={loadSales} canSetTarget={String(user?._id) !== String(id)} />
    </div>
  );
}
