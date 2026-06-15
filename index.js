// ==========================================
// PROSCAPE CRM: RELATIONAL API (REFACTORED)
// ==========================================

require('dotenv').config();

// Critical env checks (skipped in test to allow test files / jest to inject vars before app require triggers exit)
const isTest = process.env.NODE_ENV === 'test';
if (!process.env.JWT_SECRET && !isTest) {
  console.error('CRITICAL ERROR: JWT_SECRET environment variable is not defined.');
  process.exit(1);
}

// Additional required env validation for production safety
if (!process.env.DATABASE_URL && !isTest) {
  console.error('CRITICAL ERROR: DATABASE_URL environment variable is not defined (required by Prisma).');
  process.exit(1);
}

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
const calendarNoteRoutes = require('./routes/calendarNoteRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();

// Global Security Middleware
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProd, // Enable strict CSP in production; disabled for local dev/Vite
  crossOriginOpenerPolicy: isProd ? { policy: 'same-origin' } : false, // Avoid console warnings on Tailscale HTTP / local non-secure origins
  originAgentCluster: isProd ? true : false, // Avoid console warnings on Tailscale HTTP / local non-secure origins
}));

// CORS Whitelist config
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(o => o.trim()));
}
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow non-browser requests
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const isPrivateIP = 
        hostname.startsWith('192.168.') || 
        hostname.startsWith('10.') || 
        hostname.startsWith('100.') || // Tailscale
        (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)); // 172.16.x.x - 172.31.x.x
      if (isLocalhost || isPrivateIP) {
        return callback(null, true);
      }
    } catch (e) {
      // Invalid URL format, fall through to rejection
    }
    console.warn(`[CORS REJECTED] Origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Rate Limiting Config
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 login attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/login', loginLimiter);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // 1000 requests per 15 minutes for other API endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many API requests from this IP, please try again after 15 minutes',
});
app.use('/service-requests', apiLimiter);
app.use('/customers', apiLimiter);
app.use('/analytics', apiLimiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 AI voice commands per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many AI voice commands. Please wait a minute before trying again.',
});
const fs = require('fs');

// For full previous appearance on main page (index.html) and others:
// Always serve the raw source tree (proscape-frontend) so the original
// <link href="/src/style.css"> (full unprocessed design system with all
// .kpi-grid, .module-grid, .card, header, banner, buttons, dark/field modes etc.)
// and scripts /utils/* and /public/* resolve correctly.
// This matches the "previously" good state from the backup.
// (dist/ is for mobile builds only.)
const frontendPath = path.join(__dirname, '../proscape-frontend');
const publicPath = path.join(frontendPath, 'public');

// Mount public contents at root first (so /utils/theme.js, /sw.js, /logo.png, /manifest.webmanifest work)
app.use(express.static(publicPath));

// Then the project root for .html files and /src/style.css etc.
app.use(express.static(frontendPath));

// Serve uploaded job attachments publicly for the UI
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/', authRoutes);
app.use('/', customerRoutes);
app.use('/', serviceRequestRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/admin', adminRoutes);
app.use('/settings', settingsRoutes);
app.use('/messages', messageRoutes);
app.use('/', calendarNoteRoutes);

// AI / Voice command routes (protected inside the router)
app.use('/ai', aiLimiter, aiRoutes);

// Phase 2 Architecture: Background job queue for emails/SMS/recurring side-effects.
// This unblocks the main request handlers (better responsiveness for field users).
// Handlers are registered here so they run asynchronously via the simple in-process queue.
console.log('QUEUE SETUP LOADED - top level code executing');
const { enqueue, registerHandler } = require('./utils/queue');
const mailer = require('./utils/mailer');

registerHandler('completion-email', async (data) => {
  await mailer.sendJobCompletionEmail(
    data.to,
    data.clientName,
    data.ticketId,
    data.description,
    data.notes,
    data.attachments || []
  );
});

registerHandler('new-client-email', async (data) => {
  await mailer.sendNewClientEmail(data.customer);
});

registerHandler('export-email', async (data) => {
  await mailer.sendExportEmail(data.csvContent);
});

// Health Check (Optional, since root serves frontend)
app.get('/health', (req, res) => {
  res.send(
    '<h1 style="color:#166534; text-align:center; font-family:sans-serif;">🍃 Proscape Relational API Online</h1>'
  );
});

// Debug: queue status (for testing simulated workflows)
app.get('/debug/queue', (req, res) => {
  const { getQueueStatus } = require('./utils/queue');
  res.json(getQueueStatus ? getQueueStatus() : { error: 'no status' });
});

// Error Handling Middleware (MUST be last)
app.use(errorHandler);

////////////////////////
/// START THE ENGINE ///
////////////////////////
if (require.main === module) {
  const http = require('http');
  const https = require('https');
  const fs = require('fs');
  const PORT = process.env.PORT || 3000;

  if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
    try {
      const options = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH),
      };
      https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
        console.log(`TAILSCALE BINDING IS ACTIVE - Secure HTTPS server listening on port ${PORT}`);
      });
    } catch (e) {
      console.error('Failed to start HTTPS server, falling back to HTTP:', e.message);
      http.createServer(app).listen(PORT, '0.0.0.0', () => {
        console.log(`TAILSCALE BINDING IS ACTIVE - HTTP fallback server listening on port ${PORT}`);
      });
    }
  } else {
    http.createServer(app).listen(PORT, '0.0.0.0', () => {
      console.log(`TAILSCALE BINDING IS ACTIVE - Listening on port ${PORT}`);
    });
  }
}

module.exports = app;
