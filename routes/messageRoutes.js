const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticateToken } = require('../middleware/auth');

router.get('/inbox', authenticateToken, messageController.getInbox);
router.get('/unread-count', authenticateToken, messageController.getUnreadCount);
router.post('/send', authenticateToken, messageController.sendMessage);
router.put('/:id/read', authenticateToken, messageController.markAsRead);

module.exports = router;
