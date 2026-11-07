import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, InputGroup, ListGroup, Modal, Row, Table } from 'react-bootstrap';
import { ArrowRepeat, PencilSquare, Plus, Search, Trash } from 'react-bootstrap-icons';
import { locationService } from '../../services/locationService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';

const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();

// Quản lý tỉnh/thành phố và phường/xã - dữ liệu cho ô chọn địa chỉ ở trang đăng ký, thanh toán, sổ địa chỉ
export default function AdminLocationsPage() {
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;
  const [provinces, setProvinces] = useState([]);
  const [provinceQ, setProvinceQ] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [wards, setWards] = useState({ data: [], total: 0, totalPages: 1 });
  const [wardQ, setWardQ] = useState('');
  const [wardPage, setWardPage] = useState(1);
  const [editing, setEditing] = useState(null); // { kind: 'province'|'ward', item?, name, isActive, sortOrder }
  const [message, setMessage] = useState(null);

  const showError = (err, fallback) =>
    setMessage({ variant: 'danger', text: err.response?.data?.message || fallback });

  const loadProvinces = useCallback(async () => {
    const list = await locationService.adminGetProvinces();
    setProvinces(list);
    setSelectedId((cur) => (cur && list.some((p) => p._id === cur) ? cur : list[0]?._id || ''));
  }, []);

  const loadWards = useCallback(async () => {
    if (!selectedId) return setWards({ data: [], total: 0, totalPages: 1 });
    const res = await locationService.adminGetWards({ provinceId: selectedId, q: wardQ || undefined, page: wardPage, limit: pageSize });
    setWards(res);
  }, [selectedId, wardQ, wardPage, pageSize]);

  useEffect(() => {
    loadProvinces();
  }, [loadProvinces]);

  useEffect(() => {
    const t = setTimeout(loadWards, 250);
    return () => clearTimeout(t);
  }, [loadWards]);

  const selected = provinces.find((p) => p._id === selectedId);
  const filteredProvinces = useMemo(
    () => provinces.filter((p) => normalize(p.name).includes(normalize(provinceQ.trim()))),
    [provinces, provinceQ]
  );

  // Khách hàng đang giữ danh sách cũ trong bộ nhớ đệm - xóa cache để tab hiện tại của admin thấy ngay
  const afterChange = async (text) => {
    locationService.clearCache();
    if (text) setMessage({ variant: 'success', text });
    await Promise.all([loadProvinces(), loadWards()]);
  };

  const save = async (e) => {
    e.preventDefault();
    const { kind, item, name, isActive, sortOrder } = editing;
    try {
      if (kind === 'province') {
        const payload = { name, isActive, sortOrder: Number(sortOrder) || 0 };
        if (item) await locationService.updateProvince(item._id, payload);
        else await locationService.createProvince(payload);
      } else {
        const payload = { name, isActive, provinceId: selectedId };
        if (item) await locationService.updateWard(item._id, payload);
        else await locationService.createWard(payload);
      }
      setEditing(null);
      await afterChange(`Đã lưu ${name}`);
    } catch (err) {
      showError(err, 'Lưu thất bại');
    }
  };

  const toggle = async (kind, item) => {
    try {
      if (kind === 'province') await locationService.updateProvince(item._id, { isActive: !item.isActive });
      else await locationService.updateWard(item._id, { isActive: !item.isActive });
      await afterChange();
    } catch (err) {
      showError(err, 'Cập nhật thất bại');
    }
  };

  const remove = async (kind, item) => {
    const warning =
      kind === 'province'
        ? `Xóa ${item.name} và toàn bộ ${item.wardCount} phường/xã của tỉnh này?`
        : `Xóa ${item.name}?`;
    if (!confirm(`${warning}\nĐịa chỉ và đơn hàng cũ vẫn giữ nguyên tên đã lưu.`)) return;
    try {
      const res =
        kind === 'province' ? await locationService.deleteProvince(item._id) : await locationService.deleteWard(item._id);
      await afterChange(res.message);
    } catch (err) {
      showError(err, 'Xóa thất bại');
    }
  };

  const seed = async () => {
    if (!confirm('Bổ sung các tỉnh/thành, phường/xã mặc định còn thiếu? Dữ liệu bạn đã sửa sẽ được giữ nguyên.')) return;
    try {
      const res = await locationService.seedDefault();
      await afterChange(res.message);
    } catch (err) {
      showError(err, 'Nạp dữ liệu thất bại');
    }
  };

  const openEdit = (kind, item) =>
    setEditing({
      kind,
      item,
      name: item?.name || '',
      isActive: item ? item.isActive : true,
      sortOrder: item?.sortOrder ?? provinces.length + 1
    });

  const statusBadge = (active) => (
    <Badge bg={active ? 'success' : 'secondary'} role="button" title="Bấm để đổi trạng thái">
      {active ? 'Đang dùng' : 'Đã ẩn'}
    </Badge>
  );

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <h1 className="fs-4 fw-bold mb-0">Tỉnh thành & phường xã</h1>
        <Button variant="outline-secondary" size="sm" onClick={seed}>
          <ArrowRepeat className="me-1" /> Bổ sung dữ liệu mặc định
        </Button>
      </div>
      <p className="small text-muted mb-3">
        Danh sách dùng cho ô chọn địa chỉ khi khách đăng ký tài khoản, thanh toán và thêm sổ địa chỉ. Mục bị ẩn sẽ không
        hiện cho khách chọn.
      </p>
      {message && (
        <Alert variant={message.variant} dismissible onClose={() => setMessage(null)} className="py-2 small">
          {message.text}
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={4}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white d-flex justify-content-between align-items-center">
              <span className="fw-medium small">Tỉnh/Thành phố ({provinces.length})</span>
              <Button size="sm" variant="primary" onClick={() => openEdit('province')}>
                <Plus /> Thêm
              </Button>
            </Card.Header>
            <Card.Body className="p-2">
              <InputGroup size="sm" className="mb-2">
                <InputGroup.Text>
                  <Search />
                </InputGroup.Text>
                <Form.Control placeholder="Tìm tỉnh/thành..." value={provinceQ} onChange={(e) => setProvinceQ(e.target.value)} />
              </InputGroup>
              <ListGroup variant="flush" className="overflow-auto" style={{ maxHeight: '65vh' }}>
                {filteredProvinces.map((p) => (
                  <ListGroup.Item
                    key={p._id}
                    action
                    active={p._id === selectedId}
                    onClick={() => {
                      setSelectedId(p._id);
                      setWardPage(1);
                      setWardQ('');
                    }}
                    className="d-flex justify-content-between align-items-center small py-2"
                  >
                    <span className={p.isActive ? '' : 'text-decoration-line-through opacity-75'}>{p.name}</span>
                    <Badge bg={p._id === selectedId ? 'light' : 'secondary'} text={p._id === selectedId ? 'dark' : undefined} pill>
                      {p.wardCount}
                    </Badge>
                  </ListGroup.Item>
                ))}
                {filteredProvinces.length === 0 && <div className="small text-muted p-3 text-center">Không có tỉnh/thành nào</div>}
              </ListGroup>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={8}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white">
              {selected ? (
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-medium">{selected.name}</span>
                    <span onClick={() => toggle('province', selected)}>{statusBadge(selected.isActive)}</span>
                  </div>
                  <div className="d-flex gap-1">
                    <Button size="sm" variant="outline-secondary" onClick={() => openEdit('province', selected)} title="Sửa tỉnh/thành">
                      <PencilSquare />
                    </Button>
                    <Button size="sm" variant="outline-danger" onClick={() => remove('province', selected)} title="Xóa tỉnh/thành">
                      <Trash />
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => openEdit('ward')}>
                      <Plus /> Thêm phường/xã
                    </Button>
                  </div>
                </div>
              ) : (
                <span className="small text-muted">Chưa có tỉnh/thành nào - bấm "Bổ sung dữ liệu mặc định" để nạp</span>
              )}
            </Card.Header>
            {selected && (
              <Card.Body>
                <InputGroup size="sm" className="mb-3" style={{ maxWidth: 360 }}>
                  <InputGroup.Text>
                    <Search />
                  </InputGroup.Text>
                  <Form.Control
                    placeholder="Tìm phường/xã (gõ không dấu cũng được)..."
                    value={wardQ}
                    onChange={(e) => {
                      setWardQ(e.target.value);
                      setWardPage(1);
                    }}
                  />
                </InputGroup>
                <Table hover responsive size="sm" className="mb-0 align-middle small">
                  <thead>
                    <tr className="text-muted">
                      <th>Tên phường/xã</th>
                      <th>Trạng thái</th>
                      <th className="text-end">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wards.data.map((w) => (
                      <tr key={w._id}>
                        <td>{w.name}</td>
                        <td onClick={() => toggle('ward', w)}>{statusBadge(w.isActive)}</td>
                        <td className="text-end text-nowrap">
                          <Button size="sm" variant="link" className="p-1" onClick={() => openEdit('ward', w)} title="Sửa">
                            <PencilSquare />
                          </Button>
                          <Button size="sm" variant="link" className="p-1 text-danger" onClick={() => remove('ward', w)} title="Xóa">
                            <Trash />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {wards.data.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center text-muted p-3">
                          Không có phường/xã nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
                <AdminPagination page={wardPage} totalPages={wards.totalPages} total={wards.total} onChange={setWardPage} />
              </Card.Body>
            )}
          </Card>
        </Col>
      </Row>

      <Modal show={!!editing} onHide={() => setEditing(null)} centered>
        {editing && (
          <Form onSubmit={save}>
            <Modal.Header closeButton>
              <Modal.Title className="fs-6">
                {editing.item ? 'Sửa' : 'Thêm'} {editing.kind === 'province' ? 'tỉnh/thành phố' : `phường/xã - ${selected?.name}`}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body className="d-flex flex-column gap-3">
              <Form.Group>
                <Form.Label className="small fw-medium">Tên</Form.Label>
                <Form.Control
                  autoFocus
                  required
                  placeholder={editing.kind === 'province' ? 'VD: Thành phố Hà Nội' : 'VD: Phường Ba Đình'}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Form.Group>
              {editing.kind === 'province' && (
                <Form.Group>
                  <Form.Label className="small fw-medium">Thứ tự hiển thị</Form.Label>
                  <Form.Control
                    type="number"
                    value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
                  />
                </Form.Group>
              )}
              <Form.Check
                type="switch"
                id="location-active"
                label="Đang dùng (khách hàng chọn được)"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                Lưu
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
