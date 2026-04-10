// Clip Analyst — Frontend Application (GitHub Pages + Cloudflare Worker)
// API calls proxied through Cloudflare Worker (API key protected server-side)

// ========== USER CONFIG ==========
// Default Worker URL - deployed on Cloudflare Workers
const WORKER_URL = 'https://clip-analyst-api.ssedtasak.workers.dev';
// =================================

const form = document.getElementById('analyze-form');
const urlInput = document.getElementById('video-url');
const keyMessageInput = document.getElementById('key-message');
const analyzeBtn = document.getElementById('analyze-btn');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const loadingState = document.getElementById('loading-state');
const loadingText = document.getElementById('loading-text');
const loadingPercent = document.getElementById('loading-percent');
const progressBar = document.getElementById('progress-bar');
const resultsSection = document.getElementById('results-section');
const resultsContent = document.getElementById('results-content');
const resultMeta = document.getElementById('result-meta');

let currentBrief = '';

const LOADING_STEPS = [
  'Analyzing shot-by-shot...',
  'Generating production brief...',
];

// Worker URL validation
function getWorkerUrl() {
  const url = WORKER_URL || localStorage.getItem('clip_analyst_worker_url');
  if (url) return url;
  const entered = prompt('Enter your Clip Analyst API Worker URL:\n\n(e.g., https://clip-analyst-api.yourname.workers.dev)\n\nThis will be saved for future use.');
  if (entered && entered.startsWith('https://')) {
    localStorage.setItem('clip_analyst_worker_url', entered);
    return entered;
  }
  return null;
}

function showState(state) {
  form.classList.toggle('hidden', state === 'loading');
  errorBanner.classList.add('hidden');
  loadingState.classList.toggle('hidden', state !== 'loading');
  resultsSection.classList.toggle('hidden', state !== 'results' && state !== 'streaming');
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
  loadingState.classList.add('hidden');
  resultsSection.classList.add('hidden');
  form.classList.remove('hidden');
}

function validateUrl(url) {
  const patterns = [
    /instagram\.com\/(?:reel|reels|p)\//i,
    /tiktok\.com\/@.+\/video\//i,
  ];
  return patterns.some(p => p.test(url));
}

// ========== MAIN HANDLER ==========

