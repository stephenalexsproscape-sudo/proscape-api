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

const csvUpload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only CSV files are allowed'), false);
    }
    cb(null, true);
  }
});

const attachmentUpload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'];
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error('File extension is not allowed'), false);
    }
    cb(null, true);
  }
});

router.post('/notes', authenticateToken, serviceRequestController.addNote);
router.post('/service-requests', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.createServiceRequest);
router.get('/service-requests', authenticateToken, serviceRequestController.getOpenTickets);

// Data Utilities
router.post('/import-jobs', authenticateToken, authorizeRoles('ADMIN'), csvUpload.single('file'), serviceRequestController.importJobs);
router.post('/export-jobs', authenticateToken, authorizeRoles('ADMIN'), serviceRequestController.exportJobs);
router.post('/service-requests/bulk-manual', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.bulkManualEntry);

// Specific routes MUST come before parameterized ones
router.put('/service-requests/bulk-shift', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.bulkShiftTickets);
router.put('/service-requests/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'WORKER'), serviceRequestController.updateTicket);
router.patch('/service-requests/:id/labor-status', authenticateToken, serviceRequestController.updateLaborStatus);
router.get('/service-requests/:id', authenticateToken, serviceRequestController.getTicketById);
router.delete('/service-requests/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.deleteServiceRequest);
router.get('/calendar-events', authenticateToken, serviceRequestController.getCalendarEvents);
router.get('/service-requests/:id/audit-logs', authenticateToken, serviceRequestController.getTicketAuditLogs);
router.get('/recent-activity', authenticateToken, serviceRequestController.getRecentActivity);

router.post('/service-requests/:id/attachments', authenticateToken, attachmentUpload.single('file'), serviceRequestController.uploadAttachment);
router.delete('/attachments/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), serviceRequestController.deleteAttachment);

module.exports = router;
