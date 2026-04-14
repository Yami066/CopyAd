'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [inputMode, setInputMode] = useState('url') // 'url' or 'upload'
  const [adImageUrl, setAdImageUrl] = useState('')
  const [landingPageUrl, setLandingPageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  async function getDominantColor(imageUrl, base64, mimeType) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        let data;
        try {
          data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch (e) {
          console.warn('[getDominantColor] Canvas tainted (CORS). Skipping color extraction.');
          return resolve(null);
        }
        const colorMap = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = Math.round(data[i] / 10) * 10;
          const g = Math.round(data[i+1] / 10) * 10;
          const b = Math.round(data[i+2] / 10) * 10;
          const a = data[i+3];
          // Skip transparent, near-white, and near-black pixels
          if (a < 128) continue;
          if (r > 200 && g > 200 && b > 200) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 40) continue; // skip low-saturation (gray) pixels
          if (r < 25 && g < 25 && b < 25) continue;
          const key = `${r},${g},${b}`;
          colorMap[key] = (colorMap[key] || 0) + 1;
        }
        const dominant = Object.entries(colorMap).sort((a, b) => b[1] - a[1])[0];
        if (!dominant) return resolve(null);
        const [r, g, b] = dominant[0].split(',').map(Number);
        resolve(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`);
      };
      img.onerror = () => resolve(null);
      img.src = base64 ? `data:${mimeType};base64,${base64}` : imageUrl;
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let body = { landingPageUrl }

      if (inputMode === 'upload') {
        const file = fileInputRef.current?.files?.[0]
        if (!file) {
          setError('Please select an image file.')
          setLoading(false)
          return
        }
        // Convert file to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        body.adImageBase64 = base64
        body.adImageMimeType = file.type
      } else {
        if (!adImageUrl.trim()) {
          setError('Please enter an ad image URL.')
          setLoading(false)
          return
        }
        body.adImageUrl = adImageUrl.trim()
      }

      if (!landingPageUrl.trim()) {
        setError('Please enter a landing page URL.')
        setLoading(false)
        return
      }

      const adPrimaryColor = await getDominantColor(
        inputMode === 'url' ? adImageUrl : null,
        body.adImageBase64 || null,
        body.adImageMimeType || null
      );
      if (adPrimaryColor) body.adPrimaryColor = adPrimaryColor;

      const res = await fetch('/api/analyze-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      if (!data.originalHtml) {
        setError('No HTML returned. The landing page may have blocked access.')
        setLoading(false)
        return
      }

      // Store in sessionStorage and redirect
      sessionStorage.setItem('troopod_result', JSON.stringify(data))
      router.push('/preview')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Personalize Your Landing Page</h1>
          <p className="text-gray-500 text-base">
            Upload your ad creative and a landing page URL. We&apos;ll tailor the copy to match your ad.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 space-y-6">
          {/* Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ad Creative</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'url'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Image URL
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'upload'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Upload Image
              </button>
            </div>

            {inputMode === 'url' ? (
              <input
                id="adImageUrl"
                type="url"
                value={adImageUrl}
                onChange={(e) => setAdImageUrl(e.target.value)}
                placeholder="https://example.com/ad-banner.jpg"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg px-4 py-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  id="adImageFile"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={() => {}} // handled on submit
                />
                <p className="text-sm text-gray-500">
                  {fileInputRef.current?.files?.[0]
                    ? fileInputRef.current.files[0].name
                    : 'Click to upload — JPG, PNG, WEBP, GIF'}
                </p>
              </div>
            )}
          </div>

          {/* Landing Page URL */}
          <div>
            <label htmlFor="landingPageUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Landing Page URL
            </label>
            <input
              id="landingPageUrl"
              type="url"
              value={landingPageUrl}
              onChange={(e) => setLandingPageUrl(e.target.value)}
              placeholder="https://example.com/landing-page"
              required
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="personalizeBtn"
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              'Personalize'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
