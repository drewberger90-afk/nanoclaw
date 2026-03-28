import type { Metadata } from 'next'
import './globals.css'
import { NavBar } from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'Attachment Arena',
  description: 'Live reality AI dating drama',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-arena-bg text-slate-200 antialiased">
        <NavBar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  )
}
