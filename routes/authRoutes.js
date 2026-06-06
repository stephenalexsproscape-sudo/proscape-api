const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPasswordWithToken);
router.get('/me', authenticateToken, authController.getMe);
router.put('/me', authenticateToken, authController.updateMe);
router.get('/users', authenticateToken, authorizeRoles('ADMIN'), authController.getAllUsers);
router.post('/users', authenticateToken, authorizeRoles('ADMIN'), authController.provisionAccount);
router.put('/users/:id/password', authenticateToken, authorizeRoles('ADMIN'), authController.resetPassword);

module.exports = router;
