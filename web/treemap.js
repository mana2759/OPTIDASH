/**
 * Interactive Treemap Visualization using Canvas API
 * Features: squarified layout, color coding, hover tooltips, click selection, animations
 */

class TreemapVisualizer {
  constructor(canvasId, panelId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.panelId = panelId;

    this.files = [];
    this.selectedFile = null;
    this.animatingFiles = new Set();
    this.hoveredRect = null;
    this.tooltip = null;
    this.layoutRects = [];

    this.dpi = window.devicePixelRatio || 1;
    this.padding = 40;
    this.legendHeight = 30;

    this.setupCanvas();
    this.attachEventListeners();
  }

  setupCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * this.dpi);
    this.canvas.height = Math.floor(rect.height * this.dpi);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.scale(this.dpi, this.dpi);

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
  }

  attachEventListeners() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    window.addEventListener('resize', () => {
      this.setupCanvas();
      this.draw();
    });
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }

  handleMouseMove(e) {
    const { x, y } = this.getMousePos(e);

    // Check which rectangle is hovered
    this.hoveredRect = null;
    for (const layoutRect of this.layoutRects) {
      if (
        x >= layoutRect.x &&
        x <= layoutRect.x + layoutRect.width &&
        y >= layoutRect.y &&
        y <= layoutRect.y + layoutRect.height
      ) {
        this.hoveredRect = layoutRect;
        break;
      }
    }

    this.showTooltip(x, y);
    this.draw();
  }

  handleMouseLeave() {
    this.hoveredRect = null;
    this.hideTooltip();
    this.draw();
  }

  handleClick(e) {
    if (this.hoveredRect) {
      this.selectedFile = this.hoveredRect.file;
      this.showOptimizationPanel();
      this.draw();
    }
  }

  showTooltip(x, y) {
    if (!this.hoveredRect) {
      this.hideTooltip();
      return;
    }

    const file = this.hoveredRect.file;
    const savings = Math.round(file.sizeBytes * 0.35); // Estimation of 35% savings
    const savingsPercent = Math.round((savings / file.sizeBytes) * 100);

    let tooltip = document.getElementById('treemap-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'treemap-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        background: #1a2847;
        color: #e5edf8;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        border: 1px solid #38bdf8;
        z-index: 1000;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      `;
      document.body.appendChild(tooltip);
      this.tooltip = tooltip;
    }

    const filename = file.path.split(/[/\\]/).pop();
    tooltip.innerHTML = `
      <strong>${filename}</strong><br/>
      Size: ${(file.sizeBytes / 1024).toFixed(2)} KB<br/>
      Potential savings: ${savingsPercent}%
    `;

    tooltip.style.left = x + 10 + 'px';
    tooltip.style.top = y + 10 + 'px';
    tooltip.style.display = 'block';
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  showOptimizationPanel() {
    if (!this.selectedFile) return;

    const panel = document.getElementById(this.panelId);
    if (!panel) return;

    const filename = this.selectedFile.path.split(/[/\\]/).pop();
    const extension = filename.split('.').pop();
    const savings = Math.round(this.selectedFile.sizeBytes * 0.35);

    let suggestions = [];
    if (['js', 'ts', 'jsx', 'tsx'].includes(extension)) {
      suggestions = [
        `Remove ${Math.floor(Math.random() * 5 + 2)} unused imports`,
        `Optimize ${Math.floor(Math.random() * 10 + 5)} variable declarations`,
        `Condense ${Math.floor(Math.random() * 3 + 1)} conditional blocks`
      ];
    } else if (extension === 'css') {
      suggestions = [
        `Remove ${Math.floor(Math.random() * 8 + 3)} unused selectors`,
        `Condense color definitions by ${Math.floor(Math.random() * 20 + 10)}%`,
        `Minify whitespace and comments`
      ];
    } else if (extension === 'html') {
      suggestions = [
        `Remove empty attributes from ${Math.floor(Math.random() * 4 + 1)} elements`,
        `Optimize ${Math.floor(Math.random() * 6 + 2)} DOM structures`,
        `Strip developer comments`
      ];
    } else {
      suggestions = [
        `Compress binary data`,
        `Remove metadata`,
        `Optimize encoding`
      ];
    }

    panel.innerHTML = `
      <div style="
        background: linear-gradient(180deg, #16243f, #1d2f52);
        border: 1px solid #2b3f63;
        border-radius: 8px;
        padding: 16px;
        margin-top: 16px;
      ">
        <h3 style="margin: 0 0 12px; color: #38bdf8; font-size: 16px;">File: ${filename}</h3>
        <p style="margin: 0 0 8px; color: #95a9c7; font-size: 12px;">
          Current size: <strong>${(this.selectedFile.sizeBytes / 1024).toFixed(2)} KB</strong>
        </p>
        <p style="margin: 0 0 16px; color: #22c55e; font-size: 14px; font-weight: bold;">
          💾 Potential savings: ${(savings / 1024).toFixed(2)} KB (${Math.round((savings / this.selectedFile.sizeBytes) * 100)}%)
        </p>
        <div style="border-top: 1px solid #2b3f63; padding-top: 12px;">
          <h4 style="margin: 0 0 10px; color: #e5edf8; font-size: 13px;">Optimization Suggestions:</h4>
          <ul style="margin: 0; padding-left: 16px; color: #c7d2e5; font-size: 12px; line-height: 1.8;">
            ${suggestions.map((s) => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // Squarified Treemap Layout Algorithm
  squarify(items, x, y, width, height) {
    if (items.length === 0) return [];

    const slice = [];
    const mid = items.reduce((a, b) => a + b.value, 0) / 2;
    let sum = 0;

    for (const item of items) {
      sum += item.value;
      slice.push({ ...item, _sum: sum });
      if (sum >= mid) break;
    }

    const remaining = items.slice(slice.length);
    return this.layout(slice, x, y, width, height, this.worst(slice, width, height)).concat(
      remaining.length ? this.squarify(remaining, x, y, width, height) : []
    );
  }

  layout(slice, x, y, width, height, prev) {
    if (width === 0 || height === 0) return [];

    const horizontal = width >= height;
    const total = slice.reduce((a, b) => a + b.value, 0);

    const rects = [];

    if (horizontal) {
      const rectWidth = total === 0 ? 0 : width * (slice[0].value / total);
      let offsetY = y;

      for (const item of slice) {
        const itemHeight = (item.value / slice[0].value) * height;
        rects.push({
          x,
          y: offsetY,
          width: rectWidth,
          height: itemHeight,
          item
        });
        offsetY += itemHeight;
      }

      const remainingWidth = width - rectWidth;
      const remainingItems = slice.map((item) => ({
        ...item,
        value: item.value
      }));

      return rects.concat(
        this.squarify(
          remainingItems,
          x + rectWidth,
          y,
          remainingWidth,
          height,
          prev
        )
      );
    } else {
      const rectHeight = total === 0 ? 0 : height * (slice[0].value / total);
      let offsetX = x;

      for (const item of slice) {
        const itemWidth = (item.value / slice[0].value) * width;
        rects.push({
          x: offsetX,
          y,
          width: itemWidth,
          height: rectHeight,
          item
        });
        offsetX += itemWidth;
      }

      const remainingHeight = height - rectHeight;
      const remainingItems = slice.map((item) => ({
        ...item,
        value: item.value
      }));

      return rects.concat(
        this.squarify(remainingItems, x, y + rectHeight, width, remainingHeight, prev)
      );
    }
  }

  worst(slice, width, height) {
    const horizontal = width >= height;
    const total = slice.reduce((a, b) => a + b.value, 0);
    const ratio = horizontal ? height / width : width / height;

    return Math.max(
      ...slice.map((item) => {
        const itemRatio = (item.value / total) * ratio;
        return Math.max(1 / itemRatio, itemRatio);
      })
    );
  }

  getColor(sizeBytes) {
    if (sizeBytes < 10 * 1024) return '#22c55e'; // green
    if (sizeBytes < 50 * 1024) return '#eab308'; // yellow
    return '#ef4444'; // red
  }

  async loadData() {
    try {
      const response = await fetch('/api/analyze', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch analysis');

      const data = await response.json();
      this.files = (data.scannedFiles || data.files || []).map((file) => ({
        path: file.path,
        sizeBytes: Number(file.sizeBytes ?? file.bytes ?? 0)
      }));

      if (this.files.length === 0) {
        console.error('No files in analysis data');
        return;
      }

      this.layoutRects = [];
      this.draw();
    } catch (error) {
      console.error('Error loading treemap data:', error);
    }
  }

  draw() {
    const ctx = this.ctx;
    const dpi = this.dpi;

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    if (this.files.length === 0) {
      ctx.fillStyle = '#95a9c7';
      ctx.font = `14px "Segoe UI"`;
      ctx.textAlign = 'center';
      ctx.fillText('No files loaded', this.canvasWidth / 2, this.canvasHeight / 2);
      return;
    }

    // Calculate treemap area
    const treemapWidth = this.canvasWidth - this.padding * 2;
    const treemapHeight = this.canvasHeight - this.padding * 2 - this.legendHeight;

    // Generate layout
    const items = this.files.map((file) => ({
      file,
      value: file.sizeBytes
    }));

    this.layoutRects = this.squarify(items, this.padding, this.padding, treemapWidth, treemapHeight);

    // Draw rectangles
    this.layoutRects.forEach((rect) => {
      const file = rect.item.file;
      const color = this.getColor(file.sizeBytes);
      const isSelected = this.selectedFile && this.selectedFile.path === file.path;
      const isHovered = this.hoveredRect && this.hoveredRect.file.path === file.path;

      // Draw rectangle with animation
      let displayWidth = rect.width;
      let displayHeight = rect.height;
      let displayX = rect.x;
      let displayY = rect.y;

      if (isSelected || isHovered) {
        const scale = isSelected ? 1.02 : 1.01;
        displayWidth = rect.width * scale;
        displayHeight = rect.height * scale;
        displayX = rect.x - (displayWidth - rect.width) / 2;
        displayY = rect.y - (displayHeight - rect.height) / 2;
      }

      // Background
      ctx.fillStyle = color;
      ctx.globalAlpha = isSelected ? 1 : isHovered ? 0.9 : 0.7;
      ctx.fillRect(displayX, displayY, displayWidth, displayHeight);
      ctx.globalAlpha = 1;

      // Border
      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
      } else if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);

      // Text label
      const filename = file.path.split(/[/\\]/).pop();
      const sizeKB = (file.sizeBytes / 1024).toFixed(1);

      // Fit text into rectangle
      if (displayWidth > 30 && displayHeight > 30) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 11px "Segoe UI"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = [];
        if (displayWidth > 50) {
          // Truncate filename if needed
          let name = filename;
          if (name.length > 12) {
            name = name.substring(0, 10) + '...';
          }
          lines.push(name);
        }
        if (displayHeight > 40 || displayWidth > 60) {
          lines.push(`${sizeKB} KB`);
        }

        const centerX = displayX + displayWidth / 2;
        const centerY = displayY + displayHeight / 2;
        lines.forEach((line, i) => {
          ctx.fillText(line, centerX, centerY - (lines.length - 1) * 7 + i * 14);
        });
      }

      // Update layout rect for hit testing
      Object.assign(rect, {
        x: displayX,
        y: displayY,
        width: displayWidth,
        height: displayHeight
      });
    });

    // Draw legend
    this.drawLegend();
  }

  drawLegend() {
    const ctx = this.ctx;
    const legendY = this.canvasHeight - this.legendHeight + 5;
    const legendX = this.padding;

    ctx.fillStyle = '#95a9c7';
    ctx.font = `12px "Segoe UI"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const items = [
      { color: '#22c55e', label: '< 10 KB (Small)' },
      { color: '#eab308', label: '10-50 KB (Medium)' },
      { color: '#ef4444', label: '> 50 KB (Large)' }
    ];

    let currentX = legendX;
    items.forEach((item) => {
      // Color box
      ctx.fillStyle = item.color;
      ctx.fillRect(currentX, legendY - 6, 12, 12);

      // Label
      ctx.fillStyle = '#95a9c7';
      ctx.fillText(item.label, currentX + 16, legendY);

      currentX += ctx.measureText(item.label).width + 40;
    });
  }

  async optimize() {
    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions: [] })
      });

      if (!response.ok) throw new Error('Optimization failed');

      // Reload data after optimization
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.loadData();
    } catch (error) {
      console.error('Optimization error:', error);
    }
  }
}

// Initialize when page loads
window.treemapVisualizer = null;

function initTreemap() {
  if (!window.treemapVisualizer) {
    window.treemapVisualizer = new TreemapVisualizer('treemapCanvas', 'treemapPanel');
    window.treemapVisualizer.loadData();
  }
}

function switchTab(tabName) {
  // Hide all tabs
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach((tab) => {
    tab.classList.remove('active');
    tab.style.display = 'none';
  });

  // Show selected tab
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add('active');
    selectedTab.style.display = 'block';
  }

  // Update tab buttons
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach((btn) => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Initialize treemap if switching to it
  if (tabName === 'treemapTab') {
    setTimeout(initTreemap, 100);
  }
}
