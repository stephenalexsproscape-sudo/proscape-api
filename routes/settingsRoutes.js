const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const settingsController = require('../controllers/settingsController');
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
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only CSV files are allowed'), false);
    }
    cb(null, true);
  }
});

// Crews
router.get('/crews', authenticateToken, settingsController.getCrews);
router.post('/crews', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.createCrew);
router.post('/crews/reorder', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.reorderCrews);
router.put('/crews/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.updateCrew);
router.delete('/crews/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.deleteCrew);

// Job Categories
router.get('/job-categories', authenticateToken, settingsController.getJobCategories);
router.post('/job-categories', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.createJobCategory);
router.post('/job-categories/reorder', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.reorderJobCategories);
router.put('/job-categories/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.updateJobCategory);
router.delete('/job-categories/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.deleteJobCategory);

// Staff
router.get('/staff', authenticateToken, settingsController.getStaff);
router.put('/staff/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.updateStaff);

// Note Colors
router.get('/note-colors', authenticateToken, settingsController.getNoteColors);
router.put('/note-colors', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), settingsController.updateNoteColors);

// Employees (CSV list upload and display)
router.get('/employees', authenticateToken, settingsController.getEmployees);
router.post('/employees/upload', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), csvUpload.single('file'), settingsController.uploadEmployees);

module.exports = router;
