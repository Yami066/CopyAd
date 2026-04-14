CopyAd -- Landing Page Personalizer

What is CopyAd?
When someone clicks an ad promising "Super Saver Prices," but lands on a generic homepage — they bounce.
CopyAd fixes that. It acts as an automatic window-dresser: it reads your ad, understands the offer, then rewrites the landing page's H1, H2, hero paragraph, and CTA to perfectly mirror the ad's message. It even extracts the brand color from the ad and applies it to the CTA button for visual consistency.
No manual A/B testing. No developer needed. Just paste an ad and a URL.

⚠️ For best results, use SSR/Static sites (e.g. Stripe, Basecamp). Complex React SPAs may not fully render due to browser CORS restrictions.

Tech Stack
LayerTechFrontendNext.js 14, React, Tailwind CSSBackendNext.js API RoutesAI — VisionGemini 2.0 Flash → Groq Llama 4 Scout (fallback)AI — CopyGemini 2.0 Flash → Groq Llama 3.3 70B (fallback)HTML ParsingCheerioColor ExtractionHTML5 Canvas API (client-side)DeploymentVercel

Getting Started
bashgit clone https://github.com/Yami066/CopyAd.git
cd CopyAd
npm install
Create a .env.local file:
envGEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
bashnpm run dev
# Open http://localhost:3000
