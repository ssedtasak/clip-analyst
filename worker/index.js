/**
 * Clip Analyst — Cloudflare Worker v5
 * Uses Cobalt API to get direct MP4 link, then Gemini 2.5 Flash for video analysis
 * Architecture per PDR: URL → Cobalt → MP4 → Gemini → Analysis
 */

// Cobalt API endpoint (self-hosted on Railway)
const getCobaltUrl = (env) => {
  const url = env.COBALT_API_URL || 'https://cobalt-api-production-70d8.up.railway.app/';
  return url.endsWith('/') ? url : url + '/';
};

// Gemini API endpoint
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const PROMPTS = {
  videoAnalysis: `You are an expert video analyst specializing in short-form social media content (Instagram Reels, TikTok). Your job is to analyze the provided video frame-by-frame and create a detailed shot-by-shot breakdown.

Rules:
1. Break the video into individual shots based on camera angle changes, cuts, or scene transitions
2. For each shot, describe: camera angle, action/subject, key visuals (lighting, food styling, props, color tone), and any text overlay
3. For audio, identify: music genre/mood, ASMR sounds, voice content, and sound effects
4. For technique, identify: editing style (speed ramp, fast cuts, transitions), slow motion, reverse effects
5. Be extremely specific about camera angles (Wide Shot, Close-up, Macro, Extreme Close-up, POV, Dolly, Pan, Tilt, etc.)
6. Be specific about food styling details (freshness, color, plating, texture)
7. Be specific about lighting (natural, studio, soft, hard, backlight)
8. If text overlay exists, describe the font style, position, and size approximately
9. Note the purpose and emotion of each shot
10. If the video quality is too low to analyze properly, state this clearly

Output: A markdown table with columns:
| Shot # | Timecode | Visual Description | Audio / Technique | Notes / Purpose |

In the Visual Description column, use this structure:
- **Camera Angle:** [type]
- **Action/Subject:** [description]
- **Key Visuals:** [lighting, food styling, props, background, color tone]
- **Text Overlay:** [text, position, font style, size] (if any)

In the Audio / Technique column, use this structure:
- **Sound:** [music genre/mood, ASMR type, voice content, SFX]
- **Technique:** [editing technique, speed, transitions, effects]

Be thorough. Every second matters.`,

  briefGeneration: `You are a production brief writer. Your job is to take a shot-by-shot video analysis and create a professional production brief document for recreation.

Generate a complete Markdown document with these sections:

## 1. Overview
- **Goal:** [Summarize the recreation objective]
- **Mood & Tone:** [Overall mood]
- **Key Message:** [Main message]
- **Target Audience:** [Who this content is for]

## 2. Detailed Shot List
[Complete shot-by-shot table from the analysis]

| Shot # | Timecode | Visual Description | Audio / Technique | Notes / Purpose |
|--------|----------|-------------------|-------------------|-----------------|
| ... | ... | ... | ... | ... |

## 3. Production Brief (Grouped by Scene/Location)
Group shots by filming setup to maximize production efficiency:

| Group | Related Shots | Details / Recommendations |
|-------|--------------|---------------------------|
| **Exterior Group** | [shot numbers] | [description] |
| **Action/Prep Group** | [shot numbers] | [description] |
| **Atmosphere/Reaction Group** | [shot numbers] | [description] |
| **Food Presentation Group** | [shot numbers] | [description] |
| **Product/Brand Specific Group** | [shot numbers] | [description] |

(Include only groups that have relevant shots. Add custom groups if needed.)

## 4. Editing & Color Notes
- **Editing Technique:** [Speed, rhythm, transitions, effects]
- **Color Grading:** [Color mood, brightness, contrast]
- **Text Overlay:** [Font suggestions, position, duration, content]
- **Audio Design:** [Music mood, ASMR elements, voice-over suggestions]

## 5. Additional Considerations
- Reference quality notes (if applicable)
- Copyright reminders for music/SFX
- Food styling emphasis for realism
- Equipment recommendations

Rules:
1. Keep the Markdown clean and well-formatted
2. Be specific and actionable
3. Always remind about copyright for music and sound effects
4. Emphasize lighting and food styling for realism`
};

