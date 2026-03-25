import { watch } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import analyzeProject from './analyzer.js';

const WATCHED_EXTENSIONS = new Set(['.js', '.ts', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function bytesToKB(bytes) {
	return (bytes / 1024).toFixed(2);
}

function sizeDeltaLabel(deltaBytes) {
	const kb = Math.abs(deltaBytes) / 1024;
	if (deltaBytes > 0) return `+${kb.toFixed(2)}KB`;
	if (deltaBytes < 0) return `-${kb.toFixed(2)}KB`;
	return '0.00KB';
}

function scoreFromAnalysis(analysis) {
	const sizeKB = analysis.totalSize / 1024;

	// 40 pts: full score if <= 50KB, then -1 per additional 10KB.
	const sizePenalty = sizeKB <= 50 ? 0 : Math.ceil((sizeKB - 50) / 10);
	const sizePoints = Math.max(0, 40 - sizePenalty);

	// 30 pts: full score only when zero unused imports.
	const importPoints = analysis.unusedImports === 0
		? 30
		: Math.max(0, 30 - analysis.unusedImports);

	// 30 pts: full score if <= 50MB, then -1 per extra MB.
	const memoryPenalty = analysis.memoryUsed <= 50 ? 0 : Math.ceil(analysis.memoryUsed - 50);
	const memoryPoints = Math.max(0, 30 - memoryPenalty);

	return Math.max(0, Math.min(100, sizePoints + importPoints + memoryPoints));
}

async function collectSizesRecursive(rootDir) {
	const sizeMap = new Map();
	const entries = await readdir(rootDir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}
			const nested = await collectSizesRecursive(fullPath);
			for (const [file, bytes] of nested) {
				sizeMap.set(file, bytes);
			}
			continue;
		}

		const ext = path.extname(entry.name).toLowerCase();
		if (!WATCHED_EXTENSIONS.has(ext)) {
			continue;
		}

		const info = await stat(fullPath);
		sizeMap.set(fullPath, info.size);
	}

	return sizeMap;
}

async function runAnalyzeSilenced(targetPath) {
	const originalLog = console.log;
	const originalTable = console.table;
	console.log = () => {};
	console.table = () => {};
	try {
		return await analyzeProject(targetPath);
	} finally {
		console.log = originalLog;
		console.table = originalTable;
	}
}

export default async function watchProject(dirPath) {
	const root = path.resolve(dirPath);
	const knownSizes = await collectSizesRecursive(root);
	const lastTenChanges = [];
	const debounceTimers = new Map();

	const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
		if (!filename) {
			return;
		}

		const relativePath = String(filename);
		const ext = path.extname(relativePath).toLowerCase();
		if (!WATCHED_EXTENSIONS.has(ext)) {
			return;
		}

		const fullPath = path.resolve(root, relativePath);

		if (debounceTimers.has(fullPath)) {
			clearTimeout(debounceTimers.get(fullPath));
		}

		const timer = setTimeout(async () => {
			debounceTimers.delete(fullPath);

			try {
				const fileInfo = await stat(fullPath);
				const previousSize = knownSizes.has(fullPath) ? knownSizes.get(fullPath) : fileInfo.size;
				const sizeDiff = fileInfo.size - previousSize;
				knownSizes.set(fullPath, fileInfo.size);

				// 2a) Analyze changed file.
				await runAnalyzeSilenced(fullPath);

				// Recompute project-wide view for score and line metrics.
				const projectAnalysis = await runAnalyzeSilenced(root);
				const score = scoreFromAnalysis(projectAnalysis);

				const changedName = path.basename(fullPath);
				const line = `Score: ${score}/100 | Size: ${bytesToKB(projectAnalysis.totalSize)}KB | Files: ${projectAnalysis.fileCount} | Changed: ${changedName} (${sizeDeltaLabel(sizeDiff)})`;

				lastTenChanges.push({ filename: changedName, timestamp: new Date().toISOString() });
				if (lastTenChanges.length > 10) {
					lastTenChanges.shift();
				}

				process.stdout.write('\r\x1b[K');
				process.stdout.write(sizeDiff > 0 ? chalk.red(line) : line);
			} catch {
				// Ignore transient changes (deleted/renamed mid-event).
			}
		}, 120);

		debounceTimers.set(fullPath, timer);
	});

	const onSigint = () => {
		process.stdout.write('\r\x1b[K\n');
		console.log(chalk.cyan('Change history (last 10):'));
		if (lastTenChanges.length === 0) {
			console.log(chalk.gray('No changes captured.'));
		} else {
			for (const item of lastTenChanges) {
				console.log(`${chalk.gray(item.timestamp)} ${chalk.white(item.filename)}`);
			}
		}

		watcher.close();
		process.exit(0);
	};

	process.on('SIGINT', onSigint);
	console.log(chalk.green(`Watching ${root} (.js, .ts, .css). Press Ctrl+C to stop.`));

	return {
		watching: true,
		root,
		close: () => {
			watcher.close();
			process.off('SIGINT', onSigint);
		}
	};
}
