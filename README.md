# CopyAd ⚡

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Upstash Redis](https://img.shields.io/badge/Redis-Upstash-red?logo=redis)
![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase)
![Gemini Vision](https://img.shields.io/badge/AI-Gemini_2.0_Flash-blue?logo=google)
![Groq](https://img.shields.io/badge/Fallback-Groq_Llama_3-orange)

**CopyAd** is an AI-powered Conversion Rate Optimization (CRO) engine that dynamically personalizes landing pages to match the exact context of the ad a user just clicked. 

Instead of routing all ad traffic to a generic homepage, CopyAd uses a lightweight Client SDK to instantly swap headlines, subtext, and CTAs on your live website, maintaining the "scent" of the ad and driving higher conversion rates.

## 🚀 Features

- **Dual-Model AI Engine:** Utilizes Google's Gemini 2.0 Flash for multi-modal ad analysis and DOM mapping, with a robust fallback to Meta's Llama 3 (via Groq) to completely eliminate rate-limit downtime.
- **Ultra-Low Latency Caching:** Powered by Upstash Redis, subsequent visits to a personalized campaign return the generated JSON payload in `<50ms`.
- **Zero-Friction Client SDK:** B2B clients integrate via a single vanilla `<script>` tag. No reverse proxies, no DNS changes, and no WAF blocking.
- **Safe DOM Manipulation:** Utilizes Cheerio for intelligent HTML node mapping, ensuring structural integrity and protecting against CSS flickering.
- **Persistent Ledger:** All generations, match scores, and image hashes are securely logged in a Supabase PostgreSQL database.

## 🏗️ Architecture Flow

1. **The Trigger:** User clicks an ad and lands on `zeptonow.com?copyad_campaign=diwali26`.
2. **The SDK:** The CopyAd JS snippet detects the UTM parameter and pings the CopyAd API.
3. **The Cache:** The API checks Upstash Redis. If the campaign exists, it returns the JSON payload instantly.
4. **The AI (On Miss):** If uncached, the API analyzes the ad image, scrapes the target URL, and uses AI to map targeted copy to specific HTML nodes.
5. **The Injection:** The SDK receives the JSON and dynamically updates the DOM client-side within 200ms.

## 💻 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Caching:** Upstash Redis
- **Primary AI:** Google Generative AI (Gemini 2.0 Flash)
- **Fallback AI:** Groq (Llama-3.3-70b-versatile)
- **HTML Parsing:** Cheerio

## 🛠️ Getting Started

### Prerequisites
You will need accounts for [Upstash](https://upstash.com/), [Supabase](https://supabase.com/), [Google AI Studio](https://aistudio.google.com/), and [Groq](https://groq.com/).

### Installation

1. Clone the repository:
```bash
git clone [https://github.com/yourusername/copyad.git](https://github.com/yourusername/copyad.git)
cd copyad
Install dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env.local file in the root directory and add your keys:

Code snippet
NEXT_PUBLIC_SUPABASE_URL="[https://your-project.supabase.co](https://your-project.supabase.co)"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

UPSTASH_REDIS_REST_URL="[https://your-redis-url.upstash.io](https://your-redis-url.upstash.io)"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"

GEMINI_API_KEY="your-gemini-key"
GROQ_API_KEY="your-groq-key"
Run the development server:

Bash
npm run dev
