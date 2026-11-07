const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const ChatAttachment = require('../models/ChatAttachment');
const ChatMessage = require('../models/ChatMessage');
const asyncHandler = require('../utils/asyncHandler');
const { accessibleConversation } = require('./chatController');
const { hashToken, fail, withConversationLock } = require('../services/chatSupport');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ownerKey = (req, guest) => guest ? `customer:${hashToken(req.get('X-Chat-Token'))}` : `staff:${req.account._id}`;
const metadata = (a) => ({ attachmentId: a._id, name: a.name, mimeType: a.mimeType, size: a.size });
function sniff(data) {
  if (data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (data.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf' };
function filename(value, mime) {
  const base = value.replace(/\\/g, '/').split('/').pop().replace(/[\x00-\x1f\x7f]/g, '').replace(/\.[^.]*$/, '').slice(0, 150).trim() || 'tep-chat';
  return `${base}.${extensions[mime]}`;
}
function writable(conversation, guest) {
  if (conversation.status === 'closed') throw fail(409, 'Hội thoại đã kết thúc');
  if (!guest && conversation.status !== 'active') throw fail(409, 'Cần tiếp nhận hội thoại trước khi gửi tệp');
}
const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5,
  fields: 1, fieldSize: 1024, parts: 6 } }).array('files', 5);
const authorizeUpload = (guest) => asyncHandler(async (req, res, next) => {
  writable(await accessibleConversation(req, guest), guest); next();
});
const parseUpload = (req, res, next) => multipart(req, res, (error) => {
  if (error) return next(fail(400, 'Chỉ được gửi tối đa 5 tệp, mỗi tệp tối đa 5 MB'));
  next();
});
const upload = (guest) => asyncHandler(async (req, res) => {
  let ids;
  try { ids = JSON.parse(req.body.clientFileIds); } catch { throw fail(400, 'Mã tệp không hợp lệ'); }
  if (!req.files?.length || !Array.isArray(ids) || ids.length !== req.files.length || ids.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(ids).size !== ids.length) {
    throw fail(400, 'Cần tệp đính kèm và mã tệp hợp lệ');
  }
  const files = req.files.map((file, i) => {
    const mimeType = sniff(file.buffer);
    if (!mimeType || !file.size || file.mimetype !== mimeType) throw fail(400, 'Chỉ chấp nhận nội dung JPG, PNG, WEBP, GIF hoặc PDF đúng định dạng');
    return { clientFileId: ids[i], name: filename(file.originalname, mimeType), mimeType, size: file.size,
      digest: crypto.createHash('sha256').update(file.buffer).digest('hex'), data: file.buffer };
  });
  const found = await accessibleConversation(req, guest);
  await withConversationLock(found._id, async () => {
    writable(await accessibleConversation(req, guest), guest);
    const query = { conversationId: found._id, ownerKey: ownerKey(req, guest) };
    const existing = await ChatAttachment.find({ ...query, clientFileId: { $in: ids } }).select('+clientFileId +digest');
    for (const file of files) {
      const stored = existing.find((a) => a.clientFileId === file.clientFileId);
      if (stored && (stored.digest !== file.digest || stored.name !== file.name)) throw fail(409, 'Mã tệp đã được sử dụng cho một tệp khác');
    }
    const newBytes = files.filter((f) => !existing.some((a) => a.clientFileId === f.clientFileId)).reduce((sum, f) => sum + f.size, 0);
    const totals = await ChatAttachment.aggregate([{ $match: { conversationId: found._id } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]);
    if ((totals[0]?.bytes || 0) + newBytes > 100 * 1024 * 1024) throw fail(400, 'Tổng tệp trong một hội thoại tối đa 100 MB');
    const results = [];
    for (const file of files) {
      const attachment = await ChatAttachment.findOneAndUpdate({ ...query, clientFileId: file.clientFileId },
        { $setOnInsert: { ...file, expiresAt: new Date(Date.now() + 86400000) } }, { upsert: true, new: true, runValidators: true });
      results.push(metadata(attachment));
    }
    res.status(201).json({ data: results });
  });
});
const download = (guest) => asyncHandler(async (req, res) => {
  const conversation = await accessibleConversation(req, guest);
  if (!mongoose.isValidObjectId(req.params.attachmentId)) throw fail(404, 'Không tìm thấy tệp');
  const attachment = await ChatAttachment.findOne({ _id: req.params.attachmentId, conversationId: conversation._id }).select('+ownerKey +data');
  if (!attachment) throw fail(404, 'Không tìm thấy tệp');
  const sent = await ChatMessage.exists({ conversationId: String(conversation._id), 'attachments.attachmentId': attachment._id });
  if (!sent && (attachment.ownerKey !== ownerKey(req, guest) || !attachment.expiresAt || attachment.expiresAt <= new Date())) throw fail(404, 'Không tìm thấy tệp');
  const encodedName = encodeURIComponent(attachment.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
  res.set({ 'Content-Type': attachment.mimeType, 'Content-Length': String(attachment.size),
    'Content-Disposition': `attachment; filename="chat-file.${extensions[attachment.mimeType]}"; filename*=UTF-8''${encodedName}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
  res.send(attachment.data);
});
module.exports = { ownerKey, metadata, authorizeUpload, parseUpload, upload, download };
