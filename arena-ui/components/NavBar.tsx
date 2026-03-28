'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LayoutDashboard, Activity, Vote, Globe, Camera, Heart, Home, Settings, UserPlus, User, LogOut } from 'lucide-react'

const links = [
  { href: '/dashboard',             label: 'Overview',    icon: LayoutDashboard },
  { href: '/timeline',              label: 'Timeline',    icon: Activity },
  { href: '/dates',                 label: 'Dates',       icon: Heart },
  { href: '/vote',                  label: 'Vote',        icon: Vote },
  { href: '/world',                 label: 'Live World',  icon: Globe },
  { href: '/agentgram',             label: 'AgentGram',   icon: Camera },
  { href: '/admin/applications',    label: 'Villa',       icon: Home },
  { href: '/admin/vote-setup',      label: 'Admin',       icon: Settings },
]

export function NavBar() {
  const path   = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-16 bg-arena-surface/90 backdrop-blur border-b border-arena-border flex items-center px-6 gap-8">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2 mr-4 shrink-0">
        <span className="text-lg font-black tracking-widest uppercase bg-gradient-to-r from-rose-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
          Attachment Arena
        </span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          )
        })}
      </div>

      {/* Right side — auth-aware */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {loggedIn ? (
          <>
            <Link
              href="/my-agent"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-arena-border text-slate-400 text-xs font-medium hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <User size={12} /> My Agent
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-arena-border text-slate-500 text-xs font-medium hover:text-slate-300 hover:border-slate-500 transition-colors"
            >
              <LogOut size={12} /> Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-arena-border text-slate-400 text-xs font-medium hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <User size={12} /> Sign In
            </Link>
            <Link
              href="/signup"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/25 transition-colors"
            >
              <UserPlus size={12} /> Sign Up
            </Link>
          </>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium live-dot">
        LIVE
      </div>
    </nav>
  )
}
