import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import analyzeProject from './analyzer.js';

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function gradeFromScore(score) {
	if (score >= 95) return 'A+';
	if (score >= 85) return 'A';
	if (score >= 75) return 'B';
	if (score >= 60) return 'C';
	return 'F';
}

function gradeColor(grade) {
	if (grade === 'A+' || grade === 'A') return '#b8ff57';
	if (grade === 'B') return '#ffd166';
	if (grade === 'C') return '#ff9f43';
	return '#ff6b6b';
}

function buildBadgeSvg(score, grade) {
	const rightText = `${grade} · ${score}/100`;
	const rightColor = gradeColor(grade);

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="28" role="img" aria-label="optimization score">
	<rect x="0" y="0" width="80" height="28" fill="#2d2d2d" />
	<rect x="80" y="0" width="80" height="28" fill="${rightColor}" />
	<text x="40" y="18" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans,sans-serif" font-size="11">optimized</text>
	<text x="120" y="18" text-anchor="middle" fill="#111111" font-family="DejaVu Sans,sans-serif" font-size="11">${rightText}</text>
</svg>
`;
}

async function ensureReadmeLine(projectRoot) {
	const readmePath = path.join(projectRoot, 'README.md');
	const badgeLine = '![Optimization Score](./reports/badge.svg)';

	if (!existsSync(readmePath)) {
		await writeFile(readmePath, `${badgeLine}\n`, 'utf8');
		return;
	}

	const readme = await readFile(readmePath, 'utf8');
	if (readme.includes(badgeLine)) {
		return;
	}

	const separator = readme.endsWith('\n') ? '' : '\n';
	await writeFile(readmePath, `${readme}${separator}${badgeLine}\n`, 'utf8');
}

export default async function generateBadge(dirPath) {
	const projectRoot = path.resolve(dirPath);
	const stats = await analyzeProject(projectRoot);

	const sizeKB = stats.totalSize / 1024;
	const sizePenalty = Math.max(0, Math.floor((sizeKB - 50) / 10));
	const memoryOver30 = Math.max(0, stats.memoryUsed - 30);
	const memoryPenalty = Math.round(memoryOver30 * 5);

	let score = 100;
	score -= stats.unusedImports;
	score -= sizePenalty;
	score -= memoryPenalty;
	score = clamp(Math.round(score), 0, 100);

	const grade = gradeFromScore(score);

	const reportsDir = path.join(projectRoot, 'reports');
	await mkdir(reportsDir, { recursive: true });

	const badgePath = path.join(reportsDir, 'badge.svg');
	const svg = buildBadgeSvg(score, grade);
	await writeFile(badgePath, svg, 'utf8');

	await ensureReadmeLine(projectRoot);

	const gradeColorized = grade === 'F'
		? chalk.red(grade)
		: grade === 'C'
			? chalk.keyword('orange')(grade)
			: grade === 'B'
				? chalk.yellow(grade)
				: chalk.green(grade);

	console.log(chalk.cyan('Optimization badge generated'));
	console.log(`${chalk.white('Grade:')} ${gradeColorized}`);
	console.log(`${chalk.white('Badge:')} ${chalk.magenta(badgePath)}`);

	return { score, grade, badgePath };
}
