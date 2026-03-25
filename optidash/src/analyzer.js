import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const VALID_EXTENSIONS = new Set(['.js', '.ts', '.css', '.html']);

async function collectTargetFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTargetFiles(fullPath)));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (VALID_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseImportedNames(importLine) {
  const line = importLine.trim();
  if (!line.startsWith('import')) {
    return [];
  }

  // Side-effect imports do not bind names.
  if (/^import\s+['"].+['"];?$/.test(line)) {
    return [];
  }

  const names = [];

  const defaultMatch = line.match(/^import\s+([A-Za-z_$][\w$]*)\s*(,|from)/);
  if (defaultMatch) {
    names.push(defaultMatch[1]);
  }

  const namespaceMatch = line.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespaceMatch) {
    names.push(namespaceMatch[1]);
  }

  const namedBlockMatch = line.match(/\{([^}]+)\}/);
  if (namedBlockMatch) {
    const imports = namedBlockMatch[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    for (const item of imports) {
      const aliased = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliased) {
        names.push(aliased[2]);
      } else {
        names.push(item);
      }
    }
  }

  return names;
}

function countUnusedImportLines(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  let count = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('import')) {
      continue;
    }

    const names = parseImportedNames(line);
    if (names.length === 0) {
      continue;
    }

    const restOfFile = lines.slice(i + 1).join('\n');
    const allUnused = names.every((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'm');
      return !regex.test(restOfFile);
    });

    if (allUnused) {
      count += 1;
    }
  }

  return count;
}

export default async function analyzeProject(dirPath) {
  const started = Date.now();
  const resolvedRoot = path.resolve(dirPath);

  const files = await collectTargetFiles(resolvedRoot);
  let totalSize = 0;
  let unusedImports = 0;
  const bySize = [];

  for (const filePath of files) {
    const fileStat = await stat(filePath);
    totalSize += fileStat.size;

    const content = await readFile(filePath, 'utf8');
    unusedImports += countUnusedImportLines(content);

    bySize.push({
      name: path.relative(resolvedRoot, filePath),
      size: fileStat.size
    });
  }

  const largestFiles = bySize
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  const result = {
    totalSize,
    fileCount: files.length,
    largestFiles,
    unusedImports,
    memoryUsed: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)),
    scanTime: Date.now() - started
  };

  console.log(chalk.cyan.bold('\nOptiDash Analysis Summary'));
  console.table([
    { Metric: chalk.white('Total Size'), Value: chalk.yellow(`${result.totalSize} bytes`) },
    { Metric: chalk.white('File Count'), Value: chalk.yellow(String(result.fileCount)) },
    { Metric: chalk.white('Unused Imports'), Value: chalk.yellow(String(result.unusedImports)) },
    { Metric: chalk.white('Memory Used'), Value: chalk.yellow(`${result.memoryUsed} MB`) },
    { Metric: chalk.white('Scan Time'), Value: chalk.yellow(`${result.scanTime} ms`) }
  ]);

  console.log(chalk.magenta('Top 5 Largest Files'));
  console.table(result.largestFiles.map((file, idx) => ({
    '#': chalk.gray(String(idx + 1)),
    File: chalk.white(file.name),
    Size: chalk.green(`${file.size} bytes`)
  })));

  return result;
}

if (import.meta.url === new URL(import.meta.url).href) {
  analyzeProject('./').catch((error) => {
    console.error(chalk.red('Analyzer failed:'), error.message);
    process.exitCode = 1;
  });
}
