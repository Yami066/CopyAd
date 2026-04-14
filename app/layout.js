import './globals.css'

export const metadata = {
  title: 'Troopod Assignment — AI Landing Page Personalizer',
  description: 'Personalize landing pages to match your ad creative using Gemini AI',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Dark Navbar */}
        <nav className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
          <span className="text-lg font-semibold tracking-tight">Troopod Assignment</span>
          <span className="text-sm text-gray-400">AI Landing Page Personalizer</span>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
