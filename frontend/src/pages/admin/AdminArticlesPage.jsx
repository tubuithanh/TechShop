import { useEffect, useState } from 'react';
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
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Quản lý tin tức / bài viết (CMS)</h1>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="bg-red-600 text-white px-4 py-2 rounded text-sm"
        >
          {showForm ? 'Đóng form' : '+ Viết bài mới'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-4 shadow-sm mb-6 space-y-3">
          <input
            required
            placeholder="Tiêu đề bài viết"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="tin_tuc">Tin tức</option>
              <option value="tu_van">Tư vấn</option>
              <option value="danh_gia">Đánh giá</option>
              <option value="thu_thuat">Thủ thuật</option>
            </select>
            <input
              placeholder="Link ảnh bìa (URL)"
              value={form.featuredImage}
              onChange={(e) => setForm({ ...form, featuredImage: e.target.value })}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Tóm tắt ngắn"
            value={form.shortDescription}
            onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
            rows={2}
          />
          <textarea
            required
            placeholder="Nội dung bài viết"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
            rows={6}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            />
            Xuất bản ngay
          </label>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm">
            {editingId ? 'Cập nhật bài viết' : 'Đăng bài'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Tiêu đề</th>
              <th className="p-3">Danh mục</th>
              <th className="p-3">Lượt xem</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((a) => (
              <tr key={a._id} className="border-b">
                <td className="p-3">{a.title}</td>
                <td className="p-3">{a.category}</td>
                <td className="p-3">{a.viewCount}</td>
                <td className="p-3">{a.isPublished ? 'Đã xuất bản' : 'Bản nháp'}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => handleEdit(a)} className="text-blue-600">
                    Sửa
                  </button>
                  <button onClick={() => handleDelete(a._id)} className="text-red-600">
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
