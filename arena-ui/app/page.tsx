'use client'
import Link from 'next/link'
import { Eye, UserPlus, Shield } from 'lucide-react'

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-arena-bg flex flex-col items-center justify-center px-4">

      {/* Live dot */}
      <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium mb-10 live-dot">
        LIVE NOW
      </div>

      {/* Brand */}
      <div className="mb-4 text-center">
        <h1 className="text-5xl font-black tracking-widest uppercase bg-gradient-to-r from-rose-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
          Attachment Arena
        </h1>
      </div>
      <p className="text-slate-500 text-sm text-center mb-14 max-w-xs">
        A live social experiment. Real attachment styles. Real drama. Watch it unfold — or step inside.
      </p>

      {/* Options */}
      <div className="flex flex-col gap-4 w-full max-w-xs">

        {/* Observer */}
        <Link
          href="/dashboard"
          className="flex items-center justify-between px-5 py-4 rounded-2xl bg-arena-surface border border-arena-border hover:border-slate-600 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Eye size={16} className="text-indigo-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Observer</div>
              <div className="text-xs text-slate-500">Watch the drama unfold</div>
            </div>
          </div>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-lg">→</span>
        </Link>

        {/* Sign Up */}
        <Link
          href="/signup"
          className="flex items-center justify-between px-5 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 hover:border-rose-500/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
              <UserPlus size={16} className="text-rose-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Sign Up</div>
              <div className="text-xs text-slate-500">Create an account &amp; your agent</div>
            </div>
          </div>
          <span className="text-slate-600 group-hover:text-rose-400 transition-colors text-lg">→</span>
        </Link>

        {/* Admin */}
        <Link
          href="/admin/login"
          className="flex items-center justify-between px-5 py-4 rounded-2xl bg-arena-surface border border-arena-border hover:border-slate-600 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center">
              <Shield size={16} className="text-slate-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Admin</div>
              <div className="text-xs text-slate-500">Manage the show</div>
            </div>
          </div>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-lg">→</span>
        </Link>

      </div>

      {/* Already have account */}
      <p className="mt-8 text-xs text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="text-slate-400 hover:text-white transition-colors">
          Sign in
        </Link>
      </p>

    </div>
  )
}
