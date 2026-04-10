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
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^  - (.+)$/gm, '<li style="margin-left:1rem">$1</li>');

  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[\s-:]+$/.test(c))) return '';
    return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
  });

  html = html.replace(/(<tr>.*<\/tr>\s*)+/g, (match) => {
    const firstRow = match.indexOf('</tr>');
    const headerHtml = match.substring(0, firstRow + 5).replace(/td>/g, 'th>');
    const bodyHtml = match.substring(firstRow + 5);
    return `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
  });

  html = html.replace(/\n{2,}/g, '<br><br>');
  return html;
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

function copyToClipboard() {
  if (!currentBrief) return;
  navigator.clipboard.writeText(currentBrief).then(() => {
    const btn = event.target;
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
