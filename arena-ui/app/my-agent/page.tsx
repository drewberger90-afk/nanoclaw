'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api, supabase } from '@/lib/supabase'
import { STYLE_META, STAGE_META } from '@/types/arena'
import type { Relationship } from '@/types/arena'
import { User, Heart, LogOut, Sparkles, Edit2, CheckCircle, X, Lock, Home, ArrowRight } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────
interface UserAgent {
  id: string; name: string; age: number; gender: string
  occupation: string; style: string; bio: string
  traits: string[]; interests: string[]; goal: string
  status: string; companion_id: string | null
  email: string; created_at: string
}

// ── Small helpers ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  )
}

// ── Not-logged-in view ────────────────────────────────────────────────────────
function LoginView() {
  const [email,  setEmail]  = useState('')
  const [sent,   setSent]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,  setError]  = useState('')

  const handleSend = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-3">📬</div>
        <h2 className="text-lg font-black text-white mb-1">Check your inbox</h2>
        <p className="text-sm text-slate-500">We sent a login link to <span className="text-white font-medium">{email}</span>.</p>
        <button onClick={() => setSent(false)} className="mt-4 text-xs text-slate-600 hover:text-slate-400 transition-colors">
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-5">
        <User size={20} className="text-rose-400" />
      </div>
      <h2 className="text-xl font-black text-white text-center mb-1">My Agent</h2>
      <p className="text-sm text-slate-500 text-center mb-6">Enter your email to access your agent dashboard.</p>
      <div className="space-y-3">
        <input
          autoFocus
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="your@email.com"
          className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold text-sm hover:bg-rose-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? 'Sending…' : <>Send login link <ArrowRight size={14} /></>}
        </button>
        <p className="text-center text-xs text-slate-600">
          No agent yet? <Link href="/create-agent" className="text-rose-400 hover:text-rose-300">Create one →</Link>
        </p>
      </div>
    </div>
  )
}

// ── Password section ──────────────────────────────────────────────────────────
function PasswordSection() {
  const [pwd,     setPwd]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  const save = async () => {
    if (pwd.length < 6)       { setError('At least 6 characters'); return }
    if (pwd !== confirm)      { setError('Passwords don\'t match'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    setSaving(false)
    if (err) { setError(err.message); return }
    setPwd(''); setConfirm(''); setDone(true)
    setTimeout(() => setDone(false), 3000)
  }

  return (
    <div className="bg-arena-card border border-arena-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={13} className="text-slate-500" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Set / Change Password</span>
        {done && <CheckCircle size={13} className="text-emerald-400 ml-auto" />}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input type="password" value={pwd}     onChange={e => setPwd(e.target.value)}     placeholder="New password"     className="bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/40" />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm"          className="bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/40" />
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <button onClick={save} disabled={saving || !pwd} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700 transition-colors disabled:opacity-40">
        {saving ? 'Saving…' : 'Save password'}
      </button>
    </div>
  )
}

// ── Edit agent section ────────────────────────────────────────────────────────
function EditSection({ agent, onSaved }: { agent: UserAgent; onSaved: (a: Partial<UserAgent>) => void }) {
  const [open,       setOpen]       = useState(false)
  const [bio,        setBio]        = useState(agent.bio)
  const [occupation, setOccupation] = useState(agent.occupation)
  const [intInput,   setIntInput]   = useState('')
  const [interests,  setInterests]  = useState<string[]>(agent.interests ?? [])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const addInterest = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '').trim()
    if (t && !interests.includes(t) && interests.length < 6) setInterests(prev => [...prev, t])
    setIntInput('')
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      await api.updateUserAgent(agent.id, { bio, occupation, interests })
      onSaved({ bio, occupation, interests })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
        <Edit2 size={11} /> Edit bio & details
      </button>
    )
  }

  return (
    <div className="bg-arena-card border border-arena-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Edit Agent</span>
        <button onClick={() => setOpen(false)}><X size={14} className="text-slate-500 hover:text-slate-300" /></button>
      </div>
      <div>
        <label className="block text-[10px] text-slate-600 mb-1 uppercase tracking-widest">Occupation</label>
        <input value={occupation} onChange={e => setOccupation(e.target.value)} className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none" />
      </div>
      <div>
        <label className="block text-[10px] text-slate-600 mb-1 uppercase tracking-widest">Bio ({bio.length}/200)</label>
        <textarea rows={3} maxLength={200} value={bio} onChange={e => setBio(e.target.value)} className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none resize-none" />
      </div>
      <div>
        <label className="block text-[10px] text-slate-600 mb-1 uppercase tracking-widest">Interests</label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {interests.map(i => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px]">
              {i} <button onClick={() => setInterests(p => p.filter(x => x !== i))}>×</button>
            </span>
          ))}
        </div>
        {interests.length < 6 && (
          <input value={intInput} onChange={e => setIntInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addInterest(intInput) } }}
            onBlur={() => intInput.trim() && addInterest(intInput)}
            placeholder="Add interest, press Enter"
            className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none" />
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={save} disabled={saving} className="w-full py-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/25 transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

