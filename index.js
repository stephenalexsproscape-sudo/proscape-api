// ==========================================
// PROSCAPE CRM: RELATIONAL API (REFACTORED)
// ==========================================

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const serviceRequestRoutes = require('./routes/serviceRequestRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();

// Global Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for local dev/Vite integration simplicity
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/login', limiter); // Apply rate limiting to login only for now to avoid disrupting general use

// Global Middleware
app.use(cors());
app.use(express.json());

// Serve the frontend HTML securely using an absolute path
const frontendPath = path.join(__dirname, '../proscape-frontend');
app.use(express.static(frontendPath));

// Serve file uploads publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/', authRoutes);
app.use('/', customerRoutes);
app.use('/', serviceRequestRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/admin', adminRoutes);
app.use('/settings', settingsRoutes);
app.use('/messages', messageRoutes);

// Health Check (Optional, since root serves frontend)
app.get('/health', (req, res) => {
  res.send(
    '<h1 style="color:#166534; text-align:center; font-family:sans-serif;">🍃 Proscape Relational API Online</h1>'
  );
});

// Error Handling Middleware (MUST be last)
app.use(errorHandler);

////////////////////////
/// START THE ENGINE ///
////////////////////////
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TAILSCALE BINDING IS ACTIVE - Listening on port ${PORT}`);
  });
}

module.exports = app;
