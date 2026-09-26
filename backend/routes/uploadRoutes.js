const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadImages, EXT } = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF'))
});

// Bắt lỗi của multer (file quá lớn, sai định dạng...) để trả 400 kèm thông báo rõ ràng thay vì 500
router.post('/', protect, (req, res, next) =>
  upload.array('images', 5)(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Mỗi ảnh tối đa 5MB' : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Tối đa 5 ảnh mỗi lần' : err.message;
    res.status(400).json({ message });
  }),
  uploadImages
);

module.exports = router;
