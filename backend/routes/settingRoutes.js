const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getSettings);
router.put('/', protect, authorize('admin'), updateSettings);

module.exports = router;
