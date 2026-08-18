import { useEffect, useState } from 'react';
import { storeService } from '../services/storeService';

export default function StoreLocatorPage() {
  const [stores, setStores] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storeService.getCities().then(setCities);
  }, []);

  useEffect(() => {
    setLoading(true);
    storeService.getStores(selectedCity).then(setStores).finally(() => setLoading(false));
  }, [selectedCity]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-2">Hệ thống cửa hàng</h1>
      <p className="text-sm text-gray-500 mb-4">Tìm cửa hàng TechShop gần bạn nhất để trải nghiệm và nhận hàng</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setSelectedCity('')}
          className={`text-sm border rounded-full px-4 py-1.5 ${!selectedCity ? 'bg-red-600 text-white border-red-600' : 'border-gray-300'}`}
        >
          Tất cả
        </button>
        {cities.map((c) => (
          <button
            key={c}
            onClick={() => setSelectedCity(c)}
            className={`text-sm border rounded-full px-4 py-1.5 ${
              selectedCity === c ? 'bg-red-600 text-white border-red-600' : 'border-gray-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stores.map((s) => (
            <div key={s._id} className="border rounded-lg p-4">
              <h3 className="font-bold mb-1">{s.name}</h3>
              <p className="text-sm text-gray-600 mb-1">📍 {s.address}</p>
              <p className="text-sm text-gray-600 mb-1">📞 {s.phoneNumber}</p>
              <p className="text-sm text-gray-600">🕒 {s.openHours}</p>
              {s.lat && s.lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-sm text-red-600 underline"
                >
                  Chỉ đường trên Google Maps →
                </a>
              )}
            </div>
          ))}
          {stores.length === 0 && <div className="text-gray-400 col-span-2 text-center py-10">Không có cửa hàng phù hợp</div>}
        </div>
      )}
    </div>
  );
}
