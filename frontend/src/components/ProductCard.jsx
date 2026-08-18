import { Link } from 'react-router-dom';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function ProductCard({ product }) {
  const displayPrice = product.salePrice || product.price;
  const discountPercent =
    product.salePrice && product.salePrice < product.price
      ? Math.round(100 - (product.salePrice / product.price) * 100)
      : 0;

  return (
    <Link
      to={`/products/${product.slug}`}
      className="border rounded-lg p-3 bg-white hover:shadow-lg transition block relative"
    >
      {discountPercent > 0 && (
        <span className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded">
          -{discountPercent}%
        </span>
      )}
      <img
        src={product.featuredImage || 'https://via.placeholder.com/300x300?text=No+Image'}
        alt={product.title}
        className="w-full h-40 object-contain mb-2"
      />
      <h3 className="text-sm font-medium line-clamp-2 h-10">{product.title}</h3>
      <div className="mt-1">
        <span className="text-red-600 font-bold">{formatVND(displayPrice)}</span>
        {product.salePrice && product.salePrice < product.price && (
          <span className="text-gray-400 text-xs line-through ml-2">{formatVND(product.price)}</span>
        )}
      </div>
      {product.ratingCount > 0 && (
        <div className="text-xs text-yellow-500 mt-1">
          ★ {product.ratingAverage} ({product.ratingCount} đánh giá)
        </div>
      )}
      {product.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {product.tags.map((t) => (
            <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
