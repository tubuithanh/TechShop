import { useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge, Alert, ProgressBar } from 'react-bootstrap';
import { promotionService } from '../../services/promotionService';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';
import { useAuth } from '../../store/AuthContext';
import { useScopeOptions, MultiPicker, ScopeSummary, searchProducts, idsOf, labelsOf } from '../../components/admin/ScopePicker';
import AuditStamp from '../../components/admin/AuditStamp';

// Ngày bắt đầu = 00:00, ngày kết thúc = 23:59:59 (giờ máy người dùng) - giống trang mã giảm giá
const toDayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const toDayEnd = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);
const toInputDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';

const SCOPES = [
  { value: 'all', label: 'Tất cả sản phẩm' },
  { value: 'categories', label: 'Theo danh mục / loại sản phẩm' },
  { value: 'brands', label: 'Theo thương hiệu' },
  { value: 'products', label: 'Từng sản phẩm' }
];

const emptyForm = {
  name: '',
  campaign: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscountPerItem: '',
  scope: 'all',
  categoryIds: [],
  brandIds: [],
  productIds: [],
  storeIds: [],
  tierKeys: [],
  usageLimit: 0,
  budget: 0,
  startDate: '',
  endDate: ''
};

function statusOf(p) {
  const now = Date.now();
  if (!p.isActive) return { bg: 'secondary', label: 'Đã tắt' };
  if (new Date(p.startDate) > now) return { bg: 'info', label: 'Sắp diễn ra' };
  if (new Date(p.endDate) < now) return { bg: 'dark', label: 'Đã kết thúc' };
  if ((p.usageLimit && p.usedCount >= p.usageLimit) || (p.budget && p.usedAmount >= p.budget)) return { bg: 'warning', label: 'Hết suất / ngân sách' };
  return { bg: 'success', label: 'Đang chạy' };
}

