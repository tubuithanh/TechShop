// QUẢN LÝ YÊU CẦU BẢO HÀNH: thanh quy trình (số phiếu từng bước), phiếu quá hạn / của tôi / chưa phân công,
// nút "bước tiếp theo" trên từng phiếu (hỏi ghi chú, chi phí khi sửa xong), phân công kỹ thuật viên ngay trên dòng,
// sửa chi tiết phiếu (ảnh, mô tả, chi phí, lịch sử xử lý).
import { useEffect, useState } from 'react';
import CreateCounterWarranty from '../../components/admin/CreateCounterWarranty';
import { Card, Form, Table, Button, Modal, Row, Col, Badge, Alert, Spinner, Nav, InputGroup } from 'react-bootstrap';
import { PencilSquare, Image as ImageIcon, TelephoneFill, ExclamationTriangleFill, PersonCheck, PersonX, Tools, PlusCircle, ArrowRight } from 'react-bootstrap-icons';
import api from '../../services/api';
import { warrantyService } from '../../services/warrantyService';
import { useSettings } from '../../store/SettingsContext';
import { useAuth } from '../../store/AuthContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';
import { resizeImageToDataUrl } from '../../utils/imageUpload';
import AuditStamp from '../../components/admin/AuditStamp';
import {
  RETURN_REASON_OPTIONS,
  WARRANTY_STATUS_LABEL,
  WARRANTY_STATUS_VARIANT,
  warrantyStatusChoices,
  WARRANTY_METHOD_LABEL,
  WARRANTY_NEXT,
  MAX_WARRANTY_IMAGES
} from '../../constants/warranty';

// Tình trạng bảo hành ghi lại lúc tiếp nhận phiếu (phiếu cũ trước khi có tính năng: không có)
const COVERAGE = {
  in_warranty: { label: 'Trong bảo hành', bg: 'success' },
  manufacturer: { label: 'Bảo hành hãng', bg: 'info' },
  out_of_warranty: { label: 'Sửa dịch vụ (tính phí)', bg: 'warning' }
};
// Tab quy trình: [khóa status gửi API, nhãn, khóa số đếm]
const FLOW = [
  ['open', 'Đang xử lý', 'open'],
  ['received', 'Tiếp nhận', 'received'],
  ['checking', 'Kiểm tra', 'checking'],
  ['repairing', 'Sửa chữa', 'repairing'],
  ['waiting_parts', 'Chờ linh kiện', 'waiting_parts'],
  ['done', 'Xong - chờ trả máy', 'done'],
  ['returned', 'Đã trả máy', 'returned'],
  ['', 'Tất cả', null]
];
// Tên nút cho từng bước tiếp theo
const NEXT_LABEL = { checking: 'Bắt đầu kiểm tra', repairing: 'Bắt đầu sửa', waiting_parts: 'Chờ linh kiện', done: 'Đã sửa xong', returned: 'Đã trả máy cho khách' };
const NEXT_VARIANT = { checking: 'primary', repairing: 'primary', waiting_parts: 'outline-warning', done: 'success', returned: 'outline-success' };
const vnd = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const ageDays = (d) => Math.floor((Date.now() - new Date(d)) / 86400000);

function CoverageCell({ w }) {
  const c = COVERAGE[w.coverage?.type];
  if (!c) return <span className="text-muted">—</span>;
  return (
    <>
      <Badge bg={c.bg} text={c.bg === 'warning' || c.bg === 'info' ? 'dark' : undefined} className="fw-normal">{c.label}</Badge>
      {w.coverage.endDate && <div className="text-muted mt-1">HSD {new Date(w.coverage.endDate).toLocaleDateString('vi-VN')}</div>}
      {w.coverage.serial && <div className="text-muted">IMEI {w.coverage.serial}</div>}
      {w.coverage.type === 'manufacturer' && w.coverage.providerName && <div className="text-muted">{w.coverage.providerName}{w.coverage.providerPhone ? ` · ${w.coverage.providerPhone}` : ''}</div>}
    </>
  );
}