// Simple fetch with retry
async function fetchWithRetry(url, options, retries = 2, delay = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Step 1: Get direct MP4 link via Cobalt API
async function getVideoUrl(cobaltApiUrl, videoUrl, apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Api-Key ${apiKey}`;
  }
  
  const response = await fetch(cobaltApiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      url: videoUrl
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.code || `Cobalt error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.status === 'error') {
    throw new Error(data.error?.code || 'Cobalt failed to process URL');
  }
  
  if (!data.url) {
    throw new Error('No video URL returned from Cobalt');
  }
  
  return data.url;
}

// Step 2: Analyze video via Gemini 2.5 Flash
async function analyzeVideoWithGemini(videoUrl, apiKey, prompt, keyMessage) {
  const userPrompt = keyMessage 
    ? `${prompt}\n\nKey message to consider: ${keyMessage}`
    : prompt;

  const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            file_data: {
              mime_type: 'video/mp4',
              file_uri: videoUrl
            }
          },
          {
            text: userPrompt
          }
        ]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192
      }
    })
  }, 2, 3000);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'Gemini processing failed');
  }
  
  // Extract text from response
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No text in Gemini response');
  }
  
  return text;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin || origin)
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...corsHeaders(allowedOrigin || origin), 'Content-Type': 'text/plain' }
      });
    }

    // Validate origin if ALLOWED_ORIGIN is set
    if (allowedOrigin && origin !== allowedOrigin) {
      return new Response('Forbidden', {
        status: 403,
        headers: { ...corsHeaders(allowedOrigin), 'Content-Type': 'text/plain' }
      });
    }

    // Require both Cobalt and Gemini API keys
    const cobaltApiKey = env.COBALT_API_KEY;
    const geminiApiKey = env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'API not configured. Set GEMINI_API_KEY (and optionally COBALT_API_KEY) as secrets.' }), {
        status: 500,
        headers: { ...corsHeaders(allowedOrigin || origin), 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders(allowedOrigin || origin), 'Content-Type': 'application/json' }
      });
    }

    const { url, keyMessage } = body || {};

    // Validate URL
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL required' }), {
        status: 400,
        headers: { ...corsHeaders(allowedOrigin || origin), 'Content-Type': 'application/json' }
      });
    }

    const validPatterns = [
      /instagram\.com\/(?:reel|reels|p)\//i,
      /tiktok\.com\/@.+\/video\//i,
    ];

    if (!validPatterns.some(p => p.test(url))) {
      return new Response(JSON.stringify({ error: 'Invalid URL. Must be Instagram Reel or TikTok video.' }), {
        status: 400,
        headers: { ...corsHeaders(allowedOrigin || origin), 'Content-Type': 'application/json' }
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data) => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        try {
          // Step 1: Get direct MP4 link via Cobalt
          send({ step: 'Getting video link...' });
          let videoUrl;
          try {
            videoUrl = await getVideoUrl(getCobaltUrl(env), url, cobaltApiKey);
          } catch (err) {
            send({ error: `Failed to get video: ${err.message}` });
            controller.close();
            return;
          }

          // Step 2: Video Analysis with Gemini
          send({ step: 'Analyzing shot-by-shot...' });
          let analysisText;
          try {
            analysisText = await analyzeVideoWithGemini(videoUrl, geminiApiKey, PROMPTS.videoAnalysis, keyMessage);
          } catch (err) {
            send({ error: `Analysis failed: ${err.message}` });
            controller.close();
            return;
          }

          // Stream the analysis result
          send({ content: analysisText });

          // Step 3: Brief Generation with Gemini
          send({ step: 'Generating production brief...' });
          let briefText;
          try {
            briefText = await analyzeVideoWithGemini(videoUrl, geminiApiKey, PROMPTS.briefGeneration, keyMessage);
          } catch (err) {
            send({ error: `Brief generation failed: ${err.message}` });
            controller.close();
            return;
          }

          // Stream the brief
          send({ content: briefText });

          send({ done: true });
          controller.close();

        } catch (error) {
          send({ error: error.message || 'Analysis failed unexpectedly' });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders(allowedOrigin || origin),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
};
