const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

// All AI routes require authentication
router.post('/command', authenticateToken, aiController.processVoiceCommand);

module.exports = router;
