# CopyAd — Landing Page Personalizer

## What is CopyAd?
When someone clicks an ad promising **"Super Saver Prices"** but lands on a generic homepage, they bounce.

**CopyAd** fixes that automatically.

It acts like an AI window-dresser:
- Reads your ad
- Understands the offer
- Rewrites the landing page:
  - H1
  - H2
  - Hero paragraph
  - CTA
- Extracts brand colors from the ad
- Applies styling to match visual identity

No manual A/B testing.  
No developer required.  
Just paste an ad and a URL.

⚠️ **Note**
For best results, use **SSR or static websites** (e.g., Stripe, Basecamp).  
Complex React SPAs may not fully render due to browser CORS restrictions.

---

## Tech Stack

### Frontend
- Next.js 14
- React
- Tailwind CSS

### Backend
- Next.js API Routes

### AI Layer
- Vision: Gemini 2.0 Flash
- Fallback: Groq Llama 4 Scout
- Secondary fallback: Groq Llama 3.3 70B

### Processing
- HTML parsing: Cheerio
- Color extraction: HTML5 Canvas API (client-side)

### Deployment
- Vercel

---

## Getting Started

### 1. Clone repository
```bash
git clone https://github.com/Yami066/CopyAd.git
cd CopyAd
npm install
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
npm run dev
