import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeProject } from './analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ANSI escape codes for terminal styling
 */
const ANSI = {
  RESET: '\x1b[0m',
  CLEAR_LINE: '\x1b[2K',
  CURSOR_HOME: '\x1b[H',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  BRIGHT_RED: '\x1b[91m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_CYAN: '\x1b[96m'
};

/**
 * Options for files to watch
 */
const WATCH_EXTENSIONS = ['.js', '.ts', '.css', '.html', '.json'];

/**
 * Watch state and history
 */
class WatcherState {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.fileSizes = new Map(); // Map of file path -> previous size
    this.changeHistory = []; // Array of {timestamp, filename, sizeDelta, newSize}
    this.currentStats = {
      score: 0,
      totalSize: 0,
      fileCount: 0
    };
    this.watchers = new Map(); // Map of file path -> watcher
    this.isInitialized = false;
    this.lastUpdateTime = Date.now();
  }

  addHistory(filename, sizeDelta, newSize) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    this.changeHistory.unshift({
      timestamp,
      filename: path.basename(filename),
      sizeDelta,
      newSize
    });

    // Keep only last 10 changes
    if (this.changeHistory.length > 10) {
      this.changeHistory.pop();
    }
  }

  getHistoryString() {
    if (this.changeHistory.length === 0) {
      return '';
    }

    const lines = this.changeHistory.map((entry, idx) => {
      const sign = entry.sizeDelta > 0 ? '+' : '';
      const sizeStr = `${sign}${(entry.sizeDelta / 1024).toFixed(1)}KB`;
      const color = entry.sizeDelta > 0 ? ANSI.BRIGHT_RED : ANSI.BRIGHT_GREEN;
      return `${idx + 1}. [${entry.timestamp}] ${entry.filename} ${color}${sizeStr}${ANSI.RESET}`;
    });

    return lines.join('\n');
  }
}

/**
 * Initialize watcher by scanning directory and recording initial file sizes
 */
async function initializeWatcher(dirPath, state) {
  // Read initial analysis
  try {
    const analysis = await analyzeProject(dirPath);
    state.currentStats = {
      score: 100 - Math.min(100, analysis.totalSize / 1024), // Simple score based on size
      totalSize: analysis.totalSize,
      fileCount: analysis.fileCount
    };

    // Record initial file sizes
    const files = await scanDirectory(dirPath);
    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        state.fileSizes.set(file, stat.size);
      } catch {
        // File may have been deleted
      }
    }

    state.isInitialized = true;
    return analysis;
  } catch (error) {
    console.error('Failed to initialize watcher:', error.message);
    throw error;
  }
}

/**
 * Recursively scan directory for watched files
 */
async function scanDirectory(dirPath, files = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip node_modules and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, files);
      } else if (WATCH_EXTENSIONS.includes(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }

  return files;
}

/**
 * Watch a single file and report changes
 */
function watchFile(filePath, state, onFileChange) {
  // Clear any existing watcher for this file
  if (state.watchers.has(filePath)) {
    const oldWatcher = state.watchers.get(filePath);
    try {
      oldWatcher.close();
    } catch {
      // Already closed
    }
  }

  try {
    const watcher = fs.watch(filePath, { persistent: true }, (eventType, filename) => {
      // Debounce rapid consecutive changes
      const now = Date.now();
      if (now - state.lastUpdateTime < 100) {
        return;
      }
      state.lastUpdateTime = now;

      if (eventType === 'change') {
        try {
          const stat = fs.statSync(filePath);
          const previousSize = state.fileSizes.get(filePath) || stat.size;
          const sizeDelta = stat.size - previousSize;

          state.fileSizes.set(filePath, stat.size);
          onFileChange(filePath, sizeDelta, stat.size);
        } catch {
          // File may have been deleted
        }
      }
    });

    state.watchers.set(filePath, watcher);
  } catch (error) {
    console.error(`Failed to watch file ${filePath}:`, error.message);
  }
}

/**
 * Setup all file watchers
 */
async function setupWatchers(dirPath, state, onFileChange) {
  const files = await scanDirectory(dirPath);

  for (const file of files) {
    watchFile(file, state, onFileChange);
  }
}

/**
 * Format the status line
 */
