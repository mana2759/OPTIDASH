import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeProject } from './analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Calculate letter grade from score (0-100)
 */
function calculateGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'F';
}

/**
 * Get color for badge based on grade
 */
function getGradeColor(grade) {
  switch (grade) {
    case 'A+':
    case 'A':
      return '#4CAF50'; // Green
    case 'B':
      return '#8BC34A'; // Light green
    case 'C':
      return '#FFC107'; // Orange/Yellow
    case 'F':
      return '#F44336'; // Red
    default:
      return '#9E9E9E'; // Gray
  }
}

/**
 * Calculate text width for SVG (rough approximation)
 */
function textWidth(text, fontSize = 11) {
  // Approximate: each character is roughly 6-7 pixels at fontSize 11
  return text.length * 6.5;
}

/**
 * Generate shields.io style SVG badge
 *
 * Design:
 * - Two-part rectangle (flat design)
 * - Left: dark gray with "optimized"
 * - Right: color based on grade with grade and score
 */
function generateSVG(score) {
  const grade = calculateGrade(score);
  const color = getGradeColor(grade);
  const scoreText = `${grade} ${score}/100`;

  // Calculate widths
  const leftLabel = 'optimized';
  const leftWidth = 80;
  const rightText = scoreText;
  const rightWidth = 80;
  const totalWidth = leftWidth + rightWidth;
  const height = 20;

  // SVG template with shields.io style
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="${height}" role="img" aria-label="optimization score">
  <title>OptiDash Optimization Score</title>
  
  <!-- Define gradients for flat design -->
  <defs>
    <linearGradient id="leftGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:#555;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#333;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="rightGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${adjustColorBrightness(color, -20)};stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Left rectangle (dark gray background) -->
  <rect x="0" y="0" width="${leftWidth}" height="${height}" fill="url(#leftGradient)" rx="3"/>
  
  <!-- Right rectangle (grade color) -->
  <rect x="${leftWidth}" y="0" width="${rightWidth}" height="${height}" fill="url(#rightGradient)" rx="3"/>
  
  <!-- Separator line -->
  <line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="#000" stroke-opacity="0.1" stroke-width="1"/>
  
  <!-- Left text: "optimized" -->
  <text x="${leftWidth / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central" 
        font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#fff">
    ${leftLabel}
  </text>
  
  <!-- Right text: grade and score -->
  <text x="${leftWidth + rightWidth / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#fff">
    ${rightText}
  </text>
</svg>`;

  return svg;
}

/**
 * Adjust color brightness for gradient effect
 */
function adjustColorBrightness(color, percent) {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + (R < 16 ? 0 : '') * R * 0x10000 +
    (G < 16 ? 0 : '') * G * 0x100 + (B < 16 ? 0 : '') * B)
    .toString(16).slice(1);
}

/**
 * Update README with badge reference
 */
async function updateReadmeWithBadge(projectPath) {
  const readmePath = path.join(projectPath, 'README.md');

  if (!fs.existsSync(readmePath)) {
    return { updated: false, reason: 'README.md not found' };
  }

  let content = fs.readFileSync(readmePath, 'utf8');
  const badgeMarkdown = '![Optimization Score](./reports/badge.svg)';

  // Check if badge already exists
  if (content.includes('Optimization Score')) {
    return { updated: false, reason: 'Badge already in README' };
  }

  // Insert badge at the top after title (after first h1)
  const lines = content.split('\n');
  let insertIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) {
      insertIndex = i + 1;
      break;
    }
  }

  // Insert badge with a blank line
  lines.splice(insertIndex, 0, '', badgeMarkdown);
  content = lines.join('\n');

  fs.writeFileSync(readmePath, content, 'utf8');

  return { updated: true, message: 'Badge added to README.md' };
}

/**
 * Main badge generation function
 */
export async function generateBadge(projectPath) {
  try {
    // Analyze project to get score
    const analysis = await analyzeProject(projectPath);

    // Calculate score based on project metrics
    // Simple formula: larger files are worse
    const scoreFactor = Math.max(0, 100 - (analysis.totalSize / 1024 / 10)); // 10MB = 0 points
    const score = Math.round(Math.max(0, Math.min(100, scoreFactor)));

    // Create reports directory if it doesn't exist
    const reportsDir = path.join(projectPath, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate SVG badge
    const svg = generateSVG(score);
    const badgePath = path.join(reportsDir, 'badge.svg');

    // Save badge
    fs.writeFileSync(badgePath, svg, 'utf8');

    // Update README
    const readmeResult = await updateReadmeWithBadge(projectPath);

    const grade = calculateGrade(score);

    return {
      score,
      grade,
      badgePath,
      fileSize: fs.statSync(badgePath).size,
      readmeUpdated: readmeResult.updated,
      readmeMessage: readmeResult.message || readmeResult.reason
    };
  } catch (error) {
    throw new Error(`Badge generation failed: ${error.message}`);
  }
}

/**
 * Get badge data as JSON (for API endpoint)
 */
export async function getBadgeJSON(projectPath) {
  try {
    const analysis = await analyzeProject(projectPath);
    const scoreFactor = Math.max(0, 100 - (analysis.totalSize / 1024 / 10));
    const score = Math.round(Math.max(0, Math.min(100, scoreFactor)));
    const grade = calculateGrade(score);

    return {
      score,
      grade,
      timestamp: new Date().toISOString(),
      metrics: {
        fileCount: analysis.fileCount,
        totalSize: analysis.totalSize,
        totalSizeKB: (analysis.totalSize / 1024).toFixed(2),
        executionTimeMs: analysis.executionTimeMs
      }
    };
  } catch (error) {
    throw new Error(`Failed to get badge data: ${error.message}`);
  }
}

/**
 * Print badge report
 */
export async function printBadgeReport(projectPath) {
  try {
    const result = await generateBadge(projectPath);

    console.log('\n🎖️  Optimization Badge Generated\n');
    console.log(`Score: ${result.score}/100`);
    console.log(`Grade: ${result.grade}`);
    console.log(`Badge saved: ${result.badgePath}`);
    console.log(`Badge size: ${(result.fileSize / 1024).toFixed(2)} KB`);
    console.log(`README updated: ${result.readmeUpdated ? '✓' : '✗'} (${result.readmeMessage})`);
    console.log(`\nEmbed in markdown: ![Optimization Score](./reports/badge.svg)`);
    console.log(`Dynamic endpoint: GET /api/badge`);

    return result;
  } catch (error) {
    console.error('❌ Error generating badge:', error.message);
    throw error;
  }
}

export default generateBadge;
