const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.post('/archive', authenticateToken, authorizeRoles('ADMIN'), adminController.archiveOldTickets);
router.get('/audit-log', authenticateToken, authorizeRoles('ADMIN'), adminController.getAuditLog);
router.get('/data-quality-stats', authenticateToken, authorizeRoles('ADMIN'), adminController.getDataQualityStats);
router.get('/missing-info', authenticateToken, authorizeRoles('ADMIN'), adminController.getMissingInfoCustomers);

module.exports = router;
