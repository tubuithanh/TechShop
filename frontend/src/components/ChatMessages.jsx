import { useEffect, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { Download, FileEarmarkPdf } from 'react-bootstrap-icons';
import { chatService, formatChatFileSize } from '../services/chatService';
import ChatSticker from './ChatSticker';

function Attachment({ attachment, conversationId, customer }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const image = attachment.mimeType.startsWith('image/');
  useEffect(() => {
    if (!image) return;
    let cancelled = false, objectUrl;
    setUrl(''); setError('');
    chatService.attachment(conversationId, attachment.attachmentId, customer).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => { if (!cancelled) setError('Không tải được ảnh'); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [conversationId, attachment.attachmentId, customer, image, attempt]);
  const download = async () => {
    setBusy(true); setError('');
    try {
      const blob = await chatService.attachment(conversationId, attachment.attachmentId, customer);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = attachment.name; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch { setError('Không tải được tệp. Vui lòng thử lại.'); } finally { setBusy(false); }
  };
  return <div className="bg-white text-dark rounded p-2 mt-2 border" style={{ minWidth: 140 }}>
    {image ? url ? <button type="button" className="border-0 p-0 bg-transparent w-100" aria-label={`Xem ảnh ${attachment.name}`} onClick={() => setExpanded(true)}>
      <img src={url} alt={attachment.name} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 4 }} onError={() => setError('Nội dung ảnh không đọc được')} />
    </button> : <div className="small text-muted">{error || 'Đang tải ảnh…'} {error && <Button size="sm" variant="link" onClick={() => setAttempt((n) => n + 1)}>Thử lại</Button>}</div> : <FileEarmarkPdf size={24} className="text-danger" />}
    <div className="small mt-1" style={{ overflowWrap: 'anywhere' }}>{attachment.name}</div>
    <div className="d-flex justify-content-between gap-2 align-items-center"><span className="small text-muted">{formatChatFileSize(attachment.size)}</span>
      <Button size="sm" variant="link" className="p-0" disabled={busy} aria-label={`Tải ${attachment.name}`} onClick={download}><Download /> {busy ? 'Đang tải…' : 'Tải xuống'}</Button></div>
    {error && url && <div className="small text-danger">{error}</div>}
    {!image && error && <div className="small text-danger">{error}</div>}
    <Modal show={expanded} onHide={() => setExpanded(false)} centered size="lg"><Modal.Header closeButton><Modal.Title className="fs-6">{attachment.name}</Modal.Title></Modal.Header><Modal.Body className="text-center"><img src={url} alt={attachment.name} style={{ maxWidth: '100%', maxHeight: '75vh' }} /></Modal.Body></Modal>
  </div>;
}

export default function ChatMessages({ messages, customer = false, bottomRef }) {
  return <>
    {messages.map((m) => {
      const mine = customer ? m.sender?.role === 'customer' : m.sender?.role !== 'customer';
      return <div key={m._id} className={`d-flex ${mine ? 'justify-content-end' : 'justify-content-start'}`}>
        <div className={`rounded-3 px-3 py-2 small ${mine ? 'bg-primary text-white' : 'bg-light text-dark'}`}
          style={{ maxWidth: '85%', overflowWrap: 'anywhere' }}>
          <div className="fw-semibold mb-1" style={{ fontSize: '.7rem' }}>{mine && customer ? 'Bạn' : m.sender?.name}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          {m.stickerId && <ChatSticker id={m.stickerId} />}
          {m.attachments?.map((a) => <Attachment key={a.attachmentId} attachment={a} conversationId={m.conversationId} customer={customer} />)}
          <div className="mt-1 opacity-75" style={{ fontSize: '.65rem' }}>
            {new Date(m.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
          </div>
        </div>
      </div>;
    })}
    <div ref={bottomRef} />
  </>;
}
