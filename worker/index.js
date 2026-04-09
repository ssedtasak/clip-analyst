/**
 * Clip Analyst — Cloudflare Worker v2
 * API proxy with CORS restriction, retry logic, and better error handling
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API not configured' }), {
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
      /instagram\.com\/(?:reel|p)\//i,
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
          // Step 1: Video Analysis (with retry)
          send({ step: 'Analyzing shot-by-shot...' });

          const analysisUser = `Analyze this video: ${url}${keyMessage ? `\nKey message: ${keyMessage}` : ''}`;

          let analysisResponse;
          try {
            analysisResponse = await fetchWithRetry(OPENAI_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: PROMPTS.videoAnalysis },
                  { role: 'user', content: analysisUser }
                ],
                max_tokens: 4000,
                temperature: 0.3,
                stream: true
              })
            }, 2, 1500);
          } catch (err) {
            send({ error: 'Analysis request failed after retries. Please try again.' });
            controller.close();
            return;
          }

          if (!analysisResponse.ok) {
            const err = await analysisResponse.json().catch(() => ({}));
            const msg = err.error?.message || `OpenAI error: ${analysisResponse.status}`;
            send({ error: msg });
            controller.close();
            return;
          }

          let fullAnalysis = '';
          const analysisReader = analysisResponse.body.getReader();
          const analysisDecoder = new TextDecoder();

          while (true) {
            const { done, value } = await analysisReader.read();
            if (done) break;

            const chunk = analysisDecoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullAnalysis += content;
                  send({ content });
                }
              } catch {}
            }
          }

          // Step 2: Brief Generation (with retry)
          send({ step: 'Generating production brief...' });

          const briefUser = `Generate a complete production brief${keyMessage ? ` (key message: "${keyMessage}")` : ''}:\n\n${fullAnalysis}`;

          let briefResponse;
          try {
            briefResponse = await fetchWithRetry(OPENAI_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: PROMPTS.briefGeneration },
                  { role: 'user', content: briefUser }
                ],
                max_tokens: 4000,
                temperature: 0.4,
                stream: true
              })
            }, 2, 1500);
          } catch (err) {
            send({ error: 'Brief generation failed after retries. Please try again.' });
            controller.close();
            return;
          }

          if (!briefResponse.ok) {
            const err = await briefResponse.json().catch(() => ({}));
            const msg = err.error?.message || `OpenAI error: ${briefResponse.status}`;
            send({ error: msg });
            controller.close();
            return;
          }

          const briefReader = briefResponse.body.getReader();
          const briefDecoder = new TextDecoder();

          while (true) {
            const { done, value } = await briefReader.read();
            if (done) break;

            const chunk = briefDecoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  send({ content });
                }
              } catch {}
            }
          }

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
