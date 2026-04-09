# Clip Analyst — PRD (Product Requirements Document)

## What It Does
AI-powered tool that analyzes short-form video clips (Instagram Reels, TikTok) and generates detailed production briefs for recreation. User pastes a video link, adds an optional key message, and gets a complete shot-by-shot analysis + grouped production brief ready for their production team.

## Functions

| # | Function | Description | AI Required |
|---|----------|-------------|-------------|
| 1 | **Video Analysis** | Accept video URL, analyze content shot-by-shot, generate detailed shot list table | yes |
| 2 | **Brief Generation** | Combine shot analysis into a downloadable production brief (Markdown) | yes |

## User Flow

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐     ┌────────────┐
│  1. INPUT     │────▶│  2. LOADING   │────▶│  3. RESULTS      │────▶│ 4. EXPORT  │
│               │     │               │     │                  │     │            │
│ • Paste URL   │     │ • Analyzing.. │     │ • Shot List      │     │ • Download │
│ • Key Message │     │ • Progress    │     │ • Grouped Brief  │     │   .md file │
│   (optional)  │     │   indicator   │     │ • Editing Notes  │     │ • Copy all │
└──────────────┘     └───────────────┘     └──────────────────┘     └────────────┘
```

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Vanilla HTML + Tailwind CDN | Simple, no build step, fast to deploy |
| Backend | Cloudflare Worker | Global edge, free tier, serverless |
| AI Provider | OpenAI GPT-4o | Video analysis + brief generation |
| Hosting | GitHub Pages (frontend) + Cloudflare Workers | Free static hosting + global edge API |
| Database | None | Stateless tool — no user accounts, no history |

## Input Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Video URL | Yes | string | Instagram Reel or TikTok URL |
| Key Message | No | string | Optional focus message for the brief |

## Output: Production Brief

The AI generates a complete Markdown document with:

### 1. Overview Section
- Goal of the recreation clip
- Mood & Tone
- Key Message
- Target Audience

### 2. Detailed Shot List (Table)
| Column | Description |
|--------|-------------|
| Shot # | Sequence number |
| Timecode | Start-end time (e.g., 0:00-0:01) |
| Visual Description | Camera angle, action, key visuals, text overlay |
| Audio / Technique | Sound type, editing techniques, transitions |
| Notes / Purpose | Intent of the shot, emotion, connections |

### 3. Production Brief — Grouped Shots (Table)
| Group | Typical Content |
|-------|----------------|
| Exterior Group | Outside shots, storefront, arrival |
| Action/Prep Group | Food preparation, chef at work |
| Atmosphere/Reaction Group | Interior, customer reactions |
| Food Presentation Group | Close-up food shots, plating |
| Product/Brand Specific Group | Brand-specific product highlights |

### 4. Editing & Color Notes
- Editing technique recommendations
- Color grading guidance
- Text overlay specifications

## AI Integration

### Step 1: Video Analysis
- **Model**: GPT-4o
- **Input**: Video URL + system prompt
- **Output**: Structured shot-by-shot analysis
- **Streaming**: Yes (real-time UI updates)

### Step 2: Brief Generation
- **Model**: GPT-4o-mini
- **Input**: Shot analysis + key message
- **Output**: Complete Markdown production brief
- **Streaming**: Yes (real-time UI updates)

### Fallback Strategy
```
Primary: GPT-4o (analysis)
  ↓ If rate limited or failed
Error: Show user-friendly message, suggest retry
```

## Security

| Concern | Mitigation |
|---------|------------|
| API key protection | Key stored in Cloudflare Worker env, never in browser |
| CORS | Restricted to GitHub Pages origin only |
| Rate limiting | 10 requests/minute per IP via Cloudflare |
| Input validation | URL validated client + server side |

## Page Layout (Single Page)

```
┌─────────────────────────────────────────────────────────┐
│  CLIP ANALYST                                           │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │  📎 Paste your Instagram Reel or TikTok URL     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Key Message (optional):                                │
│  [_____________________________________________]        │
│                                                         │
│  [ ▶ ANALYZE CLIP ]                                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ┌─ RESULTS ──────────────────────────────────────┐   │
│  │  ## Overview                                    │   │
│  │  ## Shot List                                   │   │
│  │  ## Production Brief (Grouped)                 │   │
│  │  ## Editing & Color Notes                      │   │
│  └─────────────────────────────────────────────────┘   │
│  [ ⬇ Download .md ]    [ 📋 Copy to Clipboard ]       │
└─────────────────────────────────────────────────────────┘
```

## States

| State | UI |
|-------|----|
| **Empty** | Input form only, no results area |
| **Loading** | Spinner with "Analyzing shot-by-shot..." |
| **Streaming** | Results area shows text appearing in real-time |
| **Complete** | Full brief displayed, download/copy buttons enabled |
| **Error** | Red banner with error message + retry button |

## Error Handling

| Error | User Message |
|-------|-------------|
| Invalid URL | "Please enter a valid Instagram Reel or TikTok URL" |
| Rate limited | "Too many requests. Please wait a moment and try again." |
| AI analysis failed | "Analysis failed. Please try again." |
| Network error | "Connection lost. Please check your internet and try again." |

## Success Criteria

- [x] User can paste URL and get a production brief in under 60 seconds
- [x] Brief includes all 4 sections (Overview, Shot List, Grouped Brief, Editing Notes)
- [x] User can download brief as .md file
- [x] User can copy brief to clipboard
- [x] Works on mobile (responsive)
- [x] AI streaming shows progress during analysis
- [x] API key protected server-side
- [x] Rate limited to prevent abuse

## Out of Scope (v1)
- User accounts / login
- Analysis history / saved briefs
- Video upload (URL only)
- Brand selection (generic brief)
- Multi-video comparison
- Direct social media posting
- PDF export (Markdown only)
