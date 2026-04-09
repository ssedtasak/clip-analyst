# Clip Analyst — Local Testing Guide

## Prerequisites

```bash
# Install tools
npm install -g wrangler serve
```

## Setup

### 1. Configure API Key

Edit `worker/.dev.vars`:
```
OPENAI_API_KEY=sk-your-openai-key-here
ALLOWED_ORIGIN=http://localhost:8788
```

### 2. Start Worker (Terminal 1)

```bash
cd worker
wrangler dev --port 8788
```

Worker runs at: `http://localhost:8788`

### 3. Start Frontend (Terminal 2)

```bash
cd projects/clip-analyst
npx serve src -l 3000
```

Frontend runs at: `http://localhost:3000`

## Testing

1. Open `http://localhost:3000`
2. Enter Worker URL: `http://localhost:8788` (first time only)
3. Paste video URL: `https://www.tiktok.com/@user/video/1234567890`
4. Optional: Add key message
5. Click **Analyze Clip**
6. Watch streaming results appear in real-time

## Manual API Test

```bash
curl -X POST http://localhost:8788 \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@user/video/123","keyMessage":"test"}'
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Worker won't start | Check `.dev.vars` has valid OpenAI key |
| CORS error | Ensure `ALLOWED_ORIGIN=http://localhost:8788` in `.dev.vars` |
| Frontend prompt keeps appearing | Worker URL not saved — refresh page |
| Streaming stops mid-way | Check Wrangler terminal for errors |

## Production Deploy

See [DEPLOY.md](./DEPLOY.md) for Cloudflare + GitHub Pages deployment.
