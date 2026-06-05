const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const serviceRequestController = require('../controllers/serviceRequestController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

router.post('/notes', authenticateToken, serviceRequestController.addNote);
router.post('/service-requests', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.createServiceRequest);
router.get('/service-requests', authenticateToken, serviceRequestController.getOpenTickets);

// Data Utilities
router.post('/import-jobs', authenticateToken, authorizeRoles('ADMIN'), upload.single('file'), serviceRequestController.importJobs);
router.post('/export-jobs', authenticateToken, authorizeRoles('ADMIN'), serviceRequestController.exportJobs);

// Specific routes MUST come before parameterized ones
router.put('/service-requests/bulk-shift', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.bulkShiftTickets);
router.put('/service-requests/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'WORKER'), serviceRequestController.updateTicket);
router.delete('/service-requests/:id', authenticateToken, authorizeRoles('ADMIN'), serviceRequestController.deleteServiceRequest);
router.get('/calendar-events', authenticateToken, serviceRequestController.getCalendarEvents);
router.get('/service-requests/:id/audit-logs', authenticateToken, serviceRequestController.getTicketAuditLogs);
router.get('/recent-activity', authenticateToken, serviceRequestController.getRecentActivity);

router.post('/service-requests/:id/attachments', authenticateToken, upload.single('file'), serviceRequestController.uploadAttachment);
router.delete('/attachments/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.deleteAttachment);

module.exports = router;
