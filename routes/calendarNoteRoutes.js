const express = require('express');
const router = express.Router();
const calendarNoteController = require('../controllers/calendarNoteController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/calendar-notes', authenticateToken, calendarNoteController.getCalendarNotes);
router.post('/calendar-notes', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), calendarNoteController.createCalendarNote);
router.put('/calendar-notes/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), calendarNoteController.updateCalendarNote);
router.delete('/calendar-notes/:id', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), calendarNoteController.deleteCalendarNote);

module.exports = router;