async function handleSubmit(e) {
  e.preventDefault();

  const url = urlInput.value.trim();
  const keyMessage = keyMessageInput.value.trim();

  if (!url) return showError('Please enter a video URL.');
  if (!validateUrl(url)) return showError('Please enter a valid Instagram Reel or TikTok URL.');

  const workerUrl = getWorkerUrl();
  if (!workerUrl) return showError('API Worker URL required. Please reload and enter your Worker URL.');

  currentBrief = '';

  showState('loading');
  analyzeBtn.disabled = true;

  loadingText.textContent = LOADING_STEPS[0];
  loadingPercent.textContent = '5%';
  progressBar.style.width = '5%';

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, keyMessage })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${response.status}`);
    }

    showState('streaming');
    resultsContent.textContent = '';
    resultsContent.classList.add('typing-cursor');
    resultMeta.textContent = new Date().toLocaleDateString();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamEnded = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]' || data === '') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.step) {
              loadingText.textContent = parsed.step;
            }
            if (typeof parsed.progress === 'number') {
              loadingPercent.textContent = parsed.progress + '%';
              progressBar.style.width = parsed.progress + '%';
            }
            if (parsed.content) {
              currentBrief += parsed.content;
              resultsContent.innerHTML = renderMarkdown(currentBrief);
            }
            if (parsed.done) {
              streamEnded = true;
              break;
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
          }
        }
      }
      if (streamEnded) break;
    }

    resultsContent.classList.remove('typing-cursor');

    if (!streamEnded || !currentBrief) {
      throw new Error('Analysis did not complete. Please try again.');
    }

    showState('results');
    resultsContent.innerHTML = renderMarkdown(currentBrief);

  } catch (err) {
    showError(err.message || 'Analysis failed. Please try again.');
  } finally {
    analyzeBtn.disabled = false;
  }
}

// ========== MARKDOWN RENDERER ==========

function renderMarkdown(md) {
  // Step 1: Basic inline formatting (before table parsing)
  let html = md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Step 2: Parse tables properly - handle multi-line cells
  html = parseTables(html);

  // Step 3: Headers and lists
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^  - (.+)$/gm, '<li class="sub-item">$1</li>');

  // Step 4: Wrap consecutive list items in <ul>
  html = html.replace(/(<li[^>]*>.*<\/li>\s*)+/g, (match) => `<ul>${match}</ul>`);

  // Step 5: Double newlines to paragraphs
  html = html.replace(/\n{2,}/g, '</p><p>');
  
  return `<p>${html}</p>`;
}

function parseTables(html) {
  // Match entire table blocks: from | header | to last | cell |
  const tableRegex = /^\|(.+)\|[\s\S]*?\|[\s\S]*?$/gm;
  
  return html.replace(tableRegex, (tableBlock) => {
    const lines = tableBlock.split('\n').filter(line => line.trim() && line.includes('|'));
    
    if (lines.length < 2) return tableBlock; // Not a valid table
    
    const rows = lines.map(line => {
      // Split by | but preserve content within cells
      const cells = line.split('|').slice(1, -1); // Remove empty first/last from split
      
      return cells.map(cell => {
        // Convert bullet points and newlines within cell to HTML
        let cellHtml = cell
          .replace(/^- (.+)$/gm, '<span class="cell-bullet">•</span> $1<br>')
          .replace(/^  - (.+)$/gm, '&nbsp;&nbsp;↳ $1<br>')
          .replace(/\n/g, '<br>');
        return cellHtml.trim();
      });
    });

    // Check if first row is header
    const isHeaderRow = rows[0].every(cell => /^[\s\-:]+$/.test(cell.replace(/<[^>]+>/g, '')));
    const dataRows = isHeaderRow ? rows.slice(1) : rows;
    
    let tableHtml = '<div class="table-wrapper"><table>';
    
    if (!isHeaderRow || rows.length > 1) {
      // Header
      const headerCells = isHeaderRow ? rows[0] : ['Shot #', 'Timecode', 'Visual Description', 'Audio / Technique', 'Notes / Purpose'];
      tableHtml += '<thead><tr>' + headerCells.map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
    }
    
    // Body
    tableHtml += '<tbody>';
    dataRows.forEach(cells => {
      tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    
    return tableHtml;
  });
}

// ========== EXPORT ==========

function downloadMarkdown() {
  if (!currentBrief) return;
  const date = new Date().toISOString().split('T')[0];
  const filename = `production-brief-${date}.md`;
  const blob = new Blob([currentBrief], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadPDF() {
  if (!currentBrief) return;
  // Use print dialog for PDF
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>Production Brief - ${new Date().toLocaleDateString()}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
        h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        h2 { font-size: 18px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        h3 { font-size: 16px; margin-top: 16px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
        th, td { border: 1px solid #333; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f5f5f5; font-weight: bold; }
        td:first-child { text-align: center; font-weight: bold; }
        ul { margin: 8px 0; padding-left: 20px; }
        li { margin: 4px 0; }
        strong { font-weight: bold; }
        .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>🎬 Production Brief</h1>
      <p class="meta">Generated on ${new Date().toLocaleDateString()} | Clip Analyst</p>
      <div id="content">${resultsContent.innerHTML}</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

function copyToLINE(e) {
  if (!currentBrief) return;
  // Convert markdown to LINE-friendly text
  const lineText = convertToLINE(currentBrief);
  navigator.clipboard.writeText(lineText).then(() => {
    const btn = e.target;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

function convertToLINE(md) {
  return md
    // Remove markdown headers markers but keep text
    .replace(/^#{1,3}\s+/gm, '')
    // Convert table separators to simple lines
    .replace(/^\|[-:\s|]+\|$/gm, '─────────────────────')
    // Keep table content but simplify
    .replace(/^\|\s*/gm, '│ ')
    .replace(/\s*\|$/gm, '')
    // Convert bold to LINE-friendly (using ○ key)
    .replace(/\*\*(.+?)\*\*/g, '【$1】')
    // Convert italic to LINE-friendly
    .replace(/\*(.+?)\*/g, '〔$1〕')
    // Convert bullet points
    .replace(/^-\s+/gm, '• ')
    .replace(/^  -\s+/gm, '  ↳ ')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Add header for LINE
    .replace(/^/, '🎬 Production Brief\n📅 ' + new Date().toLocaleDateString() + '\n─────────────────────\n\n');
}

function copyToClipboard(e) {
  if (!currentBrief) return;
  navigator.clipboard.writeText(currentBrief).then(() => {
    const btn = e.target;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

function retryAnalysis() {
  errorBanner.classList.add('hidden');
  form.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  loadingState.classList.add('hidden');
}

form.addEventListener('submit', handleSubmit);
