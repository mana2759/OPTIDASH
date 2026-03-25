function formatPath(value) {
  const parts = value.split(/[/\\]/);
  return parts.slice(Math.max(parts.length - 3, 0)).join('/');
}

async function loadReport() {
  const status = document.getElementById('status');
  const summary = document.getElementById('summary');
  const filesBody = document.getElementById('files');

  try {
    const response = await fetch('./report.json', { cache: 'no-store' });

    if (!response.ok) {
      throw new Error('No report.json found. Run `npm run analyze` first.');
    }

    const report = await response.json();

    summary.innerHTML = `
      <div class="summary-item">
        <div class="label">Target</div>
        <div class="value">${report.target}</div>
      </div>
      <div class="summary-item">
        <div class="label">Type</div>
        <div class="value">${report.type}</div>
      </div>
      <div class="summary-item">
        <div class="label">Files</div>
        <div class="value">${report.fileCount}</div>
      </div>
      <div class="summary-item">
        <div class="label">Total Size</div>
        <div class="value">${report.totalKB} KB</div>
      </div>
    `;

    const sorted = [...(report.files || [])]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 200);

    filesBody.innerHTML = sorted
      .map(
        (item) => `
          <tr>
            <td>${formatPath(item.path)}</td>
            <td>${item.kb}</td>
          </tr>
        `
      )
      .join('');

    status.textContent = sorted.length === 0 ? 'No files found in report.' : '';
  } catch (error) {
    status.textContent = error.message;
    summary.innerHTML = '';
    filesBody.innerHTML = '';
  }
}

loadReport();