export default function AdminWarrantiesPage() {
  const [creating, setCreating] = useState(false);
  const { settings } = useSettings();
  const { user } = useAuth();
  const pageSize = settings.productsPerPage || 20;
  const query = useListQuery(['status', 'method', 'coverage', 'assigned']);
  const { data: warranties, total, totalPages, loading, meta, reload: loadWarranties } = useAdminList(
    (params) => api.get('/warranties/admin/all', { params }).then((res) => res.data),
    { ...query.apiParams, status: query.values.status === 'all' ? undefined : query.values.status || 'open', limit: pageSize }
  );
  const page = query.values.page;
  const setPage = query.setPage;
  const tab = query.values.status === 'all' ? '' : query.values.status || 'open'; // mặc định: phiếu đang xử lý
  const counts = meta?.counts || {};
  const filters = [
    { key: 'method', label: 'Hình thức', options: Object.entries(WARRANTY_METHOD_LABEL).map(([value, label]) => ({ value, label })) },
    { key: 'coverage', label: 'Tình trạng bảo hành', options: Object.entries(COVERAGE).map(([value, c]) => ({ value, label: c.label })) }
  ];

  const [techs, setTechs] = useState([]); // người phân công được
  useEffect(() => { api.get('/warranties/admin/technicians').then((r) => setTechs(r.data.data)).catch(() => setTechs([])); }, []);
  const [notice, setNotice] = useState(null);

  // ----- Chuyển bước (hộp thoại nhỏ: ghi chú; khi "Đã sửa xong" nhập thêm chi phí)
  const [stepping, setStepping] = useState(null); // { w, status }
  const [stepNote, setStepNote] = useState('');
  const [stepCost, setStepCost] = useState('');
  const [stepBusy, setStepBusy] = useState(false);
  const openStep = (w, status) => { setStepping({ w, status }); setStepNote(''); setStepCost(w.cost ? String(w.cost) : ''); };
  const submitStep = async (e) => {
    e.preventDefault();
    setStepBusy(true);
    try {
      const body = { status: stepping.status, note: stepNote.trim() || `Cập nhật: ${WARRANTY_STATUS_LABEL[stepping.status]}` };
      if (stepping.status === 'done' && stepCost !== '') body.cost = Number(String(stepCost).replace(/\D/g, '')) || 0;
      await api.put(`/warranties/${stepping.w._id}/status`, body);
      setNotice({ tone: 'success', text: `Phiếu ${stepping.w.ticketCode} → ${WARRANTY_STATUS_LABEL[stepping.status]}` });
      setStepping(null);
      loadWarranties();
    } catch (err) {
      setNotice({ tone: 'danger', text: err.response?.data?.message || 'Không cập nhật được trạng thái' });
    } finally { setStepBusy(false); }
  };

  // ----- Phân công nhanh
  const assign = async (w, assignedTo) => {
    try {
      await warrantyService.updateWarranty(w._id, { assignedTo: assignedTo || null });
      setNotice({ tone: 'success', text: assignedTo ? `Đã giao phiếu ${w.ticketCode} cho ${techs.find((t) => t._id === assignedTo)?.name}` : `Đã gỡ người phụ trách phiếu ${w.ticketCode}` });
      loadWarranties();
    } catch (err) { setNotice({ tone: 'danger', text: err.response?.data?.message || 'Không phân công được' }); }
  };

  // ----- Sửa chi tiết phiếu
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const openEdit = (w) => {
    setSaveError('');
    setEditing(w);
    setEditForm({
      issueDescription: w.issueDescription || '', returnReason: w.returnReason || RETURN_REASON_OPTIONS[0].value,
      status: w.status, cost: w.cost || 0, note: '', images: w.images || [], assignedTo: w.assignedTo?._id || w.assignedTo || ''
    });
  };
  const closeEdit = () => { setEditing(null); setEditForm(null); };
  const handleEditFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remainingSlots = MAX_WARRANTY_IMAGES - editForm.images.length;
    if (remainingSlots <= 0) { setSaveError(`Chỉ được đính kèm tối đa ${MAX_WARRANTY_IMAGES} ảnh`); return; }
    const filesToUpload = files.slice(0, remainingSlots);
    setSaveError(files.length > remainingSlots ? `Chỉ còn ${remainingSlots} chỗ trống, ${files.length - remainingSlots} ảnh cuối sẽ không được tải lên` : '');
    setUploadingImages(true);
    try {
      const dataUrls = await Promise.all(filesToUpload.map((f) => resizeImageToDataUrl(f)));
      setEditForm((prev) => ({ ...prev, images: [...prev.images, ...dataUrls] }));
    } catch (err) { setSaveError(err.message || 'Tải ảnh lên thất bại'); } finally { setUploadingImages(false); }
  };
  const removeEditImage = (idx) => setEditForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      await warrantyService.updateWarranty(editing._id, { ...editForm, assignedTo: editForm.assignedTo || null });
      closeEdit(); loadWarranties();
    } catch (err) { setSaveError(err.response?.data?.message || 'Không thể lưu thay đổi'); } finally { setSaving(false); }
  };

  const setTab = (k) => query.update({ status: k === '' ? 'all' : k === 'open' ? '' : k });
  const od = meta?.overdueDays || 7;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="flex-grow-1">
          <h1 className="fs-4 fw-bold mb-0"><Tools className="me-2" />Quản lý yêu cầu bảo hành</h1>
          <div className="small text-muted">Tiếp nhận → Kiểm tra → Sửa chữa / Chờ linh kiện → Sửa xong → Trả máy cho khách</div>
        </div>
        <Button onClick={() => setCreating(true)}><PlusCircle className="me-1" />Tiếp nhận tại cửa hàng</Button>
      </div>
      {creating && <CreateCounterWarranty onHide={() => setCreating(false)} onDone={() => { setCreating(false); loadWarranties(); }} />}
      {notice && <Alert variant={notice.tone} dismissible onClose={() => setNotice(null)} className="py-2">{notice.text}</Alert>}

      {/* Ô việc cần chú ý */}
      <Row xs={1} sm={3} className="g-2 mb-3">
        {[
          ['overdue', `Quá hạn (> ${od} ngày)`, meta?.overdue || 0, 'danger', ExclamationTriangleFill, () => query.update({ status: 'overdue', assigned: '' })],
          ['me', 'Phiếu tôi phụ trách', meta?.mine || 0, 'primary', PersonCheck, () => query.update({ status: '', assigned: 'me' })],
          ['none', 'Chưa phân công', meta?.unassigned || 0, 'warning', PersonX, () => query.update({ status: '', assigned: 'none' })]
        ].map(([key, label, n, tone, Icon, onClick]) => {
          const active = key === 'overdue' ? query.values.status === 'overdue' : query.values.assigned === key;
          return (
            <Col key={key}>
              <Card role="button" onClick={active ? () => query.update({ status: '', assigned: '' }) : onClick} className={`h-100 shadow-sm ${active ? `border-${tone} border-2` : 'border-0'} ${n ? `bg-${tone}-subtle` : ''}`}>
                <Card.Body className="py-2 d-flex align-items-center gap-3">
                  <Icon className={`fs-4 text-${n ? tone : 'secondary'}`} />
                  <div><div className="small text-muted">{label}</div><div className="fs-4 fw-bold lh-sm">{n}</div></div>
                  {active && <Badge bg={tone} className="ms-auto">Đang lọc · bấm để bỏ</Badge>}
                </Card.Body>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Thanh quy trình */}
      {query.values.status !== 'overdue' && (
        <Nav variant="pills" className="flex-nowrap overflow-auto gap-1 mb-2 pb-1" activeKey={tab} onSelect={(k) => setTab(k)}>
          {FLOW.map(([k, label, ck], i) => (
            <Nav.Item key={k || 'all'} className="d-flex align-items-center">
              {i > 1 && i < FLOW.length - 1 && <ArrowRight className="text-muted mx-1" size={12} />}
              <Nav.Link eventKey={k} className="py-1 px-2 text-nowrap">{label}{ck && <Badge bg={tab === k ? 'light' : 'secondary'} text={tab === k ? 'dark' : undefined} className="ms-1">{counts[ck] || 0}</Badge>}</Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
      )}
      <AdminSearchBar query={query} placeholder="Mã phiếu, mã đơn, SĐT, tên sản phẩm..." filters={filters} total={total} loading={loading} />

      <Card className="shadow-sm">
        <Table hover responsive className="mb-0 align-middle small">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Phiếu</th><th className="p-3">Khách hàng</th><th className="p-3">Sản phẩm & lỗi</th><th className="p-3">Bảo hành</th>
              <th className="p-3">Phụ trách</th><th className="p-3">Trạng thái</th><th className="p-3 text-end">Bước tiếp theo</th>
            </tr>
          </thead>
          <tbody>
            {warranties.map((w) => {
              const open = !['done', 'returned'].includes(w.status);
              const days = ageDays(w.createdAt);
              const next = WARRANTY_NEXT[w.status] || [];
              const phone = w.userId?.phoneNumber || w.customerPhone;
              return (
                <tr key={w._id} className={open && days > od ? 'table-danger' : ''}>
                  <td className="p-3">
                    <div className="fw-semibold">{w.ticketCode}</div>
                    <div className="text-muted">{new Date(w.createdAt).toLocaleDateString('vi-VN')}</div>
                    {open && <Badge bg={days > od ? 'danger' : days > od / 2 ? 'warning' : 'light'} text={days > od ? undefined : 'dark'} className="fw-normal border">{days === 0 ? 'Hôm nay' : `Tồn ${days} ngày`}</Badge>}
                    <div className="text-muted">{WARRANTY_METHOD_LABEL[w.method] || ''}</div>
                    <AuditStamp audit={w.audit} />
                  </td>
                  <td className="p-3">
                    <div className="fw-medium">{w.userId?.displayName || w.customerName}</div>
                    {phone && <a href={`tel:${phone}`} className="text-decoration-none"><TelephoneFill className="me-1" size={11} />{phone}</a>}
                  </td>
                  <td className="p-3" style={{ maxWidth: 280 }}>
                    <div className="d-flex gap-2">
                      {w.images?.length > 0
                        ? <a href={w.images[0]} target="_blank" rel="noreferrer" className="flex-shrink-0 position-relative"><img src={w.images[0]} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />{w.images.length > 1 && <Badge bg="dark" pill className="position-absolute top-0 start-100 translate-middle">{w.images.length}</Badge>}</a>
                        : <span className="text-muted flex-shrink-0 d-flex align-items-center justify-content-center border rounded" style={{ width: 40, height: 40 }}><ImageIcon /></span>}
                      <div className="min-w-0">
                        <div className="fw-medium text-truncate">{w.productId?.title || w.productName}</div>
                        <div className="text-muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={w.issueDescription}>{w.issueDescription}</div>
                        {w.cost > 0 && <div className="text-success fw-medium">Chi phí: {vnd(w.cost)}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3"><CoverageCell w={w} /></td>
                  <td className="p-3" style={{ minWidth: 150 }}>
                    <Form.Select size="sm" value={w.assignedTo?._id || w.assignedTo || ''} onChange={(e) => assign(w, e.target.value)} aria-label="Người phụ trách" className={!w.assignedTo && open ? 'border-warning' : ''}>
                      <option value="">— Chưa phân công —</option>
                      {techs.map((t) => <option key={t._id} value={t._id}>{t._id === user?._id ? `${t.name} (tôi)` : t.name}</option>)}
                      {w.assignedTo?._id && !techs.some((t) => t._id === w.assignedTo._id) && <option value={w.assignedTo._id}>{w.assignedTo.name}</option>}
                    </Form.Select>
                  </td>
                  <td className="p-3"><Badge bg={WARRANTY_STATUS_VARIANT[w.status] || 'secondary'} text={['info', 'warning'].includes(WARRANTY_STATUS_VARIANT[w.status]) ? 'dark' : undefined}>{WARRANTY_STATUS_LABEL[w.status]}</Badge></td>
                  <td className="p-3 text-end">
                    <div className="d-flex flex-wrap gap-1 justify-content-end">
                      {next.map((s) => <Button key={s} size="sm" variant={NEXT_VARIANT[s] || 'outline-primary'} onClick={() => openStep(w, s)}>{NEXT_LABEL[s] || WARRANTY_STATUS_LABEL[s]}</Button>)}
                      <Button size="sm" variant="light" className="border" onClick={() => openEdit(w)} title="Sửa chi tiết phiếu"><PencilSquare /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && warranties.length === 0 && <tr><td colSpan={7} className="text-center text-muted p-4">Không có phiếu nào {tab === 'open' ? 'đang xử lý 🎉' : 'phù hợp'}</td></tr>}
          </tbody>
        </Table>
        <Card.Body className="pt-0"><AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} /></Card.Body>
      </Card>

      {/* Chuyển bước */}
      <Modal show={!!stepping} onHide={() => setStepping(null)} centered>
        {stepping && (
          <Form onSubmit={submitStep}>
            <Modal.Header closeButton><Modal.Title className="fs-6">Phiếu {stepping.w.ticketCode}: {WARRANTY_STATUS_LABEL[stepping.w.status]} → <b>{WARRANTY_STATUS_LABEL[stepping.status]}</b></Modal.Title></Modal.Header>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-medium">Ghi chú xử lý {stepping.status === 'waiting_parts' && '(linh kiện nào, dự kiến khi nào có)'}</Form.Label>
                <Form.Control as="textarea" rows={2} maxLength={1000} value={stepNote} onChange={(e) => setStepNote(e.target.value)} autoFocus
                  placeholder={stepping.status === 'done' ? 'VD: Đã thay màn hình, test OK' : stepping.status === 'returned' ? 'VD: Khách đã nhận máy, kiểm tra hoạt động tốt' : 'Không bắt buộc'} />
              </Form.Group>
              {stepping.status === 'done' && (
                <Form.Group>
                  <Form.Label className="small fw-medium">Chi phí sửa chữa thu của khách</Form.Label>
                  <InputGroup><Form.Control inputMode="numeric" value={stepCost ? Number(String(stepCost).replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setStepCost(e.target.value)} placeholder="0 nếu miễn phí (trong bảo hành)" /><InputGroup.Text>đ</InputGroup.Text></InputGroup>
                  {stepping.w.coverage?.type === 'out_of_warranty' && <Form.Text className="text-warning">Phiếu sửa dịch vụ (ngoài bảo hành) - nhớ nhập chi phí.</Form.Text>}
                </Form.Group>
              )}
              <div className="small text-muted mt-2">Khách hàng nhận thông báo + email về bước mới.</div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setStepping(null)}>Hủy</Button>
              <Button type="submit" variant={NEXT_VARIANT[stepping.status]?.replace('outline-', '') || 'primary'} disabled={stepBusy}>{stepBusy ? 'Đang lưu…' : NEXT_LABEL[stepping.status]}</Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>

      {/* Sửa chi tiết phiếu */}
      <Modal show={!!editing} onHide={closeEdit} centered size="lg">
        {editing && editForm && (
          <Form onSubmit={handleSaveEdit}>
            <Modal.Header closeButton><Modal.Title className="fs-6">Chỉnh sửa phiếu bảo hành #{editing.ticketCode}</Modal.Title></Modal.Header>
            <Modal.Body>
              {saveError && <Alert variant="danger" className="small py-2">{saveError}</Alert>}
              <div className="small text-muted mb-3">Khách hàng: <strong>{editing.userId?.displayName || editing.customerName}</strong> — Sản phẩm: <strong>{editing.productId?.title || editing.productName}</strong></div>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-medium mb-2">Hình ảnh minh chứng ({editForm.images.length}/{MAX_WARRANTY_IMAGES})</Form.Label>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Form.Control type="file" accept="image/*" multiple size="sm" disabled={uploadingImages || editForm.images.length >= MAX_WARRANTY_IMAGES} onChange={handleEditFileUpload} style={{ maxWidth: 260 }} />
                  {uploadingImages && <Spinner animation="border" size="sm" />}
                  <span className="text-muted small">{editForm.images.length >= MAX_WARRANTY_IMAGES ? `Đã đạt giới hạn ${MAX_WARRANTY_IMAGES} ảnh` : 'Thêm ảnh minh chứng lỗi/tình trạng sản phẩm'}</span>
                </div>
                {editForm.images.length > 0 ? (
                  <div className="d-flex gap-2 flex-wrap">
                    {editForm.images.map((img, i) => (
                      <div key={i} className="position-relative">
                        <a href={img} target="_blank" rel="noreferrer"><img src={img} alt={`Ảnh ${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} className="border" /></a>
                        <Button variant="danger" size="sm" className="position-absolute top-0 end-0 rounded-circle p-0 d-flex align-items-center justify-content-center" style={{ width: 20, height: 20, transform: 'translate(30%, -30%)', fontSize: 12 }} onClick={() => removeEditImage(i)}>✕</Button>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-muted small d-flex align-items-center gap-1"><ImageIcon /> Chưa có ảnh nào được đính kèm</div>}
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-medium">Mô tả lỗi / tình trạng sản phẩm</Form.Label>
                <Form.Control as="textarea" rows={3} maxLength={2000} value={editForm.issueDescription} onChange={(e) => setEditForm({ ...editForm, issueDescription: e.target.value })} />
              </Form.Group>

              <Row className="g-3 mb-3">
                <Col md={4}>
                  <Form.Label className="small fw-medium">Lý do trả hàng / bảo hành</Form.Label>
                  <Form.Select value={editForm.returnReason} onChange={(e) => setEditForm({ ...editForm, returnReason: e.target.value })}>
                    {RETURN_REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </Form.Select>
                </Col>
                <Col md={4}>
                  <Form.Label className="small fw-medium">Chi phí sửa chữa (đ)</Form.Label>
                  <Form.Control type="number" min={0} value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })} />
                </Col>
                <Col md={4}>
                  <Form.Label className="small fw-medium">Người phụ trách</Form.Label>
                  <Form.Select value={editForm.assignedTo} onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}>
                    <option value="">— Chưa phân công —</option>
                    {techs.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </Form.Select>
                </Col>
              </Row>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Label className="small fw-medium">Trạng thái</Form.Label>
                  <Form.Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    {warrantyStatusChoices(editing?.status || editForm.status).map((s) => <option key={s} value={s}>{WARRANTY_STATUS_LABEL[s]}</option>)}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label className="small fw-medium">Thêm ghi chú xử lý</Form.Label>
                  <Form.Control maxLength={1000} value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} placeholder="VD: Đã liên hệ khách, hẹn lịch nhận máy..." />
                </Col>
              </Row>
              {editForm.status !== editing.status && <div className="mt-2"><Badge bg={WARRANTY_STATUS_VARIANT[editForm.status]}>Sẽ chuyển sang: {WARRANTY_STATUS_LABEL[editForm.status]}</Badge></div>}

              {editing.statusHistory?.length > 0 && (
                <div className="mt-3">
                  <div className="small fw-medium mb-2">Lịch sử xử lý</div>
                  <div className="d-flex flex-column gap-2" style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {[...editing.statusHistory].sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt)).map((h, i) => (
                      <div key={i} className="small border-start border-3 ps-2" style={{ borderColor: 'var(--bs-primary)' }}>
                        <div className="d-flex align-items-center gap-2">
                          <Badge bg={WARRANTY_STATUS_VARIANT[h.status] || 'secondary'}>{WARRANTY_STATUS_LABEL[h.status] || h.status}</Badge>
                          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{new Date(h.changedAt).toLocaleString('vi-VN')}{h.changedBy?.name ? ` — ${h.changedBy.name}` : ''}</span>
                        </div>
                        {h.note && <div className="text-muted mt-1">{h.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={closeEdit}>Hủy</Button>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