function formatStatusLine(state, lastChangedFile) {
  const score = Math.round(state.currentStats.score);
  const sizeMB = (state.currentStats.totalSize / (1024 * 1024)).toFixed(1);
  const sizeKB = (state.currentStats.totalSize / 1024).toFixed(0);
  const files = state.currentStats.fileCount;

  const displaySize = sizeMB >= 1 ? `${sizeMB}MB` : `${sizeKB}KB`;

  let statusLine = `${ANSI.BRIGHT_CYAN}${ANSI.BOLD}Score: ${score}/100${ANSI.RESET} | `;
  statusLine += `${ANSI.BRIGHT_CYAN}Size: ${displaySize}${ANSI.RESET} | `;
  statusLine += `${ANSI.BRIGHT_CYAN}Files: ${files}${ANSI.RESET}`;

  if (lastChangedFile) {
    statusLine += ` | ${ANSI.DIM}Last change: ${lastChangedFile}${ANSI.RESET}`;
  }

  return statusLine;
}

/**
 * Update terminal status line in place
 */
function updateTerminalLine(state, lastChangedFile, isWarning = false) {
  const statusLine = formatStatusLine(state, lastChangedFile);

  // Move to beginning of line and clear it
  process.stdout.write(`\r${ANSI.CLEAR_LINE}${statusLine}`);
}

/**
 * Flash a warning on the line above
 */
function flashWarning(filename, sizeDelta) {
  const sizeStr = (sizeDelta / 1024).toFixed(1);
  const warningMsg = `⚠️  ${ANSI.BRIGHT_RED}${ANSI.BOLD}WARNING: ${filename} grew by +${sizeStr}KB!${ANSI.RESET}`;

  process.stdout.write(`\n${warningMsg}\n`);
}

/**
 * Print the history panel
 */
function printHistory(state) {
  const history = state.getHistoryString();
  if (history) {
    console.log(`\n${ANSI.DIM}─────────────────────────────────────────────────${ANSI.RESET}`);
    console.log(`${ANSI.BRIGHT_CYAN}${ANSI.BOLD}Change History (Last 10):${ANSI.RESET}`);
    console.log(history);
    console.log(`${ANSI.DIM}─────────────────────────────────────────────────${ANSI.RESET}\n`);
  }
}

/**
 * Main watcher function
 */
export async function watchProject(dirPath) {
  const state = new WatcherState(dirPath);

  console.log(`${ANSI.BRIGHT_CYAN}${ANSI.BOLD}🔍 Starting file watcher...${ANSI.RESET}`);
  console.log(`${ANSI.DIM}Watching .js, .ts, .css, .html, .json files${ANSI.RESET}`);
  console.log(`${ANSI.DIM}Press Ctrl+C to stop${ANSI.RESET}\n`);

  // Initialize watcher
  try {
    await initializeWatcher(dirPath, state);
  } catch (error) {
    console.error(`${ANSI.BRIGHT_RED}Failed to initialize watcher:${ANSI.RESET}`, error.message);
    process.exitCode = 1;
    return;
  }

  // Display initial status
  console.log(`${ANSI.BRIGHT_GREEN}${ANSI.BOLD}✓ Watcher initialized${ANSI.RESET}`);
  console.log(`${ANSI.DIM}Monitoring ${state.currentStats.fileCount} files${ANSI.RESET}\n`);

  // Callback when a file changes
  const onFileChange = (filePath, sizeDelta, newSize) => {
    const filename = path.relative(dirPath, filePath);

    // Add to history
    state.addHistory(filePath, sizeDelta, newSize);

    // Update stats
    state.currentStats.totalSize += sizeDelta;

    const lastChangeStr = `${path.basename(filename)} (${sizeDelta > 0 ? '+' : ''}${(sizeDelta / 1024).toFixed(1)}KB)`;

    // Flash warning if file grew
    if (sizeDelta > 0) {
      flashWarning(filename, sizeDelta);
    }

    // Update status line
    updateTerminalLine(state, lastChangeStr, sizeDelta > 0);
  };

  // Setup file watchers
  try {
    await setupWatchers(dirPath, state, onFileChange);
  } catch (error) {
    console.error(`${ANSI.BRIGHT_RED}Failed to setup watchers:${ANSI.RESET}`, error.message);
    process.exitCode = 1;
    return;
  }

  // Display initial status line
  updateTerminalLine(state, null);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n\n${ANSI.BRIGHT_CYAN}${ANSI.BOLD}📊 Final Report:${ANSI.RESET}`);

    // Print final stats
    printHistory(state);

    if (state.changeHistory.length === 0) {
      console.log(`${ANSI.DIM}No file changes detected.${ANSI.RESET}`);
    }

    // Close all watchers
    for (const watcher of state.watchers.values()) {
      try {
        watcher.close();
      } catch {
        // Already closed
      }
    }

    console.log(`${ANSI.BRIGHT_GREEN}Watcher stopped.${ANSI.RESET}\n`);
    process.exit(0);
  });

  // Keep process alive
  return new Promise(() => {
    // Never resolves, process stays alive until Ctrl+C
  });
}

export default watchProject;
