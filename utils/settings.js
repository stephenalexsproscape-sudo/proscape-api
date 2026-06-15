const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../settings.json');

const defaultSettings = {
  noteColors: {
    DELIVERY: { bg: '#f59e0b', border: '#d97706' },
    VACATION: { bg: '#06b6d4', border: '#0891b2' },
    EVENT: { bg: '#8b5cf6', border: '#7c3aed' },
    OTHER: { bg: '#64748b', border: '#475569' },
  }
};

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(data);
    } else {
      // Create settings.json with default settings if it doesn't exist
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
      return defaultSettings;
    }
  } catch (e) {
    console.error('Failed to read settings file, using defaults:', e);
    return defaultSettings;
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write settings file:', e);
    return false;
  }
}

module.exports = {
  getSettings,
  saveSettings
};
