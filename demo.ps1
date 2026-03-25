$ErrorActionPreference = 'Stop'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-NoBomFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$root = Get-Location
$sampleDir = Join-Path $root 'test/sample-project'
$logDir = Join-Path $sampleDir 'logs'
$analyzeLog = Join-Path $logDir 'analyze-output.log'
$optimizeLog = Join-Path $logDir 'optimize-output.log'

Write-Host "`n==> Preparing demo sample project at $sampleDir"
if (Test-Path $sampleDir) {
  Remove-Item -Recurse -Force $sampleDir
}

New-Item -ItemType Directory -Path (Join-Path $sampleDir 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $sampleDir 'styles') -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$packageJson = @'
{
  "name": "sample-project",
  "version": "1.0.0",
  "type": "module"
}
'@
$css = @'
/* Bloated and intentionally unminified CSS for demo */

body {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    color: #111111;
    font-family: Arial, sans-serif;
}

.container {
    width: 100%;
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
    padding-top: 40px;
    padding-bottom: 40px;
    padding-left: 24px;
    padding-right: 24px;
}

.card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    margin-bottom: 16px;
    padding: 20px;
}
'@
Write-NoBomFile -Path (Join-Path $sampleDir 'package.json') -Content $packageJson
Write-NoBomFile -Path (Join-Path $sampleDir 'styles/main.css') -Content $css

$html = @'
<!doctype html>
<html>
  <head>
    <title>Sample Project</title>
    <link rel="stylesheet" href="./styles/main.css" />
  </head>
  <body>
    <div class="container">
      <div class="card">OptiDash Demo Target</div>
    </div>
    <script type="module" src="./src/file1.js"></script>
  </body>
</html>
'@
Write-NoBomFile -Path (Join-Path $sampleDir 'index.html') -Content $html

for ($i = 1; $i -le 10; $i++) {
  $js = @"
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const message = 'This file is intentionally bloated and has unused imports.';
const repeated = ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa'].join(' - ');

export function runFile$i() {
  console.log(message);
  console.log(repeated);
  console.log('file$i ready');
}

runFile$i();
"@
  Write-NoBomFile -Path (Join-Path $sampleDir "src/file$i.js") -Content $js
}

Write-Host "==> Running analyze command..."
node (Join-Path $root 'src/cli.js') analyze $sampleDir | Tee-Object -FilePath $analyzeLog

Write-Host "`n==> Running optimize command..."
node (Join-Path $root 'src/cli.js') optimize $sampleDir | Tee-Object -FilePath $optimizeLog

Write-Host "`n==> Computing final savings summary..."
$summaryJson = node -e "const fs=require('fs'); const path=require('path'); const root=process.argv[1]; const exts=new Set(['.js','.css']); let before=0; let after=0; function walk(dir){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ if(e.name==='node_modules'||e.name==='dist'||e.name.startsWith('.git')||e.name==='logs') continue; const full=path.join(dir,e.name); if(e.isDirectory()) walk(full); else if(exts.has(path.extname(e.name).toLowerCase())){ before+=fs.statSync(full).size; const rel=path.relative(root,full); const gz=path.join(root,'dist',rel)+'.gz'; if(fs.existsSync(gz)) after+=fs.statSync(gz).size; } } } walk(root); const saved=Math.max(0,before-after); const pct=before>0?((saved/before)*100).toFixed(2):'0.00'; console.log(JSON.stringify({before,after,saved,pct},null,2));" $sampleDir

$summary = $summaryJson | ConvertFrom-Json
Write-Host '----------------------------------------'
Write-Host 'Demo Summary'
Write-Host "Original bytes : $($summary.before)"
Write-Host "Optimized bytes: $($summary.after)"
Write-Host "Bytes saved    : $($summary.saved)"
Write-Host "Reduction      : $($summary.pct)%"
Write-Host '----------------------------------------'

Write-Host "`nDemo complete. Logs:"
Write-Host "- $analyzeLog"
Write-Host "- $optimizeLog"
