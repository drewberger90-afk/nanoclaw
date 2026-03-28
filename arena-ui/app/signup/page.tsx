'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { UserPlus, Mail } from 'lucide-react'

export default function SignupPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [sent,     setSent]     = useState(false)

  const handleSignUp = async () => {
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }

    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-black text-white mb-2">Check your inbox</h2>
          <p className="text-sm text-slate-500 mb-1">
            We sent a confirmation link to
          </p>
          <p className="text-sm text-white font-medium mb-6">{email}</p>
          <p className="text-xs text-slate-600">
            Click the link in the email to activate your account, then you can{' '}
            <Link href="/login" className="text-rose-400 hover:text-rose-300 transition-colors">
              sign in
            </Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-4">
            <UserPlus size={20} className="text-rose-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Create Account</h1>
          <p className="text-sm text-slate-500">Join Attachment Arena</p>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSignUp()}
            className="w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSignUp}
            disabled={loading}
            className="w-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="text-slate-400 hover:text-white transition-colors">
              Sign in
            </Link>
          </p>
          <p className="text-xs text-slate-600">
            <Link href="/" className="text-slate-600 hover:text-slate-400 transition-colors">
              ← Back to welcome
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
