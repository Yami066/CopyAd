import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import * as cheerio from 'cheerio'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

async function withRetry(fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err?.status === 429 || err?.message?.includes('429')) && i < retries - 1) {
        console.log(`[retry] 429 hit, waiting ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      } else throw err;
    }
  }
}

/**
 * Clean HTML to reduce token usage before sending to Gemini
 */
function cleanHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, svg, path, noscript, link, meta, picture, source, img, iframe').remove();
  $('*').each(function () {
    if (this.attribs) {
      Object.keys(this.attribs).forEach(attr => {
        if (attr !== 'class' && attr !== 'id') $(this).removeAttr(attr);
      });
    }
  });
  let cleaned = $('body').html() || $.html();
  if (cleaned.length > 3000) cleaned = cleaned.substring(0, 3000) + '...';
  return cleaned.trim();
}

function extractJSON(text) {
  const startArr = text.indexOf('[');
  const startObj = text.indexOf('{');
  const endArr = text.lastIndexOf(']');
  const endObj = text.lastIndexOf('}');
  const start = startArr !== -1 && (startObj === -1 || startArr < startObj) ? startArr : startObj;
  const end = endArr !== -1 && (endObj === -1 || endArr > endObj) ? endArr : endObj;
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1).replace(/\\(?!["\\/bfnrtu])/g, '\\\\'));
  } catch (e) {
    console.error('Failed to parse extracted JSON:', e);
    return null;
  }
}

function applyChanges(html, changes, adPrimaryColor) {
  const $ = cheerio.load(html);

  for (const change of changes) {
    const { selector, newInnerHtml } = change;
    if (!selector || !newInnerHtml) continue;

    try {
      let $el = $(selector);
      if ($el.length === 0) {
        const tagMatch = selector.match(/^[a-z0-9]+/i);
        if (tagMatch && ['h1', 'h2', 'h3', 'p'].includes(tagMatch[0].toLowerCase())) {
          $el = $(tagMatch[0]);
        }
        if ($el.length === 0) {
          console.warn(`[REPLACE FAILED]: "${selector}"`);
          continue;
        }
      }

      $el.first().html(newInnerHtml);

      // Apply dominant ad color to CTA button and H1 only
      if (adPrimaryColor) {
        const tag = selector.match(/^[a-z0-9]+/i)?.[0]?.toLowerCase();
        if (tag === 'a' || tag === 'button') {
          const existing = $el.first().attr('style') || '';
          $el.first().attr('style', `${existing}; background-color: ${adPrimaryColor} !important; border-color: ${adPrimaryColor} !important;`);
          console.log(`[COLOR APPLIED to CTA]: ${adPrimaryColor}`);
        }
        if (tag === 'h1') {
          const existing = $el.first().attr('style') || '';
          $el.first().attr('style', `${existing}; color: ${adPrimaryColor} !important;`);
          console.log(`[COLOR APPLIED to H1]: ${adPrimaryColor}`);
        }
      }

      console.log(`[REPLACE SUCCESS]: Updated "${selector}"`);
    } catch (e) {
      console.warn(`[CHEERIO ERROR]: ${e.message}`);
    }
  }

  return $.html();
}

export async function POST(request) {
  try {
    const body = await request.json()
    let { adImageUrl, adImageBase64, adImageMimeType, landingPageUrl, adPrimaryColor } = body

    if (!landingPageUrl) {
      return Response.json({ error: 'landingPageUrl is required.' }, { status: 400 })
    }
    try { new URL(landingPageUrl); } catch {
      return Response.json({ error: 'Invalid landingPageUrl.' }, { status: 400 });
    }

    // ─── STEP 1: Gemini Vision — Analyze the ad ──────────────────────────────────
    const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    // NOTE: Image should ideally be under 1MB for Vision API
    let imagePart
    if (adImageBase64) {
      if (adImageBase64.length > 500000) {
        return Response.json({ error: 'Image too large. Please compress before uploading.' }, { status: 400 });
      }
      // Uploaded file — already base64 from client
      imagePart = {
        inlineData: {
          data: adImageBase64,
          mimeType: adImageMimeType || 'image/jpeg',
        },
      }
    } else if (adImageUrl) {
      // For URL-based images, pass the URL directly without converting to base64
      imagePart = {
        fileData: {
          fileUri: adImageUrl,
          mimeType: 'image/jpeg'
        }
      }
    } else {
      return Response.json({ error: 'Either adImageUrl or adImageBase64 is required.' }, { status: 400 })
    }

    const visionPrompt =
      'Analyze this ad creative. Extract: 1) Main offer/value proposition in one sentence 2) Target audience 3) Key benefit/hook 4) CTA text if visible. Return ONLY valid JSON with keys: offer, audience, benefit, cta'

    let adAnalysis = {}
    try {
      const visionResult = await withRetry(() => visionModel.generateContent([visionPrompt, imagePart]))
      const visionText = visionResult.response.text()
      adAnalysis = extractJSON(visionText) || {}
    } catch (err) {
      console.error('[analyze-ad] Gemini Vision failed, falling back to Groq:', err?.status || err)
      try {
        let groqImageUrl = adImageUrl;
        if (adImageBase64 && !groqImageUrl) {
          groqImageUrl = `data:${adImageMimeType || 'image/jpeg'};base64,${adImageBase64}`;
        }

        const groqResponse = await groq.chat.completions.create({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: groqImageUrl } },
                { type: 'text', text: visionPrompt }
              ]
            }
          ],
          max_tokens: 500
        });

        const result = extractJSON(groqResponse.choices[0].message.content) || {};
        adAnalysis = result;
      } catch (fallbackErr) {
        console.error('[analyze-ad] Groq Vision fallback failed:', fallbackErr);
        adAnalysis = { offer: 'Could not analyze ad', audience: '', benefit: '', cta: '' }
      }
    }

    // ─── STEP 2: Fetch landing page HTML ─────────────────────────────────────────
    let originalHtml
    try {
      const pageRes = await fetch(landingPageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 15000,
        redirect: 'follow',
      })
      if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`)
      originalHtml = await pageRes.text()
    } catch (err) {
      console.error('[analyze-ad] Page fetch error:', err)
      return Response.json(
        { error: 'Could not fetch landing page. It may block scraping.' },
        { status: 422 }
      )
    }

    // Inject <base href> as first child of <head>
    const baseTag = `<base href="${landingPageUrl}">`
    if (/<head[^>]*>/i.test(originalHtml)) {
      originalHtml = originalHtml.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
    } else {
      originalHtml = baseTag + originalHtml
    }

    // ─── STEP 3: Clean HTML for Gemini (token saving) ────────────────────────────
    const truncatedHtml = cleanHtml(originalHtml)

    // ─── STEP 4: Gemini text — Generate CRO changes ──────────────────────────────
    const textModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.3 },
    })

    const croPrompt = `You are a CRO expert. Given this ad analysis: ${JSON.stringify(adAnalysis)} and this landing page HTML: ${truncatedHtml} — rewrite the main H1, first H2, primary CTA button, and hero paragraph to match the ad's message.

RULES:
1. Return ONLY a valid JSON array: [{ "selector": "...", "newInnerHtml": "..." }]
2. CRITICAL: "selector" MUST be extracted directly from the provided HTML. Look at the actual class names in the HTML string.
3. DO NOT invent generic classes like "h1.hero-title" or "a.primary-cta". If the HTML has <h1 class="main-heading-txt">, the selector must be "h1.main-heading-txt".
4. "newInnerHtml" MUST preserve any nested HTML tags like <span> or <br> from the original element. Only change the text words.
5. Do not return anything outside the JSON array.`
    let changes = []
    try {
      const textResult = await withRetry(() => textModel.generateContent(croPrompt))
      const textRaw = textResult.response.text()
      const parsed = extractJSON(textRaw)
      changes = Array.isArray(parsed) ? parsed : []
    } catch (err) {
      console.error('[analyze-ad] Gemini CRO changes failed, falling back to Groq:', err?.status || err)
      try {
        const groqResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'user', content: croPrompt }
          ],
          max_tokens: 1000
        });
        const groqText = groqResponse.choices[0].message.content;
        const parsed = extractJSON(groqText);
        changes = Array.isArray(parsed) ? parsed : []
      } catch (fallbackErr) {
        console.error('[analyze-ad] Groq CRO fallback failed:', fallbackErr);
        changes = []
      }
    }

    // ─── STEP 5: Apply changes to ORIGINAL full HTML ─────────────────────────────
    let modifiedHtml = applyChanges(originalHtml, changes, adPrimaryColor);

    // ─── NEW STEP: Sanitize for Iframe (Kill all JavaScript) ─────────────────────
    const final$ = cheerio.load(modifiedHtml);
    
    // 1. Nuke standard scripts
    final$('script').remove();
    
    // 2. Nuke Next.js/React preloaded scripts (This fixes the Invalid URL error)
    final$('link[as="script"]').remove();
    final$('link[rel="modulepreload"]').remove();
    
    // 3. Remove inline Javascript events (e.g., onload, onerror)
    final$('*').each(function() {
      if (this.attribs) {
        for (const attr in this.attribs) {
          if (attr.toLowerCase().startsWith('on')) {
            final$(this).removeAttr(attr);
          }
        }
      }
    });

    // Update modifiedHtml with the bulletproof version
    modifiedHtml = final$.html();

    return Response.json({
      originalHtml,
      modifiedHtml,
      changes,
      adAnalysis,
      adPrimaryColor: adPrimaryColor || null,
    })
  } catch (err) {
    console.error('[analyze-ad] Unhandled error:', err)
    const msg = err?.status === 429
      ? 'Gemini API rate limit reached. Please wait a moment and try again.'
      : 'Internal server error.'
    return Response.json({ error: msg }, { status: err?.status === 429 ? 429 : 500 })
  }
}
