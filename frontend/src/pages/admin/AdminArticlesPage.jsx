import { useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge } from 'react-bootstrap';
import { postService } from '../../services/postService';

const emptyForm = { title: '', shortDescription: '', content: '', category: 'tin_tuc', featuredImage: '', isPublished: true };

export default function AdminArticlesPage() {
  const [posts, setPosts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const load = () => postService.getAllAdmin().then(setPosts);

  useEffect(() => {
    load();
  }, []);

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

      <Modal show={showForm} onHide={() => setShowForm(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Cập nhật bài viết' : 'Viết bài mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
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
                rows={6}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </Form.Group>
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

      <div className="bg-white rounded-3 shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Tiêu đề</th>
              <th>Danh mục</th>
              <th>Lượt xem</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((a) => (
              <tr key={a._id}>
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
                    <Button size="sm" variant="outline-danger" onClick={() => handleDelete(a._id)}>
                      Xóa
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Container>
  );
}
