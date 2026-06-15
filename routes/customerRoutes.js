const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/stats', authenticateToken, customerController.getStats);
router.get('/search', authenticateToken, customerController.searchCustomers);
router.get('/customers', authenticateToken, customerController.getAllCustomers);
router.post('/customers', authenticateToken, customerController.createCustomer);
router.get('/customers/:id', authenticateToken, customerController.getCustomerById);
router.put('/customers/:id', authenticateToken, customerController.updateCustomerProfile);
router.put('/customers/:id/specs', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), customerController.updateSiteSpecs);
router.post('/customers/:id/propose-specs', authenticateToken, customerController.proposeSiteSpecs);
router.get('/companies', authenticateToken, customerController.getAllCompanies);

module.exports = router;
