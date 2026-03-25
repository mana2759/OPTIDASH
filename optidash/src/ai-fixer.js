import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const CODE_EXTENSIONS = new Set(['.js', '.ts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

async function findCodeFiles(dirPath) {
	const entries = await readdir(dirPath, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}
			files.push(...(await findCodeFiles(fullPath)));
			continue;
		}

		if (CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			files.push(fullPath);
		}
	}

	return files;
}

function parseOptidashStats(codeText) {
	const match = codeText.match(/OPTIDASH:\s*removedImports=(\d+)\s+optimizedLoops=(\d+)\s+savedBytes=(\d+)/);
	if (!match) {
		return { removedImports: 0, optimizedLoops: 0, savedBytes: 0 };
	}

	return {
		removedImports: Number(match[1] || 0),
		optimizedLoops: Number(match[2] || 0),
		savedBytes: Number(match[3] || 0)
	};
}

function extractTextFromAnthropicResponse(payload) {
	const chunks = Array.isArray(payload?.content) ? payload.content : [];
	const text = chunks
		.filter((item) => item && item.type === 'text')
		.map((item) => item.text)
		.join('\n')
		.trim();

	if (!text) {
		throw new Error('Anthropic API returned no text content');
	}

	return text;
}

export default async function aiFix(dirPath) {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		console.error(chalk.red('Error: ANTHROPIC_API_KEY is not set.')); 
		process.exit(1);
	}

	const root = path.resolve(dirPath);
	const outputDir = path.join(root, 'dist', 'ai-fixed');
	await mkdir(outputDir, { recursive: true });

	const codeFiles = await findCodeFiles(root);

	let filesFixed = 0;
	let removedImports = 0;
	let savedBytes = 0;

	for (const filePath of codeFiles) {
		const source = await readFile(filePath, 'utf8');

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 4096,
				system:
					'You are a code optimizer. Return ONLY the optimized code. Remove unused imports, replace slow loops with map/filter/reduce, remove dead code. Add this comment at top: // OPTIDASH: removedImports=N optimizedLoops=N savedBytes=N',
				messages: [{ role: 'user', content: source }]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
		}

		const payload = await response.json();
		const optimizedCode = extractTextFromAnthropicResponse(payload);

		const outputName = path.basename(filePath);
		const outputPath = path.join(outputDir, outputName);
		await writeFile(outputPath, optimizedCode, 'utf8');

		const stats = parseOptidashStats(optimizedCode);
		removedImports += stats.removedImports;
		savedBytes += stats.savedBytes;
		filesFixed += 1;
	}

	const savedKB = (savedBytes / 1024).toFixed(2);
	console.log(
		chalk.green(`AI fixed ${filesFixed} files — removed ${removedImports} imports, saved ${savedKB} KB`)
	);

	return { filesFixed, removedImports, savedBytes };
}
