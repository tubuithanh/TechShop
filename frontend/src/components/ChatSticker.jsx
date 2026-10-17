import stickers from '../data/chatStickers.json';
export { stickers };

export default function ChatSticker({ id, size = 112 }) {
  const sticker = stickers.find((s) => s.id === id);
  if (!sticker) return null;
  const love = sticker.mood === 'love';
  return <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={`Sticker ${sticker.label}`}>
    <path d="M30 63 Q12 20 51 35 Q79 14 109 35 Q149 16 132 65 L140 108 Q137 134 80 135 Q23 134 20 108Z"
      fill={sticker.color} stroke="white" strokeWidth="7" strokeLinejoin="round" />
    <path d="M34 46 L42 58 L52 42 M108 42 L118 58 L126 46" fill="#fff" opacity=".6" />
    <ellipse cx="49" cy="91" rx="12" ry="7" fill="#fb7185" opacity=".7" />
    <ellipse cx="111" cy="91" rx="12" ry="7" fill="#fb7185" opacity=".7" />
    {love ? <g fill="#e11d48"><path d="M51 76 C38 60 32 82 51 91 C70 82 64 60 51 76" /><path d="M109 76 C96 60 90 82 109 91 C128 82 122 60 109 76" /></g> :
      <g stroke="#243047" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d={sticker.mood === 'happy' ? 'M43 80 Q51 67 59 80 M101 80 Q109 67 117 80' : 'M49 75 L49 81 M111 75 L111 81'} />
      </g>}
    <path d={sticker.mood === 'sad' ? 'M64 108 Q80 96 96 108' : sticker.mood === 'wait' ? 'M71 102 L89 102' : 'M63 99 Q80 121 97 99Z'}
      fill={sticker.mood === 'happy' || love ? '#243047' : 'none'} stroke="#243047" strokeWidth="4" strokeLinecap="round" />
    {sticker.mood === 'sad' && <path d="M117 86 Q130 104 118 106 Q105 104 117 86" fill="#0ea5e9" />}
    <rect x="9" y="126" width="142" height="27" rx="13" fill="white" />
    <text x="80" y="145" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="bold" fill="#243047">{sticker.caption}</text>
  </svg>;
}
