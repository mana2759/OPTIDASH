# File Watcher - Feature Documentation

## Overview

The File Watcher (`optidash watch <path>`) monitors a project for file changes and provides real-time metrics updates. It uses Node.js `fs.watch` with ANSI escape codes to update terminal display in-place without scrolling.

## Implementation Details

### File: `src/watcher.js`

#### Core Components

**WatcherState Class**
- Maintains current project statistics
- Tracks file sizes to detect changes
- Keeps history of last 10 file changes
- Manages active file watchers

**Key Functions**

`watchProject(dirPath)`
- Main entry point
- Initializes watcher state
- Sets up file watching
- Handles graceful shutdown

`initializeWatcher(dirPath, state)`
- Runs initial project analysis
- Records baseline file sizes
- Establishes initial statistics

`scanDirectory(dirPath, files)`
- Recursively walks directory tree
- Collects all watched files (.js, .ts, .css, .html, .json)
- Skips node_modules, dist, .hidden directories

`watchFile(filePath, state, onFileChange)`
- Attaches fs.watch to individual file
- Debounces rapid changes (100ms minimum)
- Detects size deltas
- Triggers callback on change

`updateTerminalLine(state, lastChangedFile, isWarning)`
- Uses ANSI escape codes to update current line
- No scrolling - overwrites in place
- Shows: Score, Size, File count, Last change

`flashWarning(filename, sizeDelta)`
- Displays red warning when file grows
- Shows filename and size increase
- Appears on line above status

`formatStatusLine(state, lastChangedFile)`
- Formats colored status line
- Shows all key metrics
- Uses ANSI color codes

## Features

### Real-Time Status Line

```
Score: 87/100 | Size: 680KB | Files: 188 | Last change: index.js (-2KB)
```

Components:
- **Score**: Health metric (0-100)
- **Size**: Total project size (auto KB/MB)
- **Files**: Total monitored files
- **Last change**: Filename and size delta

### ANSI Terminal Control

Uses escape codes for:
- `\x1b[2K` - Clear current line
- `\x1b[31m` - Red text (warnings)
- `\x1b[32m` - Green text (improvements)
- `\x1b[36m` - Cyan text (metrics)
- `\x1b[1m` - Bold text
- `\x1b[2m` - Dim text

### Change Detection

**Monitors file extensions**:
- `.js` - JavaScript
- `.ts` - TypeScript
- `.css` - Stylesheets
- `.html` - HTML templates
- `.json` - Configuration files

**Debouncing**: Changes less than 100ms apart are ignored (prevents duplicate triggers)

### Warning System

Flashes red warning when:
- File size increases
- Shows delta in KB
- Appears on separate line above status

Example:
```
⚠️  WARNING: bundle.js grew by +15.3KB!
```

### Change History

Maintains 10 most recent changes with:
- Timestamp (HH:MM:SS format)
- Filename
- Size delta (+ for growth, - for reduction)
- Color coding (red for growth, green for reduction)

**Display on exit** (Ctrl+C):
```
Change History (Last 10):
1. [14:32:15] index.js -2.1KB
2. [14:31:48] utils.ts +0.5KB
3. [14:31:32] styles.css -1.8KB
...
```

## Usage

### CLI Command

```bash
optidash watch <path>
```

### Example Session

```
$ node src/cli.js watch .

   ____        __  _ ____            __    
  / __ ____  / /_(_) __ ____ ______/ /_   
 / / / / __ / __/ / / / / __ `/ ___/ __ \  
/ /_/ / /_/ / /_/ / /_/ / /_/ (__  ) / / /  
\____/ .___/\__/_/_____/\__,_/____/_/ /_/   
     /_/
Fast Project Analyzer + Optimizer

🔍 Starting file watcher...
Watching .js, .ts, .css, .html, .json files
Press Ctrl+C to stop

✓ Watcher initialized
Monitoring 188 files

Score: 87/100 | Size: 680KB | Files: 188

# User saves a file, watcher detects change:
⚠️  WARNING: bundle.js grew by +5.2KB!
Score: 85/100 | Size: 685KB | Files: 188 | Last change: bundle.js (+5.2KB)

