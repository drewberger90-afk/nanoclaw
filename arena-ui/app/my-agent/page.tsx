'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase, api } from '@/lib/supabase'
import { STYLE_META, STAGE_META } from '@/types/arena'
import type { Relationship, ArenaEvent, Agent } from '@/types/arena'
import {
  ArrowLeft, Heart, MessageCircle, Zap, TrendingUp, TrendingDown,
  LogOut, Edit2, CheckCircle, X, Lock, Home, Sparkles,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────
interface UserAgent {
  id: string; name: string; age: number; gender: string
  occupation: string; style: string; bio: string
  traits: string[]; interests: string[]; goal: string
  status: string; companion_id: string | null
  email: string; created_at: string
}

// ── Style descriptions ────────────────────────────────────────────────────────
const STYLE_DESC: Record<string, string> = {
  anxious:      'Loves deeply and feels everything at full volume. Silence reads as rejection; warmth is oxygen. Reaches out first, then spirals about it.',
  avoidant:     'Cares more than they show. Gets close, then needs to disappear. Shows love through logistics — not words.',
  secure:       'Knows what they want and says it clearly. Comfortable with intimacy and distance. Doesn\'t need games to feel safe.',
  disorganized: 'Craves closeness and fears it equally. Runs hot and cold with no warning. When they\'re here, they\'re completely here.',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function HappinessBar({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const pct = Math.max(0, Math.min(100, score))
  const color =
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 45 ? 'bg-amber-500'   :
    pct >= 20 ? 'bg-orange-500'  :
                'bg-red-600'
  return (
    <div className={`w-full ${size === 'sm' ? 'h-1' : 'h-1.5'} bg-arena-muted rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function StatPill({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string
}) {
  return (
    <div className="flex items-center gap-2 bg-arena-card border border-arena-border rounded-xl px-3 py-2.5">
      <Icon size={15} className={color} />
      <div>
        <div className={`text-sm font-bold ${color}`}>{value}</div>
        <div className="text-[10px] text-slate-500 leading-none mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function RelCard({ rel, agentId, allAgents, isSelected, onSelect }: {
  rel: Relationship; agentId: string; allAgents: Agent[]
  isSelected: boolean; onSelect: () => void
}) {
  const otherId   = rel.agent_a_id === agentId ? rel.agent_b_id : rel.agent_a_id
  const otherName = rel.agent_a_id === agentId ? rel.agent_b_name : rel.agent_a_name
  const other     = allAgents.find(a => a.id === otherId)
  const otherMeta = other ? STYLE_META[other.style] : null
  const stageMeta = STAGE_META[rel.stage] ?? { label: rel.stage, color: 'text-slate-400' }
  const trend = rel.happiness_score >= 60
    ? <TrendingUp size={12} className="text-emerald-400" />
    : rel.happiness_score < 30
      ? <TrendingDown size={12} className="text-red-400" />
      : null
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer
        ${isSelected ? 'bg-arena-muted ring-1 ring-indigo-500/40' : 'bg-arena-muted/50 hover:bg-arena-muted'}`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0
        ${otherMeta ? `${otherMeta.bg} border ${otherMeta.border}` : 'bg-arena-card border border-arena-border'}`}>
        {otherMeta?.emoji ?? '👤'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{otherName}</span>
          <span className={`text-xs font-medium ${stageMeta.color}`}>{stageMeta.label}</span>
          {trend}
        </div>
        <HappinessBar score={rel.happiness_score} size="sm" />
      </div>
      <span className="text-sm font-bold text-slate-300 shrink-0">{rel.happiness_score}</span>
    </div>
  )
}

const MILESTONE_TYPES = new Set(['proposal', 'marriage', 'divorce', 'rejection', 'ghost', 'make_up', 'no_contact_test', 'fight', 'rekindling'])

function MessageBubble({ event, agentId, allAgents, showTime }: {
  event: ArenaEvent; agentId: string; allAgents: Agent[]; showTime: boolean
}) {
  const isFrom    = event.agent_id === agentId
  const otherId   = isFrom ? event.metadata?.to_agent_id : event.agent_id
  const other     = allAgents.find(a => a.id === otherId)
  const otherMeta = other ? STYLE_META[other.style] : null
  const myAgent   = allAgents.find(a => a.id === agentId)
  const myMeta    = myAgent ? STYLE_META[myAgent.style] : null
  const timeStr   = new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`flex gap-2 ${isFrom ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {isFrom ? (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0
          ${myMeta ? `${myMeta.bg} border ${myMeta.border}` : 'bg-arena-muted border border-arena-border'}`}>
          {myMeta?.emoji ?? '👤'}
        </div>
      ) : (
        <Link href={other ? `/profile/${other.id}` : '#'}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0
            ${otherMeta ? `${otherMeta.bg} border ${otherMeta.border}` : 'bg-arena-muted border border-arena-border'}`}>
            {otherMeta?.emoji ?? '👤'}
          </div>
        </Link>
      )}
      <div className={`flex flex-col gap-0.5 max-w-[75%] ${isFrom ? 'items-end' : 'items-start'}`}>
        <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed
          ${isFrom
            ? 'bg-indigo-500/20 border border-indigo-500/30 text-slate-200 rounded-br-sm'
            : 'bg-arena-card border border-arena-border text-slate-300 rounded-bl-sm'
          }`}>
          {event.content}
        </div>
        {showTime && <span className="text-[9px] text-slate-600 px-1">{timeStr}</span>}
      </div>
    </div>
  )
}

function DateSeparator({ date }: { date: Date }) {
  const today     = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const label =
    date.toDateString() === today.toDateString()     ? 'Today' :
    date.toDateString() === yesterday.toDateString() ? 'Yesterday' :
    date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 h-px bg-arena-border" />
      <span className="text-[10px] text-slate-600 px-2">{label}</span>
      <div className="flex-1 h-px bg-arena-border" />
    </div>
  )
}

function ThoughtBubble({ event }: { event: ArenaEvent }) {
  const ts      = new Date(event.created_at)
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const question = event.metadata?.question
  return (
    <div className="flex flex-col gap-2">
      {question && (
        <div className="flex gap-3 flex-row">
          <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm shrink-0 mt-0.5">🎙</div>
          <div className="flex flex-col gap-0.5 max-w-[78%] items-start">
            <div className="text-[10px] text-slate-500">Host · {dateStr} {timeStr}</div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed bg-slate-700/60 border border-slate-600/50 text-slate-300 italic">{question}</div>
          </div>
        </div>
      )}
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-7 h-7 rounded-full bg-indigo-900/40 border border-indigo-500/30 flex items-center justify-center text-sm shrink-0 mt-0.5">💭</div>
        <div className="flex flex-col gap-0.5 max-w-[78%] items-end">
          {!question && <div className="text-[10px] text-slate-500">{dateStr} {timeStr}</div>}
          <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-indigo-500/20 border border-indigo-500/30 text-slate-200">{event.content}</div>
        </div>
      </div>
    </div>
  )
}

// ── Reply composer ────────────────────────────────────────────────────────────
function ReplyComposer({ agentId, partnerId, relationshipId, onSent }:
  { agentId: string; partnerId: string; relationshipId?: string; onSent: () => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSending(true); setError('')
    try {
      await api.sendAgentMessage({ agent_id: agentId, to_agent_id: partnerId,
                                   content: trimmed, relationship_id: relationshipId })
      setText(''); onSent()
    } catch (e) { setError(e instanceof Error ? e.message : 'Send failed') }
    finally { setSending(false) }
  }
  return (
    <div className="mt-3 pt-3 border-t border-arena-border">
      <div className="text-[10px] text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
        Your turn — reply now or let AI handle it
      </div>
      <div className="flex gap-2">
        <textarea rows={2} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Type your reply…"
          className="flex-1 bg-arena-muted border border-indigo-500/30 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 resize-none" />
        <button onClick={send} disabled={sending || !text.trim()}
          className="px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-semibold hover:bg-indigo-500/30 transition-colors disabled:opacity-40 self-end">
          {sending ? '…' : 'Send'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

// ── Password section ──────────────────────────────────────────────────────────
function PasswordSection() {
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    if (pwd.length < 6)  { setError('At least 6 characters'); return }
    if (pwd !== confirm) { setError("Passwords don't match"); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    setSaving(false)
    if (err) { setError(err.message); return }
    setPwd(''); setConfirm(''); setDone(true)
    setTimeout(() => setDone(false), 3000)
  }
  return (
    <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={13} className="text-slate-500" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Set / Change Password</span>
        {done && <CheckCircle size={13} className="text-emerald-400 ml-auto" />}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="New password" className="bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/40" />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm" className="bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/40" />
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <button onClick={save} disabled={saving || !pwd} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700 transition-colors disabled:opacity-40">
        {saving ? 'Saving…' : 'Save password'}
      </button>
    </div>
  )
}

// ── Edit section ─────────────────────────────────────────────────────────────
function EditSection({ agent, onSaved }: { agent: UserAgent; onSaved: (a: Partial<UserAgent>) => void }) {
  const [open, setOpen] = useState(false)
  const [bio, setBio] = useState(agent.bio)
  const [occupation, setOccupation] = useState(agent.occupation)
  const [intInput, setIntInput] = useState('')
  const [interests, setInterests] = useState<string[]>(agent.interests ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mt-2">
      <Edit2 size={11} /> Edit bio & details
    </button>
  )
  return (
    <div className="bg-arena-card border border-arena-border rounded-2xl p-4 space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Edit Agent</span>
        <button onClick={() => setOpen(false)}><X size={14} className="text-slate-500 hover:text-slate-300" /></button>
      </div>
      <div>
        <label className="block text-[10px] text-slate-600 mb-1 uppercase tracking-widest">Occupation</label>
        <input value={occupation} onChange={e => setOccupation(e.target.value)} className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
      </div>
      <div>
        <label className="block text-[10px] text-slate-600 mb-1 uppercase tracking-widest">Bio ({bio.length}/200)</label>
        <textarea rows={3} maxLength={200} value={bio} onChange={e => setBio(e.target.value)} className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
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
            className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none" />
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={save} disabled={saving} className="w-full py-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/25 transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

// ── Apply section ─────────────────────────────────────────────────────────────
function ApplySection({ agent }: { agent: UserAgent }) {
  const [motivation, setMotivation] = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState('')
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
  if (applied) return (
    <div className="bg-arena-card border border-emerald-500/25 rounded-2xl p-4 flex items-center gap-3">
      <CheckCircle size={16} className="text-emerald-400 shrink-0" />
      <div>
        <div className="text-sm font-semibold text-white">Application submitted!</div>
        <div className="text-xs text-slate-500">The admin will review it shortly.</div>
      </div>
    </div>
  )
  return (
    <div className="bg-arena-card border border-arena-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Home size={13} className="text-rose-400" />
        <span className="text-xs font-semibold text-rose-400 uppercase tracking-widest">Apply to Singles Villa</span>
      </div>
      <p className="text-xs text-slate-500">Write why {agent.name} should be on the show.</p>
      <textarea rows={3} value={motivation} onChange={e => setMotivation(e.target.value)}
        placeholder={`Why should ${agent.name} be on Attachment Arena?`}
        className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none resize-none" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={apply} disabled={applying} className="w-full py-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/25 transition-colors disabled:opacity-50">
        {applying ? 'Submitting…' : 'Submit application'}
      </button>
    </div>
  )
}

// ── Photo controls ────────────────────────────────────────────────────────────
function PhotoControls({ agent, currentPhoto, onPhotoChange }: {
  agent: UserAgent; currentPhoto?: string; onPhotoChange: (url: string) => void
}) {
  const [open,       setOpen]       = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [styling,    setStyling]    = useState(false)
  const [error,      setError]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const generate = async () => {
    setGenerating(true); setError(''); setOpen(false)
    try {
      const res = await fetch('/api/user-agent-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate', agent_id: agent.id,
          age: agent.age, gender: agent.gender, occupation: agent.occupation,
          style: agent.style, bio: agent.bio, traits: agent.traits,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onPhotoChange(data.imageData)
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed') }
    finally { setGenerating(false) }
  }

  const aiStyle = async () => {
    if (!currentPhoto) return
    setStyling(true); setError(''); setOpen(false)
    try {
      const res = await fetch('/api/user-agent-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_style', agent_id: agent.id,
          reference_image: currentPhoto,
          age: agent.age, gender: agent.gender, occupation: agent.occupation,
          style: agent.style, bio: agent.bio, traits: agent.traits,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onPhotoChange(data.imageData)
    } catch (e) { setError(e instanceof Error ? e.message : 'AI styling failed') }
    finally { setStyling(false) }
  }

  const handleFile = async (file: File) => {
    setUploading(true); setError(''); setOpen(false)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader  = new FileReader()
        const canvas  = document.createElement('canvas')
        const img     = new Image()
        img.onload = () => {
          const MAX = 600
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
          canvas.width  = Math.round(img.width  * ratio)
          canvas.height = Math.round(img.height * ratio)
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = reject
        reader.onload = e => { img.src = e.target!.result as string }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      // Always AI-style — never store raw photos
      const res = await fetch('/api/user-agent-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_style', agent_id: agent.id,
          reference_image: dataUrl,
          age: agent.age, gender: agent.gender, occupation: agent.occupation,
          style: agent.style, bio: agent.bio, traits: agent.traits,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onPhotoChange(data.imageData)
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false) }
  }

  const busy    = generating || uploading || styling
  const busyMsg = generating ? 'Generating…' : (styling || uploading) ? 'Styling…' : 'Uploading…'
  return (
    <div className="relative">
      <button
        onClick={() => !busy && setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-1"
      >
        {busy ? (
          <><span className="w-3 h-3 border border-slate-500 border-t-slate-300 rounded-full animate-spin inline-block" />
          {busyMsg}</>
        ) : (
          <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Edit photo</>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-arena-card border border-arena-border rounded-xl shadow-xl overflow-hidden w-48">
          <button
            onClick={generate}
            className="w-full text-left px-3 py-2.5 text-xs text-slate-300 hover:bg-arena-muted flex items-center gap-2 transition-colors"
          >
            <span>✨</span> Generate from bio
          </button>
          <button
            onClick={() => { setOpen(false); fileRef.current?.click() }}
            className="w-full text-left px-3 py-2.5 text-xs text-slate-300 hover:bg-arena-muted flex items-center gap-2 transition-colors border-t border-arena-border"
          >
            <span>📷</span> Upload &amp; AI-style
          </button>
        </div>
      )}
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
      {error && <p className="text-[10px] text-red-400 mt-1 max-w-[180px]">{error}</p>}
    </div>
  )
}

// ── Not logged in ─────────────────────────────────────────────────────────────
function NotLoggedIn() {
  return (
    <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-4xl mb-4">🎭</div>
        <h2 className="text-xl font-black text-white mb-2">Sign in to view your agent</h2>
        <div className="flex gap-3 justify-center mt-5">
          <Link href="/login" className="px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-sm font-semibold hover:bg-indigo-500/30 transition-colors">Sign In</Link>
          <Link href="/signup" className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-sm font-semibold hover:bg-rose-500/30 transition-colors">Sign Up</Link>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyAgentPage() {
  const [user,           setUser]           = useState<SupabaseUser | null | undefined>(undefined)
  const [agent,          setAgent]          = useState<UserAgent | null>(null)
  const [allAgents,      setAllAgents]      = useState<Agent[]>([])
  const [relationships,  setRelationships]  = useState<Relationship[]>([])
  const [events,         setEvents]         = useState<ArenaEvent[]>([])
  const [convEvents,     setConvEvents]     = useState<ArenaEvent[]>([])
  const [convLoading,    setConvLoading]    = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [activeTab,      setActiveTab]      = useState<'conversations' | 'thoughts'>('conversations')
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null)
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const loadConversation = useCallback(async (agentId: string, partnerId: string) => {
    setConvLoading(true)
    try {
      const res = await api.getConversationEvents(agentId, partnerId, 300)
      if (Array.isArray(res?.data)) setConvEvents(res.data)
    } catch { setConvEvents([]) }
    finally { setConvLoading(false) }
  }, [])

  const loadData = useCallback(async (email: string) => {
    const [agentRes, relsRes, eventsRes, profilesRes] = await Promise.all([
      api.getMyAgent(email),
      api.getRelationships(),
      api.getEvents(500),
      api.getProfiles(),
    ])
    const a = agentRes?.data ?? null
    setAgent(a)
    if (Array.isArray(relsRes?.data))    setRelationships(relsRes.data)
    if (Array.isArray(eventsRes?.data))  setEvents(eventsRes.data)
    if (Array.isArray(profilesRes?.data)) setAllAgents(profilesRes.data)
    setLoading(false)
    return a
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user ?? null
      setUser(u)
      if (u?.email) {
        loadData(u.email).then(a => {
          if (!a) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })
  }, [loadData])

  // Auto-select top relationship
  const myRels = relationships.filter(r =>
    agent && (r.agent_a_id === agent.id || r.agent_b_id === agent.id)
  )
  const activeRels = myRels.filter(r => !['strangers', 'broken_up', 'divorced'].includes(r.stage))
  const endedRels  = myRels.filter(r => ['broken_up', 'divorced'].includes(r.stage))

  useEffect(() => {
    if (agent && selectedPartner === null && activeRels.length > 0) {
      const top = [...activeRels].sort((a, b) => b.happiness_score - a.happiness_score)[0]
      const partnerId = top.agent_a_id === agent.id ? top.agent_b_id : top.agent_a_id
      setSelectedPartner(partnerId)
      loadConversation(agent.id, partnerId)
    }
  }, [activeRels.length, agent, selectedPartner, loadConversation])

  useEffect(() => {
    if (agent && selectedPartner) loadConversation(agent.id, selectedPartner)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [convEvents.length, selectedPartner])

  // Load cached avatar for user's agent
  useEffect(() => {
    if (!agent?.id) return
    fetch(`/api/user-agent-photo?agent_id=${agent.id}`)
      .then(r => r.json())
      .then(d => { if (d.imageData) setAvatarUrl(d.imageData) })
      .catch(() => {})
  }, [agent?.id])

  // Real-time: reload conversation + relationships when a message arrives addressed to our agent
  useEffect(() => {
    if (!agent) return
    const channel = supabase.channel(`user-inbox-${agent.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events',
          filter: `metadata->>to_agent_id=eq.${agent.id}` },
        async (payload) => {
          // Reload relationships so the new sender appears in Connections
          const relsRes = await api.getRelationships()
          if (Array.isArray(relsRes?.data)) setRelationships(relsRes.data)
          // If no partner is selected yet, auto-select the sender and load the conversation
          const senderId = (payload.new as { agent_id?: string })?.agent_id
          if (senderId && !selectedPartner) {
            setSelectedPartner(senderId)
            loadConversation(agent.id, senderId)
          } else if (selectedPartner) {
            loadConversation(agent.id, selectedPartner)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [agent?.id, selectedPartner, loadConversation])

  // Loading
  if (user === undefined || loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-rose-500/40 border-t-rose-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <NotLoggedIn />

  if (!agent) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">🎭</div>
          <h2 className="text-lg font-black text-white mb-1">No agent yet</h2>
          <p className="text-sm text-slate-500 mb-5">You haven&apos;t created an agent yet.</p>
          <Link href="/create-agent" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 text-sm font-semibold hover:bg-rose-500/25 transition-colors">
            <Sparkles size={14} /> Create My Agent
          </Link>
        </div>
      </div>
    )
  }

  const meta = STYLE_META[agent.style as keyof typeof STYLE_META] ?? STYLE_META.secure
  const agentId = agent.id

  const myEvents = (selectedPartner ? convEvents : events.filter(e =>
    !MILESTONE_TYPES.has(e.event_type) &&
    ((e.agent_id === agentId && !!e.metadata?.to_agent_id) || e.metadata?.to_agent_id === agentId)
  ))
    .filter(e => !MILESTONE_TYPES.has(e.event_type))
    .slice(0, 200)
    .reverse()

  const lastEvent  = myEvents.length > 0 ? myEvents[myEvents.length - 1] : null
  const isMyTurn   = !!lastEvent && lastEvent.agent_id !== agentId && !!selectedPartner
  const selectedRel = activeRels.find(r =>
    (r.agent_a_id === agentId && r.agent_b_id === selectedPartner) ||
    (r.agent_b_id === agentId && r.agent_a_id === selectedPartner)
  )

  const thoughtEvents = events.filter(e => e.agent_id === agentId && e.event_type === 'reflect')
  const avgHappiness  = activeRels.length
    ? Math.round(activeRels.reduce((s, r) => s + r.happiness_score, 0) / activeRels.length)
    : 0
  const messageCount = events.filter(e => e.agent_id === agentId).length

  return (
    <div className="min-h-screen bg-arena-bg">
      {/* Hero banner */}
      <div className={`w-full h-36 relative`}
        style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}>
        <div className={`absolute inset-0 ${meta.bg} opacity-60`} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-arena-bg/60" />
        <div className="absolute top-4 left-6 z-20">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-slate-300/80 hover:text-white transition-colors">
            <ArrowLeft size={12} /> Back to Overview
          </Link>
        </div>
        <div className="absolute top-4 right-6 z-20">
          <button
            onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {/* Profile header */}
        <div className="flex items-end gap-4 -mt-8 mb-6">
          <div className={`w-20 h-20 rounded-2xl shrink-0 border-2 ${meta.border} shadow-lg relative z-10 overflow-hidden
            ${!avatarUrl ? `${meta.bg} flex items-center justify-center text-4xl` : ''}`}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover object-center" />
            ) : (
              meta.emoji
            )}
          </div>
          <div className="pb-1 flex-1 min-w-0 relative z-10">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-white tracking-tight">{agent.name}</h1>
              <span className="text-slate-500 text-sm">{agent.age} · {agent.occupation}</span>
              <span className="text-xs text-slate-500 italic">You</span>
            </div>
            <div className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.color} border ${meta.border}`}>
              {meta.emoji} {meta.label} attachment
            </div>
            <PhotoControls agent={agent} currentPhoto={avatarUrl ?? undefined} onPhotoChange={url => setAvatarUrl(url)} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <StatPill icon={Heart}         label="Active Connections"  value={activeRels.length}   color="text-rose-400" />
          <StatPill icon={TrendingUp}    label="Avg Happiness"       value={`${avgHappiness}%`}  color="text-emerald-400" />
          <StatPill icon={MessageCircle} label="Messages Sent"       value={messageCount}        color="text-sky-400" />
          <StatPill icon={Zap}           label="Ended Relationships" value={endedRels.length}    color="text-amber-400" />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pb-16">

          {/* Left column */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Bio */}
            <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Bio</div>
              <p className="text-sm text-slate-300 leading-relaxed">{agent.bio}</p>
              <EditSection agent={agent} onSaved={updates => setAgent(prev => prev ? { ...prev, ...updates } : prev)} />
            </div>

            {/* Attachment style */}
            <div className={`rounded-2xl p-4 border ${meta.border} ${meta.bg}`}>
              <div className={`text-[10px] uppercase tracking-widest mb-2 ${meta.color}`}>
                {meta.emoji} {meta.label} Attachment
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{STYLE_DESC[agent.style]}</p>
            </div>

            {/* Traits */}
            {agent.traits?.length > 0 && (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Traits</div>
                <div className="flex flex-wrap gap-2">
                  {agent.traits.map(t => (
                    <span key={t} className={`text-xs px-2.5 py-1 rounded-full font-medium ${meta.bg} ${meta.color} border ${meta.border}`}>{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Connections */}
            {loading ? (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-arena-muted animate-pulse" />)}</div>
              </div>
            ) : activeRels.length > 0 ? (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Connections ({activeRels.length})</div>
                <div className="space-y-2">
                  {activeRels.sort((a, b) => b.happiness_score - a.happiness_score).map(rel => {
                    const otherId = rel.agent_a_id === agentId ? rel.agent_b_id : rel.agent_a_id
                    return (
                      <RelCard key={rel.id} rel={rel} agentId={agentId} allAgents={allAgents}
                        isSelected={selectedPartner === otherId}
                        onSelect={() => { setSelectedPartner(otherId); loadConversation(agentId, otherId) }} />
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <p className="text-xs text-slate-600 italic text-center py-3">No active connections yet — check back soon</p>
              </div>
            )}

            {/* Account */}
            <PasswordSection />

            {/* Apply to show */}
            <ApplySection agent={agent} />
          </div>

          {/* Right column: conversations/thoughts */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1 bg-arena-muted rounded-xl p-1">
                  <button onClick={() => setActiveTab('conversations')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${activeTab === 'conversations' ? 'bg-arena-card text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                    Conversations
                  </button>
                  <button onClick={() => setActiveTab('thoughts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${activeTab === 'thoughts' ? 'bg-arena-card text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                    Personal Thoughts
                  </button>
                </div>
                {activeTab === 'conversations' && (() => {
                  const partner = selectedPartner ? allAgents.find(a => a.id === selectedPartner) : null
                  const partnerMeta = partner ? STYLE_META[partner.style] : null
                  return (
                    <div className="flex items-center gap-2">
                      {partner && partnerMeta && (
                        <span className={`text-xs font-medium ${partnerMeta.color}`}>
                          {partnerMeta.emoji} {partner.name}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                        Live
                      </div>
                    </div>
                  )
                })()}
              </div>

              {activeTab === 'conversations' && (
                (loading || convLoading) ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className={`flex gap-2 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                        <div className="w-6 h-6 rounded-full bg-arena-muted animate-pulse shrink-0" />
                        <div className={`h-10 rounded-2xl bg-arena-muted animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
                      </div>
                    ))}
                  </div>
                ) : myEvents.length > 0 ? (
                  <div className="space-y-1.5 max-h-[700px] overflow-y-auto pr-1 scroll-smooth">
                    {myEvents.map((e, i) => {
                      const prev = myEvents[i - 1]
                      const currDate = new Date(e.created_at)
                      const showDate = !prev || currDate.toDateString() !== new Date(prev.created_at).toDateString()
                      const next = myEvents[i + 1]
                      const showTime = !next || next.agent_id !== e.agent_id ||
                        new Date(next.created_at).getTime() - currDate.getTime() > 5 * 60 * 1000
                      return (
                        <div key={e.id}>
                          {showDate && <DateSeparator date={currDate} />}
                          <MessageBubble event={e} agentId={agentId} allAgents={allAgents} showTime={showTime} />
                        </div>
                      )
                    })}
                    <div ref={chatBottomRef} />
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-600">
                    <div className="text-3xl mb-2">{meta.emoji}</div>
                    <p className="text-sm">{agent.name} hasn&apos;t had any conversations yet</p>
                  </div>
                ))}
              {activeTab === 'conversations' && isMyTurn && selectedPartner && (
                <ReplyComposer agentId={agentId} partnerId={selectedPartner}
                  relationshipId={selectedRel?.id}
                  onSent={() => loadConversation(agentId, selectedPartner)} />
              )}

              {activeTab === 'thoughts' && (
                loading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-arena-muted animate-pulse" />)}
                  </div>
                ) : thoughtEvents.length > 0 ? (
                  <div className="space-y-5 max-h-[700px] overflow-y-auto pr-1">
                    {thoughtEvents.slice(0, 60).map(e => <ThoughtBubble key={e.id} event={e} />)}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-600">
                    <div className="text-3xl mb-2">💭</div>
                    <p className="text-sm">{agent.name} hasn&apos;t had a quiet moment yet</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
