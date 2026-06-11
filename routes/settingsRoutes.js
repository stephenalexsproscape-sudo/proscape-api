const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

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

module.exports = router;