# User continues working, watcher updates:
Score: 85/100 | Size: 675KB | Files: 188 | Last change: utils.js (-10.1KB)

# When Ctrl+C is pressed:
📊 Final Report:
──────────────────────────────────────
Change History (Last 10):
1. [14:32:15] utils.js -10.1KB
2. [14:32:08] bundle.js +5.2KB
...
──────────────────────────────────────

Watcher stopped.
```

## Architecture

### State Management

```
WatcherState
├── projectPath: string
├── fileSizes: Map<path, size>
├── changeHistory: Array<{timestamp, filename, sizeDelta, newSize}>
├── currentStats: {score, totalSize, fileCount}
├── watchers: Map<path, FSWatcher>
├── isInitialized: boolean
└── lastUpdateTime: number (debouncing)
```

### Change Flow

```
scanDirectory()
  ↓
readDependencies() for each file
  ↓
calculateStats()
  ↓
setupWatchers() for monitored files
  ↓
fs.watch() per file
  ↓
onFileChange() callback
  ↓
  ├─ calculateSizeDelta()
  ├─ updateStats()
  ├─ addToHistory()
  ├─ flashWarning() if size > 0
  └─ updateTerminalLine()
```

## Performance Characteristics

- **Initial scan**: O(n) where n = files in directory
- **Per-file watch**: Minimal overhead (os-level)
- **Change detection**: Instant (sub-10ms)
- **Terminal updates**: 100ms debounce prevents flickering

## Terminal Behavior

### In-Place Updates
- Uses `\r` (carriage return) to return to line start
- Uses `\x1b[2K` (clear line) to remove old content
- Overwrites same line - no scrolling

### Graceful Shutdown
- Closes all file watchers on Ctrl+C
- Displays final report with change history
- Shows total changes and summary

## Configuration

**Watched Extensions**: `.js`, `.ts`, `.css`, `.html`, `.json`

**Skipped Directories**:
- `node_modules/`
- `dist/`
- `.` (hidden directories)

**Debounce Interval**: 100ms between change detections

**History Size**: Last 10 changes kept

## Error Handling

- Missing project directory → Error message and exit
- File deleted during watch → Gracefully skipped
- File access denied → Logged and continues
- Watcher fail → Attempts to re-create

## Integration with CLI

Added to `src/cli.js`:
```javascript
import { watchProject } from './watcher.js';

program
  .command('watch <path>')
  .description('Watches for file changes and updates live project metrics.')
  .action(async (targetPath) => {
    try {
      showHeader();
      await watchProject(targetPath);
    } catch (error) {
      console.error(chalk.red(`Watch failed: ${error.message}`));
      process.exitCode = 1;
    }
  });
```

## Related Features

- **Analyzer** (`optidash analyze`): Gets initial project metrics
- **Optimizer** (`optidash optimize`): Can be run alongside watcher
- **Deps** (`optidash deps`): Shows dependency impact on size
- **Dashboard** (`optidash serve`): Web UI for metrics

## Future Enhancements

1. **Performance metrics**: Track build times, bundle impact
2. **File-specific rules**: Different thresholds for different file types
3. **Webhook notifications**: Alert on significant changes
4. **Historical graphs**: Plot change trends over time
5. **Custom thresholds**: Alert when files exceed configured limit
6. **Auto-optimize**: Trigger optimizer on detection of growth
7. **Network watch**: Monitor for unintended dependencies
8. **Bundle analysis**: Show what exact packages are causing growth

## Advanced Usage

### Watching a Subdirectory
```bash
optidash watch ./src
optidash watch ./components
```

### Combining with Other Tools
```bash
# In one terminal: watch for changes
optidash watch .

# In another terminal: run optimizations
optidash optimize .
```

### Integration with CI/CD
The watcher can be used as a development tool to catch growing files early, before they reach production thresholds.

## Troubleshooting

**Watcher not detecting changes?**
- Ensure file extensions are in the watched list
- Check file permissions
- Try stopping and restarting watcher

**Too many warnings?**
- Expected if rapidly saving large files
- Warnings appear only when size increases
- Use progress features to see actual impact

**High terminal CPU?**
- fs.watch is efficient at OS level
- Terminal updates are debounced
- Check if many files are being simultaneously modified
