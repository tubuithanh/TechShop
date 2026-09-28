import { useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge, Alert } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons';
import { useAuth } from '../../store/AuthContext';
import { postService } from '../../services/postService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';
import ProductUrlImport from '../../components/admin/ProductUrlImport';

const DELETE_ALL_CONFIRM = 'XOA TAT CA';

const emptyForm = { title: '', shortDescription: '', content: '', category: 'tin_tuc', featuredImage: '', isPublished: true };

export default function AdminArticlesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;
  const query = useListQuery(['category', 'published']);
  const { data: posts, total, totalPages, loading, reload: load } = useAdminList(postService.getAllAdmin, {
    ...query.apiParams,
    limit: pageSize
  });
  const page = query.values.page;
  const setPage = query.setPage;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin'; // xóa bài (từng bài / hàng loạt / tất cả) chỉ dành cho admin
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Đổi trang / bộ lọc / tải lại -> bỏ chọn các bài không còn hiển thị
  useEffect(() => {
    setSelected((cur) => new Set([...cur].filter((id) => posts.some((p) => p._id === id))));
  }, [posts]);

  const toggleOne = (id) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOnPageSelected = posts.length > 0 && posts.every((p) => selected.has(p._id));
  const toggleAllOnPage = () => setSelected(allOnPageSelected ? new Set() : new Set(posts.map((p) => p._id)));

  const handleBulkDelete = async () => {
    if (!selected.size || !confirm(`Xóa ${selected.size} bài viết đã chọn? Hành động này không thể hoàn tác.`)) return;
    setDeleting(true);
    try {
      const res = await postService.bulkRemove([...selected]);
      setSelected(new Set());
      setNotice({ variant: 'success', text: res.message });
      load();
    } catch (err) {
      setNotice({ variant: 'danger', text: err.response?.data?.message || 'Xóa thất bại' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const res = await postService.removeAll(confirmText);
      setShowDeleteAll(false);
      setConfirmText('');
      setSelected(new Set());
      setNotice({ variant: 'success', text: res.message });
      query.reset();
      load();
    } catch (err) {
      setNotice({ variant: 'danger', text: err.response?.data?.message || 'Xóa thất bại' });
    } finally {
      setDeleting(false);
    }
  };
  const filters = [
    {
      key: 'category',
      label: 'Chuyên mục',
      options: [
        { value: 'tin_tuc', label: 'Tin tức' },
        { value: 'tu_van', label: 'Tư vấn' },
        { value: 'danh_gia', label: 'Đánh giá' },
        { value: 'thu_thuat', label: 'Thủ thuật' }
      ]
    },
    { key: 'published', label: 'Trạng thái', options: [{ value: 'true', label: 'Đã đăng' }, { value: 'false', label: 'Bản nháp' }] }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await postService.update(editingId, form);
    } else {
      await postService.create(form);
    }
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
    load();
  };

  const handleEdit = (a) => {
    setForm({
      title: a.title,
      shortDescription: a.shortDescription,
      content: a.content,
      category: a.category,
      featuredImage: a.featuredImage || '',
      isPublished: a.isPublished
    });
    setEditingId(a._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa bài viết này?')) return;
    await postService.remove(id);
    load();
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fs-4 fw-bold mb-0">Quản lý tin tức / bài viết (CMS)</h1>
        <Button
          variant="primary"
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }}
        >
          + Viết bài mới
        </Button>
      </div>

      {notice && (
        <Alert variant={notice.variant} dismissible onClose={() => setNotice(null)} className="py-2 small">
          {notice.text}
        </Alert>
      )}

      <Modal show={showDeleteAll} onHide={() => !deleting && setShowDeleteAll(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 text-danger">Xóa TẤT CẢ bài viết</Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          <p>
            Toàn bộ <strong>{total}</strong> bài viết (kể cả bản nháp và bình luận của bài) sẽ bị xóa vĩnh viễn, không thể hoàn tác.
          </p>
          <Form.Label htmlFor="delete-all-confirm">
            Gõ <code>{DELETE_ALL_CONFIRM}</code> để xác nhận:
          </Form.Label>
          <Form.Control
            id="delete-all-confirm"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={deleting} onClick={() => setShowDeleteAll(false)}>
            Hủy
          </Button>
          <Button variant="danger" disabled={confirmText !== DELETE_ALL_CONFIRM || deleting} onClick={handleDeleteAll}>
            {deleting ? 'Đang xóa...' : 'Xóa tất cả'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showForm} onHide={() => setShowForm(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Cập nhật bài viết' : 'Viết bài mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {!editingId && (
              <div className="mb-3">
                <ProductUrlImport
                  sourceName="tinhte.vn"
                  endpoint="/posts/import-url"
                  htmlEndpoint="/posts/import-html"
                  placeholder="VD: https://tinhte.vn/thread/ten-bai-viet.1234567/"
                  hint="Tự điền tiêu đề, tóm tắt, ảnh bìa và nội dung (kèm ảnh trong bài - dùng link ảnh gốc của tinhte.vn, cuối bài ghi nguồn). Hãy kiểm tra lại trước khi lưu. Nội dung thuộc bản quyền của tác giả/tinhte.vn - chỉ dùng cho mục đích minh họa."
                  onImported={(d) =>
                    setForm((prev) => ({
                      ...prev,
                      title: d.title || prev.title,
                      shortDescription: d.shortDescription || prev.shortDescription,
                      content: d.content || prev.content,
                      featuredImage: d.featuredImage || prev.featuredImage
                    }))
                  }
                />
              </div>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Tiêu đề bài viết</Form.Label>
              <Form.Control required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Danh mục</Form.Label>
                  <Form.Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="tin_tuc">Tin tức</option>
                    <option value="tu_van">Tư vấn</option>
                    <option value="danh_gia">Đánh giá</option>
                    <option value="thu_thuat">Thủ thuật</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Link ảnh bìa (URL)</Form.Label>
                  <Form.Control
                    value={form.featuredImage}
                    onChange={(e) => setForm({ ...form, featuredImage: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Tóm tắt ngắn</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={form.shortDescription}
                onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Nội dung bài viết</Form.Label>
              <Form.Control
                required
                as="textarea"
                rows={10}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <Form.Text className="text-muted">
                Chèn ảnh vào giữa bài: viết một dòng riêng dạng <code>![mô tả ảnh](https://link-anh.jpg)</code>.
              </Form.Text>
            </Form.Group>
            {form.featuredImage && (
              <img src={form.featuredImage} alt="" referrerPolicy="no-referrer" className="rounded mb-3" style={{ maxHeight: 120 }} />
            )}
            <Form.Check
              type="checkbox"
              id="isPublished"
              label="Xuất bản ngay"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="success">
              {editingId ? 'Cập nhật bài viết' : 'Đăng bài'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <AdminSearchBar query={query} placeholder="Tiêu đề, mô tả, tác giả..." filters={filters} total={total} loading={loading} />
      <div className="bg-white rounded-3 shadow-sm">
        {isAdmin && (
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-2 border-bottom">
            <span className="small text-muted">{selected.size ? `Đã chọn ${selected.size} bài` : 'Tick ô bên trái để chọn nhiều bài'}</span>
            <div className="d-flex gap-2">
              <Button size="sm" variant="danger" disabled={!selected.size || deleting} onClick={handleBulkDelete}>
                <Trash className="me-1" />
                Xóa đã chọn{selected.size ? ` (${selected.size})` : ''}
              </Button>
              <Button size="sm" variant="outline-danger" disabled={deleting || total === 0} onClick={() => setShowDeleteAll(true)}>
                Xóa tất cả bài viết
              </Button>
            </div>
          </div>
        )}
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              {isAdmin && (
                <th style={{ width: 36 }}>
                  <Form.Check
                    aria-label="Chọn tất cả bài trên trang"
                    checked={allOnPageSelected}
                    disabled={!posts.length}
                    onChange={toggleAllOnPage}
                  />
                </th>
              )}
              <th>Tiêu đề</th>
              <th>Danh mục</th>
              <th>Lượt xem</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((a) => (
              <tr key={a._id} className={selected.has(a._id) ? 'table-danger' : ''}>
                {isAdmin && (
                  <td>
                    <Form.Check aria-label={`Chọn bài ${a.title}`} checked={selected.has(a._id)} onChange={() => toggleOne(a._id)} />
                  </td>
                )}
                <td>{a.title}</td>
                <td>{a.category}</td>
                <td>{a.viewCount}</td>
                <td>
                  <Badge bg={a.isPublished ? 'success' : 'secondary'}>
                    {a.isPublished ? 'Đã xuất bản' : 'Bản nháp'}
                  </Badge>
                </td>
                <td>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-primary" onClick={() => handleEdit(a)}>
                      Sửa
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline-danger" onClick={() => handleDelete(a._id)}>
                        Xóa
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && posts.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center text-muted p-4">
                  Không tìm thấy kết quả phù hợp
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        <div className="p-3 pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </div>
      </div>
    </Container>
  );
}
