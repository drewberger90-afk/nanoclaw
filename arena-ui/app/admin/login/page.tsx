'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = () => {
    setError('')
    const correct = process.env.NEXT_PUBLIC_ADMIN_PIN
    if (!correct) { setError('Admin PIN not configured'); return }
    if (pin !== correct) { setError('Incorrect PIN'); setPin(''); return }
    sessionStorage.setItem('arena_admin', '1')
    router.replace('/admin/applications')
  }

  return (
    <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
      <div className="w-full max-w-xs">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center mx-auto mb-4">
            <Shield size={20} className="text-slate-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Admin Access</h1>
          <p className="text-sm text-slate-500">Enter your PIN to continue</p>
        </div>

        {/* PIN input */}
        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 text-center text-xl tracking-widest focus:outline-none focus:border-slate-500/50 transition-colors"
            autoFocus
          />

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading || pin.length === 0}
            className="w-full bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/25 text-slate-300 font-semibold py-3 rounded-xl transition-colors disabled:opacity-40"
          >
            Enter
          </button>
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            ← Back to welcome
          </a>
        </div>

      </div>
    </div>
  )
}
