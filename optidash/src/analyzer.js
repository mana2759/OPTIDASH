import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const VALID_EXTENSIONS = new Set(['.js', '.ts', '.css', '.html']);
const SKIP_DIRS = new Set(['node_modules', 'dist']);

async function collectTargetFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseImportedNames(importLine) {
  const line = importLine.trim();
  if (!line.startsWith('import')) {
    return [];
  }

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

  const namedBlock = line.match(/\{([^}]+)\}/);
  if (namedBlock) {
    const parts = namedBlock[1].split(',').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const alias = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      names.push(alias ? alias[2] : part);
    }
  }

  return names;
}

function countUnusedImportLines(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  let unusedCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trimStart();
    if (!line.startsWith('import')) {
      continue;
    }

    const importedNames = parseImportedNames(lines[i]);
    if (importedNames.length === 0) {
      continue;
    }

    const contentWithoutImportLine = lines.filter((_, index) => index !== i).join('\n');
    const allUnused = importedNames.every((name) => {
      const regex = new RegExp(`\\b${escapeRegex(name)}\\b`);
      return !regex.test(contentWithoutImportLine);
    });

    if (allUnused) {
      unusedCount += 1;
    }
  }

  return unusedCount;
}

function printSummary(result) {
  console.log(chalk.cyan.bold('\nOptiDash Analysis Summary'));
  console.log(chalk.white('Total Size: ') + `${result.totalSize} bytes`);
  console.log(chalk.white('File Count: ') + `${result.fileCount}`);
  console.log(chalk.white('Unused Imports: ') + `${result.unusedImports}`);
  console.log(chalk.white('Memory Used: ') + `${result.memoryUsed} MB`);
  console.log(chalk.white('Scan Time: ') + `${result.scanTime} ms`);

  console.log(chalk.cyan('\nTop 5 Largest Files'));
  if (result.largestFiles.length === 0) {
    console.log('1. (no files found)');
    return;
  }

  result.largestFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file.name} - ${file.size} bytes`);
  });
}

export default async function analyzeProject(dirPath) {
  const start = Date.now();
  const rootDir = path.resolve(dirPath);

  const files = await collectTargetFiles(rootDir);
  let totalSize = 0;
  let unusedImports = 0;
  const sizeRows = [];

  for (const filePath of files) {
    const fileInfo = await stat(filePath);
    const source = await readFile(filePath, 'utf8');

    totalSize += fileInfo.size;
    unusedImports += countUnusedImportLines(source);
    sizeRows.push({
      name: path.relative(rootDir, filePath),
      size: fileInfo.size
    });
  }

  const largestFiles = sizeRows.sort((a, b) => b.size - a.size).slice(0, 5);

  const result = {
    totalSize,
    fileCount: files.length,
    largestFiles,
    unusedImports,
    memoryUsed: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)),
    scanTime: Date.now() - start
  };

  printSummary(result);
  return result;
}
