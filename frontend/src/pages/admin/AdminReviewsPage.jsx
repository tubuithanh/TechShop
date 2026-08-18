import { useEffect, useState } from 'react';
import { reviewService } from '../../services/reviewService';

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [replyDrafts, setReplyDrafts] = useState({});

  const load = () => reviewService.getAllAdmin().then(setReviews);

  useEffect(() => {
    load();
  }, []);

  const handleHide = async (id) => {
    if (!confirm('Ẩn đánh giá này khỏi trang sản phẩm?')) return;
    await reviewService.hide(id);
    load();
  };

  const handleReply = async (id) => {
    const content = replyDrafts[id];
    if (!content?.trim()) return;
    await reviewService.reply(id, content);
    setReplyDrafts({ ...replyDrafts, [id]: '' });
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Quản lý đánh giá sản phẩm</h1>
      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r._id} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-start mb-1">
              <div>
                <span className="font-medium text-sm">{r.userId?.displayName || r.displayName}</span>
                <span className="text-yellow-500 text-xs ml-2">{'★'.repeat(r.rating)}</span>
                <span className="text-xs text-gray-400 ml-2">→ {r.productId?.title}</span>
              </div>
              <span className={`text-xs ${r.status === 'visible' ? 'text-green-600' : 'text-red-600'}`}>
                {r.status === 'visible' ? 'Đang hiển thị' : 'Đã ẩn'}
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-2">{r.message}</p>

            {r.reply?.content && (
              <div className="bg-gray-50 rounded p-2 text-xs mb-2">
                <span className="font-medium text-red-600">Đã phản hồi: </span>
                {r.reply.content}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={replyDrafts[r._id] || ''}
                onChange={(e) => setReplyDrafts({ ...replyDrafts, [r._id]: e.target.value })}
                placeholder="Phản hồi đánh giá này..."
                className="flex-1 border rounded px-2 py-1 text-xs"
              />
              <button onClick={() => handleReply(r._id)} className="text-xs text-blue-600 whitespace-nowrap">
                Gửi phản hồi
              </button>
              {r.status === 'visible' && (
                <button onClick={() => handleHide(r._id)} className="text-xs text-red-600 whitespace-nowrap">
                  Ẩn đánh giá
                </button>
              )}
            </div>
          </div>
        ))}
        {reviews.length === 0 && <div className="text-sm text-gray-400">Chưa có đánh giá nào</div>}
      </div>
    </div>
  );
}
