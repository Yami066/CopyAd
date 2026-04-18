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

const NAV_WORDS = /^(home|about|login|sign up|menu|contact|blog|faq|privacy|terms|search)$/i;
const CANDIDATE_TAGS = ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span'];
const MAX_NODES = 15;

/**
 * Stamp up to MAX_NODES content nodes with stable data-runtime-id attributes
 * and return both the stamped HTML and a { id -> text } map for the AI.
 */
function buildRuntimeMap(html) {
  const $ = cheerio.load(html);

  // Strip chrome / boilerplate elements
  $('nav, footer, header, aside, script, style, noscript').remove();

  const map = {};
  let counter = 0;

  for (const tag of CANDIDATE_TAGS) {
    if (counter >= MAX_NODES) break;
    $(tag).each(function () {
      if (counter >= MAX_NODES) return false; // break

      const text = $(this).text().trim();
      if (!text) return;
      if (text.length < 8 || text.length > 400) return;
      if (NAV_WORDS.test(text)) return;

      // Skip if an ancestor is already tagged (avoid child double-tagging)
      if ($(this).parents('[data-runtime-id]').length > 0) return;

      // Skip if a descendant is already tagged (avoid parent double-tagging)
      if ($(this).find('[data-runtime-id]').length > 0) return;

      const id = `node_${counter}`;
      $(this).attr('data-runtime-id', id);
      map[id] = text;
      counter++;
    });
  }

  return { html: $.html(), map };
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

/**
 * Write AI-returned texts back into the stamped HTML by data-runtime-id,
 * then strip all data-runtime-id attributes before returning.
 */
function injectAndCleanup(html, aiChanges) {
  const $ = cheerio.load(html);

  for (const [id, newText] of Object.entries(aiChanges)) {
    $(`[data-runtime-id="${id}"]`).first().text(newText);
    console.log(`[INJECT SUCCESS]: ${id} → "${newText.slice(0, 60)}"`);
  }

  $('[data-runtime-id]').removeAttr('data-runtime-id');

  return $.html();
}

function injectAdBanner(html, adAnalysis, adPrimaryColor) {
  const color = adPrimaryColor || '#000000'

  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  const textColor = brightness > 128 ? '#000000' : '#ffffff'

  const banner = `
  <div style="
    width: 100%;
    background-color: ${color};
    color: ${textColor};
    padding: 12px 24px;
    text-align: center;
    font-family: sans-serif;
    box-sizing: border-box;
    z-index: 99999;
    position: relative;
  ">
    <span style="font-size: 15px; font-weight: 600;">
      ${adAnalysis.offer || 'Special Offer'}
    </span>
    <span style="font-size: 13px; margin-left: 12px; opacity: 0.9;">
      ${adAnalysis.benefit || ''}
    </span>
    ${adAnalysis.cta ? `
    <a href="#" style="
      margin-left: 16px;
      background: ${textColor};
      color: ${color};
      padding: 4px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    ">${adAnalysis.cta}</a>` : ''}
  </div>`

  return html.replace(/<body[^>]*>/i, `$&${banner}`)
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

    // ─── STEP 3: Build Runtime Node Map for Gemini ───────────────────────────────
    const { html: mappedHtml, map: runtimeMap } = buildRuntimeMap(originalHtml)

    // ─── STEP 4: Gemini text — Generate CRO changes ──────────────────────────────
    const textModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.3 },
    })

    const croPrompt = `You are a CRO expert. Given this ad analysis: ${JSON.stringify(adAnalysis)}

Here is the extracted text mapped to node IDs:
${JSON.stringify(runtimeMap, null, 2)}

Return ONLY a valid JSON object with the exact same keys.
Update the values to match the ad's message and offer.
Plain text only — no HTML tags in values.
Do not add or remove keys.`
    let changes = []
    try {
      const textResult = await withRetry(() => textModel.generateContent(croPrompt))
      const textRaw = textResult.response.text()
      const parsed = extractJSON(textRaw)
      changes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
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
        changes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch (fallbackErr) {
        console.error('[analyze-ad] Groq CRO fallback failed:', fallbackErr);
        changes = {}
      }
    }

    // ─── STEP 5: Inject AI changes + ad banner into mapped HTML ───────────────────
    let modifiedHtml = injectAdBanner(
      injectAndCleanup(mappedHtml, changes),
      adAnalysis,
      adPrimaryColor
    );

    // ─── NEW STEP: Sanitize BOTH outputs for Iframes ─────────────────────
    
    function sanitizeForIframe(htmlString) {
      const $ = cheerio.load(htmlString);
      
      // 1. Kill all JavaScript
      $('script').remove();
      $('link[as="script"]').remove();
      $('link[rel="modulepreload"]').remove();
      
      // 2. Force Visibility (Bypass Anti-Flicker CSS)
      $('html').removeClass().removeAttr('style');
      // Force the body to be fully visible and ensure it has a background color
      $('body')
        .removeClass()
        .attr('style', 'opacity: 1 !important; visibility: visible !important; display: block !important; min-height: 100vh !important;');
        
      return $.html();
    }

    // Apply the ultimate sanitizer to both versions
    modifiedHtml = sanitizeForIframe(modifiedHtml);
    const safeOriginalHtml = sanitizeForIframe(originalHtml);

    return Response.json({
      originalHtml: safeOriginalHtml,
      modifiedHtml: modifiedHtml,
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
