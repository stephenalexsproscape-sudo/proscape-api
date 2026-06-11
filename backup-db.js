const path = require('path');
const fs = require('fs');

/**
 * CONFIGURATION
 * Update BACKUP_DIR if you mount your Windows share to a specific Linux path.
 * Defaulting to a local folder first for safety.
 * 
 * SECURITY: Never hardcode DB credentials. Use DATABASE_URL env var (same as Prisma).
 */
const BACKUP_DIR = process.env.BACKUP_DIR || '/home/stephen/proscape-backups';
const DB_URL = process.env.DATABASE_URL || process.env.DB_URL;
const KEEP_DAYS = 7;

if (!DB_URL) {
  console.error('CRITICAL: DATABASE_URL (or DB_URL) env var is required for backups.');
  process.exit(1);
}

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const fileName = `proscape_backup_${timestamp}.sql`;
const filePath = path.join(BACKUP_DIR, fileName);

console.log(`🚀 Starting Database Backup: ${fileName}...`);

// Execute pg_dump safely (array form to avoid shell injection / secret exposure in ps/argv)
const { spawn } = require('child_process');
const pgDump = spawn('pg_dump', [DB_URL], { stdio: ['ignore', 'pipe', 'pipe'] });
const outStream = fs.createWriteStream(filePath);
pgDump.stdout.pipe(outStream);

let stderrData = '';
pgDump.stderr.on('data', (d) => { stderrData += d.toString(); });

pgDump.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ Backup Failed (code ${code}): ${stderrData}`);
    return;
  }
  if (stderrData) console.warn(`⚠️ Warning: ${stderrData}`);
  console.log(`✅ Success: Backup saved to ${filePath}`);
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
