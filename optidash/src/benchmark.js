import { access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import chalk from 'chalk';
import optimizeProject from './optimizer.js';

const RUN_COUNT = 20;

function percentile(values, p) {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[index];
}

function toMB(bytes) {
	return Number((bytes / (1024 * 1024)).toFixed(2));
}

async function findEntryFile(dirPath) {
	const candidates = [path.join(dirPath, 'index.js'), path.join(dirPath, 'main.js')];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// try next candidate
		}
	}

	return null;
}

function summarizeRuns(timesMs, memorySnapshotsMB) {
	const avgTime = timesMs.length > 0
		? Number((timesMs.reduce((sum, n) => sum + n, 0) / timesMs.length).toFixed(2))
		: 0;

	return {
		runs: timesMs,
		memorySnapshots: memorySnapshotsMB,
		avgTime,
		minTime: timesMs.length > 0 ? Math.min(...timesMs) : 0,
		maxTime: timesMs.length > 0 ? Math.max(...timesMs) : 0,
		p95Time: Number(percentile(timesMs, 95).toFixed(2)),
		peakMemoryMB: memorySnapshotsMB.length > 0 ? Math.max(...memorySnapshotsMB) : 0
	};
}

async function runEntryMultipleTimes(entryPath, cwd) {
	const timesMs = [];
	const memorySnapshotsMB = [];

	for (let i = 0; i < RUN_COUNT; i += 1) {
		memorySnapshotsMB.push(toMB(process.memoryUsage().heapUsed));

		const startedAt = Date.now();
		await new Promise((resolve, reject) => {
			execFile(process.execPath, [entryPath], { cwd }, (error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
		const endedAt = Date.now();
		timesMs.push(endedAt - startedAt);
	}

	return summarizeRuns(timesMs, memorySnapshotsMB);
}

function pctImprovement(before, after) {
	if (before <= 0) {
		return 0;
	}
	return Math.round(((before - after) / before) * 100);
}

function formatMs(value) {
	return `${Number(value).toFixed(2)}ms`;
}

function formatMb(value) {
	return `${Number(value).toFixed(2)}MB`;
}

function formatKbFromBytes(bytes) {
	return `${(bytes / 1024).toFixed(2)}KB`;
}

function emptyStats() {
	return {
		runs: [],
		memorySnapshots: [],
		avgTime: 0,
		minTime: 0,
		maxTime: 0,
		p95Time: 0,
		peakMemoryMB: 0
	};
}

export default async function benchmarkProject(dirPath) {
	try {
		const root = path.resolve(dirPath);
		let before = emptyStats();
		let after = emptyStats();
		let beforeEntry = await findEntryFile(root);

		if (!beforeEntry) {
			console.log(chalk.yellow('Warning: No index.js or main.js found. Skipping run benchmarks.'));
		}

		if (beforeEntry) {
			try {
				before = await runEntryMultipleTimes(beforeEntry, root);
			} catch (error) {
				console.log(chalk.yellow(`Warning: Before-runs failed (${error.message}). Continuing.`));
				before = emptyStats();
			}
		}

		let optimization = {
			originalSize: 0,
			optimizedSize: 0,
			gzipSize: 0,
			reductionPercent: 0,
			timeTaken: 0
		};

		try {
			optimization = await optimizeProject(root);
		} catch (error) {
			console.log(chalk.yellow(`Warning: Optimization failed (${error.message}). Continuing.`));
		}

		const afterEntry = path.join(root, 'dist', 'bundle.js');
		if (beforeEntry) {
			try {
				await access(afterEntry);
				after = await runEntryMultipleTimes(afterEntry, root);
			} catch (error) {
				console.log(chalk.yellow(`Warning: After-runs failed (${error.message}). Continuing.`));
				after = emptyStats();
			}
		}

		const avgImprove = pctImprovement(before.avgTime, after.avgTime);
		const memoryImprove = pctImprovement(before.peakMemoryMB, after.peakMemoryMB);
		const sizeImprove = pctImprovement(optimization.originalSize, optimization.optimizedSize);
		const hasRuntimeComparison = before.runs.length > 0 && after.runs.length > 0;

		console.log(chalk.cyan.bold('\nBenchmark Comparison'));
		console.table([
			{
				Metric: chalk.white('Avg time'),
				Before: hasRuntimeComparison ? formatMs(before.avgTime) : chalk.gray('N/A'),
				After: hasRuntimeComparison ? formatMs(after.avgTime) : chalk.gray('N/A'),
				Improvement: hasRuntimeComparison ? chalk.green(`${avgImprove}% faster`) : chalk.gray('N/A')
			},
			{
				Metric: chalk.white('Peak memory'),
				Before: hasRuntimeComparison ? formatMb(before.peakMemoryMB) : chalk.gray('N/A'),
				After: hasRuntimeComparison ? formatMb(after.peakMemoryMB) : chalk.gray('N/A'),
				Improvement: hasRuntimeComparison ? chalk.green(`${memoryImprove}% less`) : chalk.gray('N/A')
			},
			{
				Metric: chalk.white('Bundle size'),
				Before: formatKbFromBytes(optimization.originalSize),
				After: formatKbFromBytes(optimization.optimizedSize),
				Improvement: chalk.green(`${sizeImprove}% smaller`)
			}
		]);

		return {
			before,
			after,
			optimization,
			comparison: {
				avgTimeImprovementPercent: hasRuntimeComparison ? avgImprove : 0,
				peakMemoryImprovementPercent: hasRuntimeComparison ? memoryImprove : 0,
				bundleSizeImprovementPercent: sizeImprove
			}
		};
	} catch (error) {
		console.error(chalk.red(`Benchmark failed safely: ${error.message}`));
		return {
			before: emptyStats(),
			after: emptyStats(),
			optimization: {
				originalSize: 0,
				optimizedSize: 0,
				gzipSize: 0,
				reductionPercent: 0,
				timeTaken: 0
			},
			comparison: {
				avgTimeImprovementPercent: 0,
				peakMemoryImprovementPercent: 0,
				bundleSizeImprovementPercent: 0
			}
		};
	}
}
