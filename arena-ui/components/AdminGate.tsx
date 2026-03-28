'use client'
import { useState, useEffect } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'

const ADMIN_KEY = 'arena_admin_auth'
const ADMIN_PWD = '1030'

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [authed,  setAuthed]  = useState<boolean | null>(null)
  const [input,   setInput]   = useState('')
  const [error,   setError]   = useState(false)
  const [show,    setShow]    = useState(false)

  useEffect(() => {
    setAuthed(localStorage.getItem(ADMIN_KEY) === ADMIN_PWD)
  }, [])

  if (authed === null) return null  // hydrating

  if (authed) return <>{children}</>

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input === ADMIN_PWD) {
      localStorage.setItem(ADMIN_KEY, ADMIN_PWD)
      setAuthed(true)
    } else {
      setError(true)
      setInput('')
      setTimeout(() => setError(false), 1200)
    }
  }

  return (
    <div className="min-h-screen bg-arena-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="bg-arena-card border border-arena-border rounded-2xl p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/25 mx-auto mb-5">
            <Lock size={20} className="text-rose-400" />
          </div>
          <h2 className="text-xl font-black text-white text-center mb-1">Admin Access</h2>
          <p className="text-sm text-slate-500 text-center mb-6">Enter the admin password to continue</p>

          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <input
                autoFocus
                type={show ? 'text' : 'password'}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Password"
                className={`w-full bg-arena-muted border rounded-xl px-4 py-3 text-white placeholder:text-slate-600
                  focus:outline-none pr-10 transition-colors
                  ${error ? 'border-red-500/60 animate-pulse' : 'border-arena-border focus:border-rose-500/50'}`}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && <p className="text-xs text-red-400 text-center">Incorrect password</p>}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold text-sm hover:bg-rose-500/25 transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
