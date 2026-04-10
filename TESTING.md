# Clip Analyst — Local Testing Guide

## Prerequisites

```bash
# Install tools
npm install -g wrangler serve
```

## Setup

### 1. Configure API Keys

Set secrets via command:
```bash
wrangler secret put GEMINI_API_KEY
# Optional: for self-hosted Cobalt
# wrangler secret put COBALT_API_KEY
```

**Architecture:** URL → Cobalt API → Direct MP4 → Gemini 2.5 Flash → Analysis

- **Cobalt** (public instance): Free, converts IG/TikTok URL to MP4
- **Gemini 2.5 Flash**: Video understanding

### 2. Start Worker

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
3. Paste video URL: `https://www.instagram.com/reel/ABC123/`
4. Optional: Add key message
5. Click **Analyze Clip**
6. Watch streaming results appear in real-time

## Smoke Tests

```bash
cd worker

# Run smoke test against local worker
./test-smoke.sh http://localhost:8788

# Run smoke test against production
./test-smoke.sh https://clip-analyst-api.ssedtasak.workers.dev
```

## Manual API Test

```bash
curl -X POST http://localhost:8788 \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/reel/ABC123/","keyMessage":"test"}'
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Worker won't start | Check `.dev.vars` has valid Gemini key |
| CORS error | Ensure `ALLOWED_ORIGIN=http://localhost:8788` in `.dev.vars` |
| Frontend prompt keeps appearing | Worker URL not saved — refresh page |
| Streaming stops mid-way | Check Wrangler terminal for errors |

## Production Deploy

See [DEPLOY.md](./DEPLOY.md) for Cloudflare + GitHub Pages deployment.
