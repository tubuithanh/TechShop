import { useEffect, useState } from 'react';
import { Card, Form, Table, Button, Modal, Row, Col, Badge, Alert, Spinner } from 'react-bootstrap';
import { PencilSquare, Image as ImageIcon } from 'react-bootstrap-icons';
import api from '../../services/api';
import { warrantyService } from '../../services/warrantyService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';
import { resizeImageToDataUrl } from '../../utils/imageUpload';
import {
  RETURN_REASON_OPTIONS,
  WARRANTY_STATUS_LABEL,
  WARRANTY_STATUS_VARIANT,
  WARRANTY_STATUS_OPTIONS,
  MAX_WARRANTY_IMAGES
} from '../../constants/warranty';

export default function AdminWarrantiesPage() {
  const [warranties, setWarranties] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;

  const [editing, setEditing] = useState(null); // phiếu bảo hành đang sửa
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);

  const loadWarranties = () =>
    api.get('/warranties/admin/all', { params: { page, limit: pageSize } }).then((res) => {
      setWarranties(res.data.data);
      setTotalPages(res.data.totalPages || 1);
      setTotal(res.data.total || 0);
    });

  useEffect(() => {
    loadWarranties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const handleChangeStatus = async (id, status) => {
    await api.put(`/warranties/${id}/status`, { status, note: `Cập nhật: ${WARRANTY_STATUS_LABEL[status]}` });
    loadWarranties();
  };

  const openEdit = (w) => {
    setSaveError('');
    setEditing(w);
    setEditForm({
      issueDescription: w.issueDescription || '',
      returnReason: w.returnReason || RETURN_REASON_OPTIONS[0].value,
      status: w.status,
      cost: w.cost || 0,
      note: '',
      images: w.images || []
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const handleEditFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remainingSlots = MAX_WARRANTY_IMAGES - editForm.images.length;
    if (remainingSlots <= 0) {
      setSaveError(`Chỉ được đính kèm tối đa ${MAX_WARRANTY_IMAGES} ảnh`);
      return;
    }
    const filesToUpload = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setSaveError(`Chỉ còn ${remainingSlots} chỗ trống, ${files.length - remainingSlots} ảnh cuối sẽ không được tải lên`);
    } else {
      setSaveError('');
    }
    setUploadingImages(true);
    try {
      const dataUrls = await Promise.all(filesToUpload.map((f) => resizeImageToDataUrl(f)));
      setEditForm((prev) => ({ ...prev, images: [...prev.images, ...dataUrls] }));
    } catch (err) {
      setSaveError(err.message || 'Tải ảnh lên thất bại');
    } finally {
      setUploadingImages(false);
    }
  };

  const removeEditImage = (idx) => {
    setEditForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await warrantyService.updateWarranty(editing._id, editForm);
      closeEdit();
      loadWarranties();
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Không thể lưu thay đổi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="fs-4 fw-bold mb-4">Quản lý yêu cầu bảo hành</h1>
      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Mã phiếu</th>
              <th className="p-3">Khách hàng</th>
              <th className="p-3">Sản phẩm</th>
              <th className="p-3">Ảnh</th>
              <th className="p-3">Mô tả lỗi</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {warranties.map((w) => (
              <tr key={w._id}>
                <td className="p-3">{w.ticketCode}</td>
                <td className="p-3">
                  {w.userId?.displayName}
                  <div className="small text-muted">{w.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{w.productId?.title}</td>
                <td className="p-3">
                  {w.images?.length > 0 ? (
                    <img src={w.images[0]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <span className="text-muted small d-flex align-items-center gap-1">
                      <ImageIcon /> —
                    </span>
                  )}
                </td>
                <td className="p-3 text-truncate" style={{ maxWidth: '18rem' }}>
                  {w.issueDescription}
                </td>
                <td className="p-3">
                  <Form.Select
                    size="sm"
                    value={w.status}
                    onChange={(e) => handleChangeStatus(w._id, e.target.value)}
                  >
                    {WARRANTY_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {WARRANTY_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Form.Select>
                </td>
                <td className="p-3">
                  <Button variant="outline-primary" size="sm" onClick={() => openEdit(w)}>
                    <PencilSquare className="me-1" /> Sửa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card.Body className="pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </Card.Body>
      </Card>

      <Modal show={!!editing} onHide={closeEdit} centered size="lg">
        {editing && editForm && (
          <Form onSubmit={handleSaveEdit}>
            <Modal.Header closeButton>
              <Modal.Title className="fs-6">Chỉnh sửa phiếu bảo hành #{editing.ticketCode}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {saveError && <Alert variant="danger" className="small py-2">{saveError}</Alert>}

              <div className="small text-muted mb-3">
                Khách hàng: <strong>{editing.userId?.displayName}</strong> — Sản phẩm:{' '}
                <strong>{editing.productId?.title || editing.productName}</strong>
              </div>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-medium mb-2">
                  Hình ảnh minh chứng ({editForm.images.length}/{MAX_WARRANTY_IMAGES})
                </Form.Label>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Form.Control
                    type="file"
                    accept="image/*"
                    multiple
                    size="sm"
                    disabled={uploadingImages || editForm.images.length >= MAX_WARRANTY_IMAGES}
                    onChange={handleEditFileUpload}
                    style={{ maxWidth: 260 }}
                  />
                  {uploadingImages && <Spinner animation="border" size="sm" />}
                  <span className="text-muted small">
                    {editForm.images.length >= MAX_WARRANTY_IMAGES
                      ? `Đã đạt giới hạn ${MAX_WARRANTY_IMAGES} ảnh`
                      : 'Thêm ảnh minh chứng lỗi/tình trạng sản phẩm'}
                  </span>
                </div>
                {editForm.images.length > 0 ? (
                  <div className="d-flex gap-2 flex-wrap">
                    {editForm.images.map((img, i) => (
                      <div key={i} className="position-relative">
                        <a href={img} target="_blank" rel="noreferrer">
                          <img
                            src={img}
                            alt={`Ảnh ${i + 1}`}
                            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                            className="border"
                          />
                        </a>
                        <Button
                          variant="danger"
                          size="sm"
                          className="position-absolute top-0 end-0 rounded-circle p-0 d-flex align-items-center justify-content-center"
                          style={{ width: 20, height: 20, transform: 'translate(30%, -30%)', fontSize: 12 }}
                          onClick={() => removeEditImage(i)}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted small d-flex align-items-center gap-1">
                    <ImageIcon /> Chưa có ảnh nào được đính kèm
                  </div>
                )}
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-medium">Mô tả lỗi / tình trạng sản phẩm</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={editForm.issueDescription}
                  onChange={(e) => setEditForm({ ...editForm, issueDescription: e.target.value })}
                />
              </Form.Group>

              <Row className="g-3 mb-3">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-medium">Lý do trả hàng / bảo hành</Form.Label>
                    <Form.Select
                      value={editForm.returnReason}
                      onChange={(e) => setEditForm({ ...editForm, returnReason: e.target.value })}
                    >
                      {RETURN_REASON_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-medium">Chi phí sửa chữa (đ)</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      value={editForm.cost}
                      onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-medium">Trạng thái</Form.Label>
                    <Form.Select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      {WARRANTY_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {WARRANTY_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-medium">Thêm ghi chú xử lý</Form.Label>
                    <Form.Control
                      value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      placeholder="VD: Đã liên hệ khách, hẹn lịch nhận máy..."
                    />
                  </Form.Group>
                </Col>
              </Row>

              {editForm.status !== editing.status && (
                <div className="mt-2">
                  <Badge bg={WARRANTY_STATUS_VARIANT[editForm.status]}>
                    Sẽ chuyển sang: {WARRANTY_STATUS_LABEL[editForm.status]}
                  </Badge>
                </div>
              )}

              {editForm.note && editForm.note.trim() && (
                <Alert variant="info" className="small py-2 mt-3 mb-0">
                  Ghi chú này sẽ được lưu vào lịch sử xử lý khi bạn bấm "Lưu thay đổi".
                </Alert>
              )}

              {editing.statusHistory?.length > 0 && (
                <div className="mt-3">
                  <div className="small fw-medium mb-2">Lịch sử xử lý</div>
                  <div className="d-flex flex-column gap-2" style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {[...editing.statusHistory]
                      .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
                      .map((h, i) => (
                        <div key={i} className="small border-start border-3 ps-2" style={{ borderColor: 'var(--bs-primary)' }}>
                          <div className="d-flex align-items-center gap-2">
                            <Badge bg={WARRANTY_STATUS_VARIANT[h.status] || 'secondary'}>
                              {WARRANTY_STATUS_LABEL[h.status] || h.status}
                            </Badge>
                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                              {new Date(h.changedAt).toLocaleString('vi-VN')}
                              {h.changedBy?.name ? ` — ${h.changedBy.name}` : ''}
                            </span>
                          </div>
                          {h.note && <div className="text-muted mt-1">{h.note}</div>}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={closeEdit}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
