#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { build } from 'esbuild';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';

const program = new Command();
let bannerPrinted = false;

function printBanner() {
	if (bannerPrinted) {
		return;
	}

	const c = chalk.hex('#b8ff57');
	console.log(
		c('  ██████╗ ██████╗ ████████╗██╗██████╗  █████╗ ███████╗██╗  ██╗') + '\n' +
		c('  ██╔══██╗██╔══██╗╚══██╔══╝██║██╔══██╗██╔══██╗██╔════╝██║  ██║') + '\n' +
		c('  ██║  ██║██████╔╝   ██║   ██║██║  ██║███████║███████╗███████║') + '\n' +
		c('  ╚═════╝ ╚═════╝    ╚═╝   ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝  v2.0')
	);
	console.log();
	bannerPrinted = true;
}

function formatSize(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(2)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function getDirectorySize(dirPath) {
	let total = 0;
	const entries = await readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			total += await getDirectorySize(fullPath);
		} else {
			total += (await stat(fullPath)).size;
		}
	}

	return total;
}

async function runWithSpinner(text, fn) {
	const spinner = ora(text).start();
	try {
		const result = await fn();
		spinner.succeed(`${text} done`);
		return result;
	} catch (error) {
		spinner.fail(`${text} failed`);
		throw error;
	}
}

program
	.name('optidash')
	.description('OptiDash CLI v2.0')
	.version('2.0.0', '-v, --version', 'show version 2.0.0')
	.showHelpAfterError();

program.hook('preAction', () => {
	printBanner();
});

program
	.command('analyze <path>')
	.description('Run project analyzer')
	.action(async (targetPath) => {
		await runWithSpinner('Analyzing project', async () => {
			const { default: analyzeProject } = await import('./analyzer.js');
			return analyzeProject(targetPath);
		});
	});

program
	.command('optimize <path>')
	.description('Optimize project assets')
	.action(async (targetPath) => {
		await runWithSpinner('Optimizing project', async () => {
			const { default: optimizeProject } = await import('./optimizer.js');
			return optimizeProject(targetPath);
		});
	});

program
	.command('ai-fix <path>')
	.description('Run AI code fixes')
	.action(async (targetPath) => {
		await runWithSpinner('Running AI fix', async () => {
			const module = await import('./ai-fixer.js');
			const aiFix = module.default ?? module.aiFix;
			if (typeof aiFix !== 'function') {
				throw new Error('aiFix function not found in ai-fixer.js');
			}
			return aiFix(targetPath);
		});
	});

program
	.command('benchmark <path>')
	.description('Benchmark project performance')
	.action(async (targetPath) => {
		await runWithSpinner('Running benchmark', async () => {
			const module = await import('./benchmark.js');
			const benchmarkProject = module.default ?? module.benchmarkProject;
			if (typeof benchmarkProject !== 'function') {
				throw new Error('benchmarkProject function not found in benchmark.js');
			}
			return benchmarkProject(targetPath);
		});
	});

program
	.command('watch <path>')
	.description('Watch project and react to changes')
	.action(async (targetPath) => {
		await runWithSpinner('Starting watch mode', async () => {
			const module = await import('./watcher.js');
			const watchProject = module.default ?? module.watchProject;
			if (typeof watchProject !== 'function') {
				throw new Error('watchProject function not found in watcher.js');
			}
			return watchProject(targetPath);
		});
	});

program
	.command('badge <path>')
	.description('Generate optimization badge')
	.action(async (targetPath) => {
		await runWithSpinner('Generating badge', async () => {
			const module = await import('./badge.js');
			const generateBadge = module.default ?? module.generateBadge;
			if (typeof generateBadge !== 'function') {
				throw new Error('generateBadge function not found in badge.js');
			}
			return generateBadge(targetPath);
		});
	});

program
	.command('serve <path>')
	.description('Start OptiDash server')
	.action(async (targetPath) => {
		await runWithSpinner('Starting server', async () => {
			const module = await import('./server.js');
			const startServer = module.default ?? module.startServer;
			if (typeof startServer !== 'function') {
				throw new Error('startServer function not found in server.js');
			}
			return startServer(targetPath);
		});
	});

program
	.command('self-optimize')
	.description('Bundle this CLI and compare node_modules size vs bundle size')
	.action(async () => {
		await runWithSpinner('Self-optimizing CLI', async () => {
			const cwd = process.cwd();
			const nodeModulesPath = path.join(cwd, 'node_modules');
			const distDir = path.join(cwd, 'dist');
			const outputFile = path.join(distDir, 'optidash.js');

			await mkdir(distDir, { recursive: true });

			const originalSize = await getDirectorySize(nodeModulesPath);

			await build({
				entryPoints: [path.join(cwd, 'src', 'cli.js')],
				outfile: outputFile,
				bundle: true,
				minify: true,
				platform: 'node',
				format: 'esm',
				target: 'node18'
			});

			const finalSize = (await stat(outputFile)).size;
			const reductionPercent = originalSize > 0
				? Math.round(((originalSize - finalSize) / originalSize) * 100)
				: 0;

			console.log(chalk.cyan('\nSelf-Optimize Results'));
			console.log(`${chalk.white('node_modules size:')} ${chalk.yellow(formatSize(originalSize))}`);
			console.log(`${chalk.white('Final bundle size:')} ${chalk.yellow(formatSize(finalSize))}`);
			console.log(`${chalk.green('Reduction:')} ${chalk.green(`${reductionPercent}%`)}`);
		});
	});

printBanner();

program.parseAsync(process.argv).catch((error) => {
	console.error(chalk.red(error?.message ?? String(error)));
	process.exitCode = 1;
});
