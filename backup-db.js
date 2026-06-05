const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * CONFIGURATION
 * Update BACKUP_DIR if you mount your Windows share to a specific Linux path.
 * Defaulting to a local folder first for safety.
 */
const BACKUP_DIR = '/home/stephen/proscape-backups';
const DB_URL = 'postgresql://admin:7whg5xN@localhost:5432/proscape_db';
const KEEP_DAYS = 7;

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const fileName = `proscape_backup_${timestamp}.sql`;
const filePath = path.join(BACKUP_DIR, fileName);

console.log(`🚀 Starting Database Backup: ${fileName}...`);

// Execute pg_dump
// We use the full URL to avoid needing separate environment variables
const cmd = `pg_dump "${DB_URL}" > "${filePath}"`;

exec(cmd, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Backup Failed: ${error.message}`);
    return;
  }
  if (stderr) {
    console.warn(`⚠️ Warning: ${stderr}`);
  }

  console.log(`✅ Success: Backup saved to ${filePath}`);

  // Clean up old backups (Rotation)
  cleanOldBackups();
});

function cleanOldBackups() {
  fs.readdir(BACKUP_DIR, (err, files) => {
    if (err) return console.error('Could not list backup directory for cleanup.');

    const now = Date.now();
    const expiry = KEEP_DAYS * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      const fullPath = path.join(BACKUP_DIR, file);
      fs.stat(fullPath, (err, stats) => {
        if (err) return;

        if (now - stats.mtimeMs > expiry && file.endsWith('.sql')) {
          console.log(`🧹 Rotating old backup: ${file}`);
          fs.unlinkSync(fullPath);
        }
      });
    });
  });
}
