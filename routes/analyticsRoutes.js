const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/performance', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), analyticsController.getPerformanceStats);

module.exports = router;
