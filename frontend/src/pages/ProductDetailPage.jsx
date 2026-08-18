import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { productService } from '../services/productService';
import { userService } from '../services/userService';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import ProductCard from '../components/ProductCard';
import InstallmentCalculator from '../components/InstallmentCalculator';
import ProductQnA from '../components/ProductQnA';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

const TABS = [
  { id: 'description', label: 'Mô tả sản phẩm' },
  { id: 'specs', label: 'Thông số kỹ thuật' },
  { id: 'reviews', label: 'Đánh giá' },
  { id: 'qna', label: 'Hỏi đáp' }
];

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [related, setRelated] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, message: '' });
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  useEffect(() => {
    (async () => {
      const data = await productService.getProductBySlug(slug);
      setProduct(data);
      setActiveImage(0);
      // Mặc định chọn cửa hàng đầu tiên còn hàng
      const firstAvailable = data.inventories?.find((inv) => inv.stock > 0);
      setSelectedStoreId(firstAvailable?.storeId?._id || data.inventories?.[0]?.storeId?._id || '');

      const [rel, rev, qna] = await Promise.all([
        productService.getRelated(data._id),
        productService.getReviews(data._id),
        productService.getQuestions(data._id)
      ]);
      setRelated(rel);
      setReviews(rev);
      setQuestions(qna);

      if (user) {
        const wishlist = await userService.getWishlist();
        setIsWishlisted(wishlist.some((p) => p._id === data._id));
      }
    })();
  }, [slug, user]);

  useEffect(() => {
    const handleScroll = () => setShowStickyBar(window.scrollY > 480);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!product) return <div className="text-center py-20">Đang tải...</div>;

  const displayPrice = product.salePrice || product.price;
  const images = product.imageURLs?.length ? product.imageURLs : [product.featuredImage];
  const selectedInventory = product.inventories?.find((inv) => inv.storeId?._id === selectedStoreId);
  const currentStock = selectedInventory?.stock || 0;

  const handleAddToCart = async () => {
    if (!selectedStoreId) {
      setMessage('Vui lòng chọn cửa hàng trước khi thêm vào giỏ');
      return;
    }
    try {
      await addToCart(product._id, quantity, selectedStoreId);
      setMessage('Đã thêm vào giỏ hàng!');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleToggleWishlist = async () => {
    if (!user) {
      setMessage('Vui lòng đăng nhập để thêm vào yêu thích');
      return;
    }
    const res = await userService.toggleWishlist(product._id);
    setIsWishlisted(res.added);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    const created = await productService.createReview(product._id, newReview);
    setReviews([created, ...reviews]);
    setNewReview({ rating: 5, message: '' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <nav className="text-xs text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
        <Link to="/" className="hover:text-red-600">
          Trang chủ
        </Link>
        <span>/</span>
        <Link to={`/products?categoryId=${product.categoryId?._id}`} className="hover:text-red-600">
          {product.categoryId?.name}
        </Link>
        <span>/</span>
        <span className="text-gray-800">{product.title}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="border rounded-lg overflow-hidden mb-2 relative">
            <img
              src={images?.[activeImage] || 'https://via.placeholder.com/500x500'}
              alt={product.title}
              className="w-full aspect-square object-contain"
            />
            <button
              onClick={handleToggleWishlist}
              className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow ${
                isWishlisted ? 'bg-red-600 text-white' : 'bg-white text-gray-400'
              }`}
              title="Thêm vào yêu thích"
            >
              {isWishlisted ? '♥' : '♡'}
            </button>
          </div>
          {images?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={`w-16 h-16 flex-shrink-0 border rounded overflow-hidden ${
                    activeImage === idx ? 'border-red-600 border-2' : 'border-gray-200'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-xl font-bold mb-2">{product.title}</h1>
          <div className="text-sm text-gray-500 mb-2">Thương hiệu: {product.brandId?.name}</div>

          {product.ratingCount > 0 && (
            <button onClick={() => setActiveTab('reviews')} className="text-yellow-500 text-sm mb-3 block">
              ★ {product.ratingAverage} ({product.ratingCount} đánh giá) · Đã bán {product.soldCount}
            </button>
          )}

          <div className="mb-4">
            <span className="text-2xl text-red-600 font-bold">{formatVND(displayPrice)}</span>
            {product.salePrice && product.salePrice < product.price && (
              <span className="text-gray-400 line-through ml-3">{formatVND(product.price)}</span>
            )}
          </div>

          {/* Chọn cửa hàng - mô hình multi-store: tồn kho khác nhau theo từng chi nhánh */}
          <div className="mb-4">
            <div className="text-sm font-medium mb-1">Chọn cửa hàng để xem tồn kho</div>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {product.inventories?.map((inv) => (
                <option key={inv._id} value={inv.storeId?._id}>
                  {inv.storeId?.name} ({inv.storeId?.city}) — {inv.stock > 0 ? `Còn ${inv.stock} sản phẩm` : 'Hết hàng'}
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-500 mt-1">Tổng tồn kho toàn hệ thống: {product.totalStock} sản phẩm</div>
          </div>

          <div className="text-sm mb-3">
            {currentStock > 0 ? (
              <span className="text-green-600">✓ Còn hàng tại cửa hàng đã chọn ({currentStock} sản phẩm)</span>
            ) : (
              <span className="text-red-500">Hết hàng tại cửa hàng này, vui lòng chọn cửa hàng khác</span>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm">Số lượng:</span>
            <div className="flex items-center border rounded">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-3 py-1">
                -
              </button>
              <span className="px-4">{quantity}</span>
              <button onClick={() => setQuantity(Math.min(currentStock || 1, quantity + 1))} className="px-3 py-1">
                +
              </button>
            </div>
          </div>

          <div className="flex gap-3 mb-2">
            <button
              onClick={handleAddToCart}
              disabled={currentStock === 0}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded disabled:opacity-50"
            >
              {currentStock === 0 ? 'Hết hàng tại cửa hàng này' : 'Thêm vào giỏ hàng'}
            </button>
          </div>
          {message && <div className="text-green-600 text-sm mb-2">{message}</div>}

          <InstallmentCalculator price={displayPrice} />

          <div className="bg-gray-50 rounded p-3 text-sm text-gray-600 mt-3">
            🛡️ Bảo hành chính hãng {product.warrantyMonths} tháng. Miễn phí đổi trả trong 30 ngày nếu lỗi nhà sản
            xuất.
          </div>
        </div>
      </div>

      <div className="mt-10 border-b flex gap-6 text-sm overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 whitespace-nowrap border-b-2 ${
              activeTab === tab.id ? 'border-red-600 text-red-600 font-medium' : 'border-transparent text-gray-500'
            }`}
          >
            {tab.label}
            {tab.id === 'reviews' && ` (${reviews.length})`}
            {tab.id === 'qna' && ` (${questions.length})`}
          </button>
        ))}
      </div>

      <div className="py-6">
        {activeTab === 'description' && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {product.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}
          </p>
        )}

        {activeTab === 'specs' && (
          <table className="w-full text-sm max-w-2xl">
            <tbody>
              {Object.entries(product.specifications || {}).map(([key, val]) => (
                <tr key={key} className="border-b">
                  <td className="py-2 text-gray-500 w-1/3">{key}</td>
                  <td className="py-2">{val}</td>
                </tr>
              ))}
              {Object.keys(product.specifications || {}).length === 0 && (
                <tr>
                  <td className="py-2 text-gray-400">Chưa cập nhật thông số kỹ thuật</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'reviews' && (
          <div>
            {user && (
              <form onSubmit={handleSubmitReview} className="border rounded-lg p-4 mb-4 max-w-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">Chấm điểm:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setNewReview({ ...newReview, rating: star })}
                      className={star <= newReview.rating ? 'text-yellow-500' : 'text-gray-300'}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={newReview.message}
                  onChange={(e) => setNewReview({ ...newReview, message: e.target.value })}
                  placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."
                  className="w-full border rounded p-2 text-sm mb-2"
                  rows={3}
                />
                <button type="submit" className="bg-red-600 text-white px-4 py-1.5 rounded text-sm">
                  Gửi đánh giá
                </button>
              </form>
            )}

            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r._id} className="border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.displayName || r.userId?.displayName || 'Ẩn danh'}</span>
                    <span className="text-yellow-500 text-xs">{'★'.repeat(r.rating)}</span>
                    {r.isVerifiedPurchase && (
                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Đã mua hàng</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{r.message}</p>
                  {r.reply?.content && (
                    <div className="bg-gray-50 rounded p-2 mt-2 text-xs">
                      <span className="font-medium text-red-600">Phản hồi từ TechShop: </span>
                      {r.reply.content}
                    </div>
                  )}
                </div>
              ))}
              {reviews.length === 0 && <div className="text-sm text-gray-400">Chưa có đánh giá nào</div>}
            </div>
          </div>
        )}

        {activeTab === 'qna' && (
          <ProductQnA productId={product._id} questions={questions} setQuestions={setQuestions} />
        )}
      </div>

      {related.length > 0 && (
        <div className="mt-8">
          <h3 className="font-bold mb-3">Sản phẩm liên quan</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </div>
      )}

      {showStickyBar && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg py-3 px-4 z-40">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <img src={images?.[0]} alt="" className="w-10 h-10 object-contain hidden sm:block" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{product.title}</div>
              <div className="text-red-600 font-bold">{formatVND(displayPrice)}</div>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={currentStock === 0}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2.5 rounded disabled:opacity-50 whitespace-nowrap"
            >
              Thêm vào giỏ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
