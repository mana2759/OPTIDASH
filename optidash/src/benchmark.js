import { access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import chalk from 'chalk';
import optimizeProject from './optimizer.js';

const RUN_COUNT = 20;

function toMs(start, end) {
	return Number((end - start).toFixed(2));
}

function percentile(values, p) {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[index];
}

function summarizeRuns(timesMs, memorySnapshotsBytes) {
	const avgTime = timesMs.length > 0
		? Number((timesMs.reduce((sum, n) => sum + n, 0) / timesMs.length).toFixed(2))
		: 0;

	return {
		runs: timesMs,
		memorySnapshots: memorySnapshotsBytes,
		avgTime,
		minTime: timesMs.length > 0 ? Math.min(...timesMs) : 0,
		maxTime: timesMs.length > 0 ? Math.max(...timesMs) : 0,
		p95Time: Number(percentile(timesMs, 95).toFixed(2)),
		peakMemoryBytes: memorySnapshotsBytes.length > 0 ? Math.max(...memorySnapshotsBytes) : 0,
		peakMemoryMB: memorySnapshotsBytes.length > 0
			? Number((Math.max(...memorySnapshotsBytes) / (1024 * 1024)).toFixed(2))
			: 0
	};
}

async function findEntryFile(dirPath) {
	const candidates = [
		path.join(dirPath, 'index.js'),
		path.join(dirPath, 'main.js')
	];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// try next candidate
		}
	}

	throw new Error(`Unable to locate main entry file (index.js or main.js) in: ${dirPath}`);
}

async function runEntryMultipleTimes(entryPath, cwd) {
	const timesMs = [];
	const memorySnapshotsBytes = [];

	for (let i = 0; i < RUN_COUNT; i += 1) {
		memorySnapshotsBytes.push(process.memoryUsage().heapUsed);

		const startedAt = performance.now();
		await new Promise((resolve, reject) => {
			execFile(process.execPath, [entryPath], { cwd }, (error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
		const endedAt = performance.now();
		timesMs.push(toMs(startedAt, endedAt));
	}

	return summarizeRuns(timesMs, memorySnapshotsBytes);
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

function printComparisonTable(beforeStats, afterStats, sizeBefore, sizeAfter) {
	const avgImprove = pctImprovement(beforeStats.avgTime, afterStats.avgTime);
	const memoryImprove = pctImprovement(beforeStats.peakMemoryMB, afterStats.peakMemoryMB);
	const sizeImprove = pctImprovement(sizeBefore, sizeAfter);

	const rows = [
		{
			Metric: 'Avg time',
			Before: formatMs(beforeStats.avgTime),
			After: formatMs(afterStats.avgTime),
			Improvement: chalk.green(`${avgImprove}% faster`)
		},
		{
			Metric: 'Peak memory',
			Before: formatMb(beforeStats.peakMemoryMB),
			After: formatMb(afterStats.peakMemoryMB),
			Improvement: chalk.green(`${memoryImprove}% less`)
		},
		{
			Metric: 'Bundle size',
			Before: formatKbFromBytes(sizeBefore),
			After: formatKbFromBytes(sizeAfter),
			Improvement: chalk.green(`${sizeImprove}% smaller`)
		}
	];

	console.log(chalk.cyan.bold('\nBenchmark Comparison'));
	console.table(rows);
}

export default async function benchmarkProject(dirPath) {
	const root = path.resolve(dirPath);
	const beforeEntry = await findEntryFile(root);

	const before = await runEntryMultipleTimes(beforeEntry, root);

	const optimization = await optimizeProject(root);

	const afterEntry = path.join(root, 'dist', 'bundle.js');
	await access(afterEntry);

	const after = await runEntryMultipleTimes(afterEntry, root);

	printComparisonTable(before, after, optimization.originalSize, optimization.optimizedSize);

	return {
		before,
		after,
		optimization,
		comparison: {
			avgTimeImprovementPercent: pctImprovement(before.avgTime, after.avgTime),
			peakMemoryImprovementPercent: pctImprovement(before.peakMemoryMB, after.peakMemoryMB),
			bundleSizeImprovementPercent: pctImprovement(optimization.originalSize, optimization.optimizedSize)
		}
	};
}
