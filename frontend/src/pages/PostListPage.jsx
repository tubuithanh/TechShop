import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { postService } from '../services/postService';

const categoryLabel = { tu_van: 'Tư vấn', danh_gia: 'Đánh giá', thu_thuat: 'Thủ thuật', tin_tuc: 'Tin tức' };

export default function PostListPage() {
  const [posts, setPosts] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    postService.getPosts({ category: category || undefined }).then(setPosts).finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-2">Tin tức & Cẩm nang công nghệ</h1>
      <p className="text-sm text-gray-500 mb-4">Cập nhật tin tức, thủ thuật và bài tư vấn chọn mua sản phẩm</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategory('')}
          className={`text-sm border rounded-full px-4 py-1.5 ${!category ? 'bg-red-600 text-white border-red-600' : 'border-gray-300'}`}
        >
          Tất cả
        </button>
        {Object.entries(categoryLabel).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`text-sm border rounded-full px-4 py-1.5 ${
              category === key ? 'bg-red-600 text-white border-red-600' : 'border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {posts.map((a) => (
            <Link key={a._id} to={`/tin-tuc/${a.slug}`} className="border rounded-lg overflow-hidden hover:shadow bg-white">
              {a.featuredImage && <img src={a.featuredImage} alt={a.title} className="w-full h-36 object-cover" />}
              <div className="p-3">
                <span className="text-xs text-red-600">{categoryLabel[a.category]}</span>
                <h3 className="font-medium text-sm mt-1 line-clamp-2">{a.title}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.shortDescription}</p>
                <div className="text-xs text-gray-400 mt-2">{new Date(a.createdAt).toLocaleDateString('vi-VN')}</div>
              </div>
            </Link>
          ))}
          {posts.length === 0 && <div className="text-gray-400 col-span-3 text-center py-10">Chưa có bài viết nào</div>}
        </div>
      )}
    </div>
  );
}
