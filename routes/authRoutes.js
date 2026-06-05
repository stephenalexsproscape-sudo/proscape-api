const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPasswordWithToken);
router.get('/users', authenticateToken, authController.getAllUsers);
router.post('/users', authenticateToken, authController.provisionAccount);
router.put('/users/:id/password', authenticateToken, authController.resetPassword);

module.exports = router;
