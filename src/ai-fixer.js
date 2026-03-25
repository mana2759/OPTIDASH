import path from 'node:path';
import { promises as fs } from 'node:fs';

const MODEL = 'claude-sonnet-4-20250514';
const SYSTEM_PROMPT = 'You are a code optimizer. Return ONLY the optimized version of this code with: unused imports removed, variables inlined where safe, loops replaced with efficient alternatives, and a JSON comment at the top showing: { removedImports: N, optimizedLoops: N, savedBytes: N }';

function toKB(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function parseTopJsonComment(content) {
  const jsStyleMatch = content.match(/^\s*\/\/\s*(\{[^\n]*\})\s*\n?/);
  if (jsStyleMatch) {
    try {
      return {
        stats: JSON.parse(jsStyleMatch[1]),
        code: content.replace(jsStyleMatch[0], '')
      };
    } catch {
      return { stats: null, code: content };
    }
  }

  const blockMatch = content.match(/^\s*\/\*\s*(\{[\s\S]*?\})\s*\*\/\s*/);
  if (blockMatch) {
    try {
      return {
        stats: JSON.parse(blockMatch[1]),
        code: content.replace(blockMatch[0], '')
      };
    } catch {
      return { stats: null, code: content };
    }
  }

  return { stats: null, code: content };
}

async function collectCodeFiles(rootDir) {
  const files = [];
  const exts = new Set(['.js', '.ts']);

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
          continue;
        }

        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (exts.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

async function optimizeWithClaude({ apiKey, filePath, code }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Optimize this file and return only code. File path: ${filePath}\n\n${code}`
        }
      ]
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${payload}`);
  }

  const payload = await response.json();
  const textOutput = (payload.content || []).find((item) => item.type === 'text')?.text;

  if (!textOutput) {
    throw new Error('Anthropic response did not include optimized code output.');
  }

  return textOutput;
}

export async function aiFixProject(projectPath = '.') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }

  const rootDir = path.resolve(projectPath);
  const files = await collectCodeFiles(rootDir);
  const outputRoot = path.join(rootDir, 'dist', 'ai-fixed');

  await fs.mkdir(outputRoot, { recursive: true });

  const totals = {
    filesFixed: 0,
    removedImports: 0,
    optimizedLoops: 0,
    savedBytes: 0
  };

  for (const filePath of files) {
    const originalCode = await fs.readFile(filePath, 'utf8');
    const optimizedRaw = await optimizeWithClaude({
      apiKey,
      filePath: path.relative(rootDir, filePath),
      code: originalCode
    });

    const { stats, code } = parseTopJsonComment(optimizedRaw);

    const relativePath = path.relative(rootDir, filePath);
    const outputFilePath = path.join(outputRoot, relativePath);
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    await fs.writeFile(outputFilePath, code, 'utf8');

    const originalBytes = Buffer.byteLength(originalCode, 'utf8');
    const optimizedBytes = Buffer.byteLength(code, 'utf8');
    const fallbackSavedBytes = Math.max(0, originalBytes - optimizedBytes);

    totals.filesFixed += 1;
    totals.removedImports += Number(stats?.removedImports || 0);
    totals.optimizedLoops += Number(stats?.optimizedLoops || 0);
    totals.savedBytes += Number(stats?.savedBytes || fallbackSavedBytes);
  }

  const summaryLine = `AI fixed ${totals.filesFixed} files, removed ${totals.removedImports} unused imports, saved ${toKB(totals.savedBytes)}KB`;
  console.log(summaryLine);

  return {
    ...totals,
    savedKB: toKB(totals.savedBytes),
    outputRoot,
    summaryLine
  };
}
