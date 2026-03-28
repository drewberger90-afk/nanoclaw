'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [showMagic, setShowMagic] = useState(false)

  const handleLogin = async () => {
    setError('')
    if (!email || !password) { setError('Enter your email and password'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    router.replace('/my-agent')
  }

  const handleMagicLink = async () => {
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setMagicSent(true)
  }

  if (magicSent) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-black text-white mb-2">Check your inbox</h2>
          <p className="text-sm text-slate-500">
            We sent a magic link to <span className="text-white font-medium">{email}</span>.
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
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <User size={20} className="text-indigo-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Welcome Back</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />

          {!showMagic && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {!showMagic ? (
            <>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <button
                onClick={() => setShowMagic(true)}
                className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1"
              >
                Forgot password? Use a magic link instead
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleMagicLink}
                disabled={loading}
                className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Magic Link'}
              </button>
              <button
                onClick={() => setShowMagic(false)}
                className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1"
              >
                Back to password login
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-slate-600">
            No account yet?{' '}
            <Link href="/signup" className="text-slate-400 hover:text-white transition-colors">
              Sign up
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