// ── Apply to show section ─────────────────────────────────────────────────────
function ApplySection({ agent }: { agent: UserAgent }) {
  const [motivation, setMotivation] = useState('')
  const [applying,   setApplying]   = useState(false)
  const [applied,    setApplied]    = useState(false)
  const [error,      setError]      = useState('')

  const apply = async () => {
    if (motivation.trim().length < 20) { setError('Write at least 20 characters'); return }
    setApplying(true); setError('')
    try {
      await api.createApplication({ agent_id: agent.id, agent_name: agent.name, motivation: motivation.trim() })
      setApplied(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Application failed')
    } finally { setApplying(false) }
  }

  if (applied) {
    return (
      <div className="bg-arena-card border border-emerald-500/25 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle size={16} className="text-emerald-400 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-white">Application submitted!</div>
          <div className="text-xs text-slate-500">The admin will review it shortly.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-arena-card border border-arena-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Home size={13} className="text-rose-400" />
        <span className="text-xs font-semibold text-rose-400 uppercase tracking-widest">Apply to Singles Villa</span>
      </div>
      <p className="text-xs text-slate-500">Write why {agent.name} should be on the show. The admin decides who gets in.</p>
      <textarea
        rows={3}
        value={motivation}
        onChange={e => setMotivation(e.target.value)}
        placeholder={`Why should ${agent.name} be on Attachment Arena?`}
        className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={apply} disabled={applying} className="w-full py-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/25 transition-colors disabled:opacity-50">
        {applying ? 'Submitting…' : 'Submit application'}
      </button>
    </div>
  )
}

// ── Relationship row ──────────────────────────────────────────────────────────
function RelRow({ rel, agentId }: { rel: Relationship; agentId: string }) {
  const otherName = rel.agent_a_id === agentId ? rel.agent_b_name : rel.agent_a_name
  const stageMeta = STAGE_META[rel.stage] ?? { label: rel.stage, color: 'text-slate-400' }
  return (
    <div className="flex items-center gap-3 py-2 border-b border-arena-border/50 last:border-0">
      <Heart size={10} className="text-rose-400/50 shrink-0" />
      <span className="text-sm font-medium text-white flex-1">{otherName}</span>
      <span className={`text-xs font-medium ${stageMeta.color}`}>{stageMeta.label}</span>
      <span className="text-xs text-slate-500 w-12 text-right">{rel.happiness_score}/100</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyAgentPage() {
  const [user,    setUser]    = useState<SupabaseUser | null | undefined>(undefined)
  const [agent,   setAgent]   = useState<UserAgent | null>(null)
  const [rels,    setRels]    = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)

  const loadAgent = useCallback(async (email: string) => {
    try {
      const [agentRes, relsRes] = await Promise.all([
        api.getMyAgent(email),
        api.getRelationships(),
      ])
      const a = agentRes?.data ?? null
      setAgent(a)
      if (a && Array.isArray(relsRes?.data)) {
        setRels(relsRes.data.filter((r: Relationship) =>
          (r.agent_a_id === a.id || r.agent_b_id === a.id) &&
          !['strangers', 'broken_up', 'divorced'].includes(r.stage)
        ))
      }
    } catch (e) {
      console.error('loadAgent failed', e)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user ?? null
      setUser(u)
      if (u?.email) loadAgent(u.email).finally(() => setLoading(false))
      else setLoading(false)
    })
  }, [loadAgent])

  const SHOW_ROLE_LABEL: Record<string, string> = {
    spectator: 'Spectator', contestant: 'Contestant 🏡', coupled: 'Coupled 💑', crowned: 'Heart Crown 👑',
  }

  // Still loading session
  if (user === undefined || loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-rose-500/40 border-t-rose-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-arena-bg px-4 py-10">
      <div className="w-full max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-300 transition-colors text-sm">← Arena</Link>
          <span className="text-xs font-black tracking-widest uppercase bg-gradient-to-r from-rose-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
            My Agent
          </span>
          {user && (
            <button
              onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <LogOut size={12} /> Sign out
            </button>
          )}
          {!user && <div className="w-16" />}
        </div>

        <div className="bg-arena-card border border-arena-border rounded-2xl p-6">
          {/* Not logged in */}
          {!user && <LoginView />}

          {/* Logged in, no agent */}
          {user && !agent && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🎭</div>
              <h2 className="text-lg font-black text-white mb-1">No agent yet</h2>
              <p className="text-sm text-slate-500 mb-5">You haven&apos;t created an agent with this email.</p>
              <Link href="/create-agent" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 text-sm font-semibold hover:bg-rose-500/25 transition-colors">
                <Sparkles size={14} /> Create My Agent
              </Link>
            </div>
          )}

          {/* Logged in, has agent */}
          {user && agent && (() => {
            const meta     = STYLE_META[agent.style as keyof typeof STYLE_META] ?? STYLE_META.secure
            const roleLabel = SHOW_ROLE_LABEL[agent.status] ?? 'Spectator'
            return (
              <div>
                {/* Agent card */}
                <Section title="Your Agent">
                  <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4 mb-3`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl ${meta.bg} border ${meta.border} shrink-0`}>
                        {meta.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">{agent.name}</span>
                          <span className="text-xs text-slate-500">{agent.age}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>{meta.label}</span>
                        </div>
                        <div className="text-xs text-slate-400">{agent.occupation}</div>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{roleLabel}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed italic mb-2">&ldquo;{agent.bio}&rdquo;</p>
                    {agent.interests?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agent.interests.map(i => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-arena-muted text-slate-400">{i}</span>)}
                      </div>
                    )}
                  </div>
                  <EditSection agent={agent} onSaved={updates => setAgent(prev => prev ? { ...prev, ...updates } : prev)} />
                </Section>

                {/* Password */}
                <Section title="Account">
                  <PasswordSection />
                </Section>

                {/* Relationships */}
                {rels.length > 0 && (
                  <Section title={`Connections (${rels.length})`}>
                    <div className="bg-arena-card border border-arena-border rounded-xl px-4 py-1">
                      {rels.sort((a, b) => b.happiness_score - a.happiness_score).map(r => (
                        <RelRow key={r.id} rel={r} agentId={agent.id} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Apply to show */}
                <Section title="The Show">
                  <ApplySection agent={agent} />
                </Section>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
