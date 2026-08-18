import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { postService } from '../services/postService';
import ProductCard from '../components/ProductCard';

const categoryLabel = { tu_van: 'Tư vấn', danh_gia: 'Đánh giá', thu_thuat: 'Thủ thuật', tin_tuc: 'Tin tức' };

export default function PostDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    postService.getPostBySlug(slug).then(setPost);
  }, [slug]);

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const newComment = await postService.addComment(post._id, comment);
    setPost({ ...post, comments: [...(post.comments || []), newComment] });
    setComment('');
  };

  if (!post) return <div className="text-center py-16">Đang tải...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <nav className="text-xs text-gray-500 mb-4">
        <Link to="/tin-tuc" className="hover:text-red-600">
          Tin tức & Cẩm nang
        </Link>{' '}
        / {categoryLabel[post.category]}
      </nav>

      <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{categoryLabel[post.category]}</span>
      <h1 className="text-2xl font-bold mt-2 mb-2">{post.title}</h1>
      <div className="text-sm text-gray-500 mb-4">
        {post.nameAuthor} · {new Date(post.createdAt).toLocaleDateString('vi-VN')} · {post.viewCount} lượt xem
      </div>

      {post.featuredImage && <img src={post.featuredImage} alt={post.title} className="w-full rounded-lg mb-6" />}

      <div className="text-sm leading-relaxed whitespace-pre-line text-gray-800">{post.content}</div>

      {post.relatedProductIds?.length > 0 && (
        <div className="mt-10">
          <h3 className="font-bold mb-3">Sản phẩm liên quan trong bài viết</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {post.relatedProductIds.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 border-t pt-6">
        <h3 className="font-bold mb-3">Bình luận ({post.comments?.length || 0})</h3>
        {user ? (
          <form onSubmit={handleComment} className="flex gap-2 mb-4">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Viết bình luận..."
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-red-600 text-white px-4 rounded text-sm">
              Gửi
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500 mb-4">Đăng nhập để bình luận.</p>
        )}
        <div className="space-y-3">
          {(post.comments || []).map((c) => (
            <div key={c._id} className="border-b pb-2">
              <div className="text-sm font-medium">{c.displayName}</div>
              <div className="text-sm text-gray-700">{c.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
