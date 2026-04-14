'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function PreviewPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('troopod_result')
      if (!raw) {
        setError('No data found. Please go back and submit the form.')
        return
      }
      setData(JSON.parse(raw))
    } catch {
      setError('Failed to load preview data.')
    }
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <p className="text-red-600 font-medium">{error}</p>
          <Link
            href="/"
            className="inline-block bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            ← Try Another
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-gray-400 text-sm">Loading preview...</div>
      </div>
    )
  }

  const { originalHtml, modifiedHtml, changes, adAnalysis, adPrimaryColor } = data

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-8">

        {/* Ad Analysis Card */}
        <div className="border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Ad Analysis</h2>
            <Link
              href="/"
              id="tryAnotherBtn"
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              ← Try Another
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Offer', value: adAnalysis?.offer },
              { label: 'Audience', value: adAnalysis?.audience },
              { label: 'Benefit', value: adAnalysis?.benefit },
              { label: 'CTA', value: adAnalysis?.cta },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm text-gray-800">{value || <span className="italic text-gray-400">N/A</span>}</p>
              </div>
            ))}
            {adPrimaryColor && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Brand Color</p>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: adPrimaryColor }} />
                  <p className="text-sm text-gray-800 font-mono">{adPrimaryColor}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Split-screen iframes */}
        <div className="grid grid-cols-2 gap-4">
          {/* Original */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400 inline-block" />
              <span className="text-sm font-medium text-gray-700">Original</span>
            </div>
            <iframe
              id="originalFrame"
              srcDoc={originalHtml}
              sandbox="allow-scripts allow-same-origin allow-forms"
              className="w-full"
              style={{ height: '600px', border: 'none', display: 'block' }}
              title="Original Landing Page"
            />
          </div>

          {/* Personalized */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-400 inline-block" />
              <span className="text-sm font-medium text-white">Personalized</span>
            </div>
            <iframe
              id="modifiedFrame"
              srcDoc={modifiedHtml}
              sandbox="allow-scripts allow-same-origin allow-forms"
              className="w-full"
              style={{ height: '600px', border: 'none', display: 'block' }}
              title="Personalized Landing Page"
            />
          </div>
        </div>

        {/* Changes Made */}
        <div className="border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Changes Made{' '}
            <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
              {changes?.length || 0}
            </span>
          </h2>

          {!changes || changes.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No changes were made — the pages should look identical. This may happen if Gemini couldn't find matching elements.
            </p>
          ) : (
            <div className="space-y-4">
              {changes.map((change, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start gap-3">
                    {/* Old */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Before</p>
                      <div className="text-sm text-gray-700 break-words font-mono bg-red-50 border border-red-100 rounded px-3 py-2">
                        {change.selector || 'N/A'}
                      </div>
                    </div>
                    {/* Arrow */}
                    <div className="pt-5 text-gray-400 text-lg flex-shrink-0">→</div>
                    {/* New */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">After</p>
                      <div
                        className="text-sm text-gray-700 break-words font-mono bg-green-50 border border-green-100 rounded px-3 py-2"
                        dangerouslySetInnerHTML={{ __html: change.newInnerHtml || '' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