export default function AdminPromotionsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const scopeOptions = useScopeOptions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [productLabels, setProductLabels] = useState({});
  const query = useListQuery(['state']);
  const { q, state } = query.apiParams;
  const { data: promotions, total, loading, reload } = useAdminList(promotionService.getAll, { q, state });
  const filters = [
    {
      key: 'state',
      label: 'Tình trạng',
      options: [
        { value: 'running', label: 'Đang chạy' },
        { value: 'upcoming', label: 'Sắp diễn ra' },
        { value: 'expired', label: 'Đã kết thúc' },
        { value: 'disabled', label: 'Đã tắt' }
      ]
    }
  ];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const openForm = (p = null) => {
    setEditingId(p?._id || null);
    setFormError('');
    setProductLabels(labelsOf(p?.productIds, 'title'));
    setForm(p ? {
      ...emptyForm,
      ...p,
      maxDiscountPerItem: p.maxDiscountPerItem ?? '',
      categoryIds: idsOf(p.categoryIds),
      brandIds: idsOf(p.brandIds),
      productIds: idsOf(p.productIds),
      storeIds: idsOf(p.storeIds),
      tierKeys: p.tierKeys || [],
      startDate: toInputDate(p.startDate),
      endDate: toInputDate(p.endDate)
    } : emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const payload = {
      name: form.name,
      campaign: form.campaign,
      description: form.description,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      maxDiscountPerItem: form.discountType === 'percent' && form.maxDiscountPerItem !== '' ? Number(form.maxDiscountPerItem) : null,
      scope: form.scope,
      categoryIds: form.categoryIds,
      brandIds: form.brandIds,
      productIds: form.productIds,
      storeIds: form.storeIds,
      tierKeys: form.tierKeys,
      usageLimit: Number(form.usageLimit) || 0,
      budget: Number(form.budget) || 0,
      startDate: toDayStart(form.startDate),
      endDate: toDayEnd(form.endDate)
    };
    try {
      if (editingId) await promotionService.update(editingId, payload);
      else await promotionService.create(payload);
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Không lưu được chương trình');
    }
  };

  const toggle = async (p) => {
    try {
      if (p.isActive) {
        if (!window.confirm(`Tắt chương trình "${p.name}"?`)) return;
        await promotionService.remove(p._id);
      } else {
        await promotionService.update(p._id, { isActive: true });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Không cập nhật được');
    }
    reload();
  };

  const describe = (p) => (p.discountType === 'percent'
    ? `-${p.discountValue}%${p.maxDiscountPerItem ? ` (tối đa ${formatVND(p.maxDiscountPerItem)}/sp)` : ''}`
    : `-${formatVND(p.discountValue)}/sp`);

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <h1 className="fs-4 fw-bold mb-0">Chương trình khuyến mãi</h1>
        {canEdit && <Button onClick={() => openForm()}>+ Tạo chương trình</Button>}
      </div>
      <p className="text-muted small mb-4">
        Giảm giá tự động, khách không cần nhập mã. Mỗi sản phẩm chỉ nhận chương trình có mức giảm cao nhất;
        mã giảm giá (voucher) được trừ thêm sau khuyến mãi.
      </p>

      <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa chương trình' : 'Tạo chương trình khuyến mãi'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {formError && <Alert variant="danger" className="small py-2">{formError}</Alert>}
            <Row className="g-3">
              <Col md={7}>
                <Form.Group>
                  <Form.Label>Tên chương trình</Form.Label>
                  <Form.Control required placeholder="VD: Back to School 2026" value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={5}>
                <Form.Group>
                  <Form.Label>Chiến dịch marketing / kênh</Form.Label>
                  <Form.Control placeholder="VD: Facebook Ads, Email T11" value={form.campaign} onChange={(e) => set({ campaign: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Loại giảm</Form.Label>
                  <Form.Select value={form.discountType} onChange={(e) => set({ discountType: e.target.value })}>
                    <option value="percent">Giảm theo %</option>
                    <option value="fixed">Giảm số tiền / sản phẩm</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>{form.discountType === 'percent' ? 'Phần trăm giảm' : 'Số tiền giảm mỗi sản phẩm'}</Form.Label>
                  <Form.Control required type="number" min={1} value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />
                </Form.Group>
              </Col>
              {form.discountType === 'percent' && (
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Giảm tối đa / sản phẩm</Form.Label>
                    <Form.Control type="number" min={1} placeholder="Không giới hạn" value={form.maxDiscountPerItem} onChange={(e) => set({ maxDiscountPerItem: e.target.value })} />
                  </Form.Group>
                </Col>
              )}

              <Col md={12}>
                <div className="border rounded-3 p-3">
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-medium">Áp dụng cho</Form.Label>
                    <div className="d-flex flex-wrap gap-3">
                      {SCOPES.map((s) => (
                        <Form.Check key={s.value} type="radio" id={`scope-${s.value}`} name="scope" label={s.label}
                          checked={form.scope === s.value} onChange={() => set({ scope: s.value })} />
                      ))}
                    </div>
                  </Form.Group>
                  {form.scope === 'categories' && (
                    <MultiPicker value={form.categoryIds} onChange={(v) => set({ categoryIds: v })} options={scopeOptions.categories} placeholder="Tìm danh mục..." />
                  )}
                  {form.scope === 'brands' && (
                    <MultiPicker value={form.brandIds} onChange={(v) => set({ brandIds: v })} options={scopeOptions.brands} placeholder="Tìm thương hiệu..." />
                  )}
                  {form.scope === 'products' && (
                    <MultiPicker value={form.productIds} onChange={(v) => set({ productIds: v })} search={searchProducts} labels={productLabels} placeholder="Gõ tên sản phẩm..." emptyText="Không tìm thấy sản phẩm" />
                  )}
                </div>
              </Col>

              <Col md={6}>
                <Form.Label className="small fw-medium">Chi nhánh (trống = mọi chi nhánh)</Form.Label>
                <MultiPicker value={form.storeIds} onChange={(v) => set({ storeIds: v })} options={scopeOptions.stores} placeholder="Tìm chi nhánh..." />
              </Col>
              <Col md={6}>
                <Form.Label className="small fw-medium">Hạng khách hàng (trống = mọi khách)</Form.Label>
                <MultiPicker value={form.tierKeys} onChange={(v) => set({ tierKeys: v })} options={scopeOptions.tiers} placeholder="Tìm hạng..." />
                {form.tierKeys.length > 0 && <Form.Text className="text-muted">Khách vãng lai (không có tài khoản) sẽ không được hưởng.</Form.Text>}
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Số suất (số đơn tối đa)</Form.Label>
                  <Form.Control type="number" min={0} value={form.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} />
                  <Form.Text className="text-muted">0 = không giới hạn{editingId && form.usedCount ? ` · đã dùng ${form.usedCount}` : ''}</Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Ngân sách (tổng tiền giảm tối đa)</Form.Label>
                  <Form.Control type="number" min={0} value={form.budget} onChange={(e) => set({ budget: e.target.value })} />
                  <Form.Text className="text-muted">0 = không giới hạn{editingId && form.usedAmount ? ` · đã dùng ${formatVND(form.usedAmount)}` : ''}</Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Ngày bắt đầu</Form.Label>
                  <Form.Control required type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Ngày kết thúc (áp dụng hết ngày này)</Form.Label>
                  <Form.Control required type="date" value={form.endDate} min={form.startDate} onChange={(e) => set({ endDate: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Mô tả</Form.Label>
                  <Form.Control as="textarea" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button type="submit" variant="success">{editingId ? 'Lưu thay đổi' : 'Tạo chương trình'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <AdminSearchBar query={query} placeholder="Tên chương trình, chiến dịch..." filters={filters} total={total} loading={loading} />
      <div className="bg-white rounded-3 shadow-sm">
        <Table hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Chương trình</th>
              <th>Mức giảm</th>
              <th>Phạm vi</th>
              <th>Thời gian</th>
              <th className="text-end">Hiệu quả</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {promotions.map((p) => {
              const st = statusOf(p);
              return (
                <tr key={p._id}>
                  <td>
                    <div className="fw-medium">{p.name}</div>
                    {p.campaign && <Badge bg="light" text="dark" className="fw-normal border">{p.campaign}</Badge>}
                  <AuditStamp audit={p.audit} /></td>
                  <td className="text-nowrap fw-medium text-danger">{describe(p)}</td>
                  <td className="small" style={{ maxWidth: 240 }}><ScopeSummary v={p} tiers={scopeOptions.tiers} /></td>
                  <td className="small text-nowrap">
                    {new Date(p.startDate).toLocaleDateString('vi-VN')} – {new Date(p.endDate).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="text-end small text-nowrap">
                    <div title="Đơn đã giao / số suất đang giữ (kể cả đơn chưa giao)">
                      {p.stats?.orders || 0} đơn giao · giữ {p.usedCount || 0}{p.usageLimit ? `/${p.usageLimit}` : ''} suất
                    </div>
                    <div className="text-muted">
                      đã giảm {formatVND(p.usedAmount)}{p.budget ? ` / ${formatVND(p.budget)}` : ''}
                    </div>
                    {p.budget > 0 && <ProgressBar now={Math.min(100, ((p.usedAmount || 0) / p.budget) * 100)} variant={(p.usedAmount || 0) >= p.budget ? 'danger' : 'warning'} style={{ height: 4 }} className="mt-1" />}
                  </td>
                  <td><Badge bg={st.bg}>{st.label}</Badge></td>
                  <td className="text-nowrap">
                    {canEdit && (
                      <>
                        <Button size="sm" variant="outline-primary" className="me-1" onClick={() => openForm(p)}>Sửa</Button>
                        <Button size="sm" variant={p.isActive ? 'outline-danger' : 'outline-success'} onClick={() => toggle(p)}>
                          {p.isActive ? 'Tắt' : 'Bật lại'}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && promotions.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted p-4">Chưa có chương trình khuyến mãi nào</td></tr>
            )}
          </tbody>
        </Table>
      </div>
    </Container>
  );
}
