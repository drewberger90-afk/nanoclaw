'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Suspense } from 'react'

function CallbackInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      router.replace('/my-agent')
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(() => {
      router.replace('/my-agent')
    })
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-arena-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-rose-500/40 border-t-rose-400 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Signing you in…</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-rose-500/40 border-t-rose-400 rounded-full animate-spin" />
      </div>
    }>
      <CallbackInner />
    </Suspense>
  )
}
