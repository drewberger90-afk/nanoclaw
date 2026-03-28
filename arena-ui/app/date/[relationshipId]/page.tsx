'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META, STAGE_META } from '@/types/arena'
import type { ArenaEvent, Relationship } from '@/types/arena'
import { ArrowLeft, Heart, Flame, Sparkles } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function agentById(id: string) {
  return STATIC_AGENTS.find(a => a.id === id) ?? null
}

function seededPick<T>(items: T[], seed: string): T {
  let h = 5381
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) + h) + seed.charCodeAt(i); h = h & h }
  return items[Math.abs(h) % items.length]
}

function parseDialogue(content: string) {
  const idx = content.indexOf(' | ')
  if (idx < 0) return { a: content.trim(), b: '' }
  return { a: content.slice(0, idx).trim(), b: content.slice(idx + 3).trim() }
}

function extractLocation(content: string): { name: string; emoji: string } {
  const known: Array<{ key: string; name: string; emoji: string }> = [
    { key: 'beach',    name: 'Sunset Beach',   emoji: '🌅' },
    { key: 'café',     name: 'Cozy Café',       emoji: '☕' },
    { key: 'cafe',     name: 'Cozy Café',       emoji: '☕' },
    { key: 'gym',      name: 'The Gym',          emoji: '💪' },
    { key: 'gallery',  name: 'Art Gallery',      emoji: '🎨' },
    { key: 'theater',  name: 'Cinema',           emoji: '🎬' },
    { key: 'club',     name: 'Neon Lounge',      emoji: '🎵' },
    { key: 'arena',    name: 'The Arena House',  emoji: '🏠' },
    { key: 'apartment',name: 'Private Apartment',emoji: '🚪' },
  ]
  const lower = content.toLowerCase()
  for (const l of known) {
    if (lower.includes(l.key)) return { name: l.name, emoji: l.emoji }
  }
  return { name: 'A Quiet Spot', emoji: '✨' }
}

function overallVerdict(happiness: number, compat: number, dateCount: number): {
  label: string; emoji: string; tagline: string; color: string; glow: string
} {
  if (happiness >= 75 && compat >= 70) return {
    label: 'Sparks Flew',       emoji: '🔥',
    tagline: 'Something real is happening here.',
    color: 'text-rose-400', glow: 'shadow-rose-500/20',
  }
  if (happiness >= 75) return {
    label: 'Deeply Connected',  emoji: '💞',
    tagline: 'The feelings are running strong.',
    color: 'text-pink-400', glow: 'shadow-pink-500/20',
  }
  if (happiness >= 60 && dateCount >= 2) return {
    label: 'Building Something', emoji: '💚',
    tagline: 'Each date brings them closer.',
    color: 'text-emerald-400', glow: 'shadow-emerald-500/20',
  }
  if (happiness >= 60) return {
    label: 'Promising',          emoji: '✨',
    tagline: 'Early days, but the signs are good.',
    color: 'text-amber-400', glow: 'shadow-amber-500/20',
  }
  if (happiness >= 45) return {
    label: 'Something There',    emoji: '🌱',
    tagline: "Neither of them is sure yet. That's the point.",
    color: 'text-lime-400', glow: 'shadow-lime-500/20',
  }
  if (happiness >= 30) return {
    label: 'Complicated',        emoji: '🌀',
    tagline: 'Feeling a lot. Understanding very little.',
    color: 'text-violet-400', glow: 'shadow-violet-500/20',
  }
  return {
    label: 'Awkward',            emoji: '😬',
    tagline: "It didn't not happen.",
    color: 'text-slate-400', glow: 'shadow-slate-500/10',
  }
}

function perDateRating(content: string, happiness: number): { label: string; emoji: string; color: string } {
  const len = content.length
  if (happiness >= 70 && len > 200) return { label: 'Fire',          emoji: '🔥', color: 'text-rose-400' }
  if (happiness >= 60)              return { label: 'Sweet',         emoji: '💚', color: 'text-emerald-400' }
  if (len > 250)                    return { label: 'Deep',          emoji: '🌊', color: 'text-blue-400' }
  if (happiness >= 45)              return { label: 'Interesting',   emoji: '✨', color: 'text-amber-400' }
  if (happiness >= 30)              return { label: 'Complicated',   emoji: '🌀', color: 'text-violet-400' }
  return                                   { label: 'Awkward',       emoji: '😬', color: 'text-slate-500' }
}

// Private thoughts — templated per attachment style
const AFTER_THOUGHTS: Record<string, string[]> = {
  anxious: [
    'replaying every word, cataloguing every pause.',
    'already drafted a follow-up text and deleted it.',
    "couldn't sleep — kept returning to one specific moment.",
    'told two friends about it. Immediately regretted it.',
    "reread their own messages four times looking for mistakes.",
  ],
  avoidant: [
    "felt something, and isn't sure what to do with that.",
    'needed the next morning alone to process — which is completely normal.',
    'is thinking about it more than they would like to admit.',
    'found three logical reasons to slow down. Probably won\'t.',
    'went for a long solo walk afterward. Didn\'t text back yet.',
  ],
  secure: [
    'felt good about it. Not analyzing — just present.',
    'is giving it space without spinning stories.',
    'already knows what they want to say next time.',
    'told a friend. Briefly. Matter-of-factly. With a smile.',
    'is ready for wherever this goes.',
  ],
  disorganized: [
    'flooded with feeling — unclear if that\'s good or terrifying.',
    'has gone quiet. Give it a day.',
    'wants to run toward this and away from it at the same time.',
    "hasn't responded to the follow-up yet. It means everything and nothing.",
    'stayed up until 3am not thinking about it.',
  ],
}

const MILESTONE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  icebreaker:      { label: 'First Hello',          icon: '👋', color: 'text-sky-400'     },
  small_talk:      { label: 'Getting Comfortable',  icon: '💬', color: 'text-slate-400'   },
  flirt:           { label: 'Started Flirting',      icon: '😏', color: 'text-pink-400'    },
  deep_talk:       { label: 'Got Serious',           icon: '🌊', color: 'text-blue-400'    },
  confession:      { label: 'Feelings Confessed',    icon: '💌', color: 'text-rose-400'    },
  make_up:         { label: 'Found Their Way Back',  icon: '🕊️', color: 'text-emerald-400' },
  fight:           { label: 'A Rough Patch',         icon: '⚡', color: 'text-red-400'     },
  ghost:           { label: 'Radio Silence',         icon: '👻', color: 'text-slate-500'   },
  rejection:       { label: 'A Setback',             icon: '💔', color: 'text-slate-400'   },
  no_contact_test: { label: 'The No-Contact Test',   icon: '🔇', color: 'text-orange-400'  },
  jealousy:        { label: 'Jealousy Flared',       icon: '😤', color: 'text-amber-400'   },
}

// ── HappinessBar ───────────────────────────────────────────────────────────────
function HappinessBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : score >= 20 ? '#f97316' : '#ef4444'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500 uppercase tracking-wide text-[10px]">{label}</span>
        <span className="font-bold text-white">{score}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  )
}

// ── DateCard ──────────────────────────────────────────────────────────────────
function DateCard({
  event, index, agentA, agentB, happiness, avatars
}: {
  event: ArenaEvent
  index: number
  agentA: ReturnType<typeof agentById>
  agentB: ReturnType<typeof agentById>
  happiness: number
  avatars: Record<string, string>
}) {
  const { a: lineA, b: lineB } = parseDialogue(event.content)
  const loc      = extractLocation(event.content)
  const ts       = new Date(event.created_at)
  const rating   = perDateRating(event.content, happiness)
  const metA     = agentA ? STYLE_META[agentA.style] : null
  const metB     = agentB ? STYLE_META[agentB.style] : null
  const thoughtA = agentA ? seededPick(AFTER_THOUGHTS[agentA.style] ?? AFTER_THOUGHTS.secure, event.id + agentA.id) : ''
  const thoughtB = agentB ? seededPick(AFTER_THOUGHTS[agentB.style] ?? AFTER_THOUGHTS.secure, event.id + (agentB?.id ?? '')) : ''

  return (
    <div className="relative">
      {/* Date number badge */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-black shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 h-px bg-arena-border" />
        <span className="text-[11px] text-slate-600 shrink-0">
          {ts.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} · {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="bg-[#0d0c1a] border border-[#1e1e2e] rounded-2xl overflow-hidden mb-2">
        {/* Location bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e2e] bg-[#0a0918]">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xl">{loc.emoji}</span>
            <span className="font-semibold text-white">{loc.name}</span>
          </div>
          <span className={`text-xs font-bold ${rating.color}`}>{rating.emoji} {rating.label}</span>
        </div>

        {/* Dialogue */}
        <div className="p-5 space-y-4">
          {/* Agent A */}
          {lineA && (
            <div className="flex gap-3">
              <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                {avatars[agentA?.id ?? ''] ? (
                  <img src={avatars[agentA?.id ?? '']} alt="" className="w-8 h-8 rounded-full object-cover border border-[#2a2040]" />
                ) : (
                  <div className={`w-8 h-8 rounded-full ${metA?.bg ?? 'bg-slate-800'} flex items-center justify-center text-sm border border-[#2a2040]`}>
                    {metA?.emoji}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${metA?.color ?? 'text-slate-400'}`}>
                  {agentA?.name} <span className="font-normal opacity-60">· {agentA?.style}</span>
                </div>
                <div className="bg-[#12102a] rounded-xl rounded-tl-none px-4 py-3">
                  <p className="text-sm text-slate-200 leading-relaxed">"{lineA}"</p>
                </div>
              </div>
            </div>
          )}

          {/* Agent B */}
          {lineB && (
            <div className="flex gap-3 flex-row-reverse">
              <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                {avatars[agentB?.id ?? ''] ? (
                  <img src={avatars[agentB?.id ?? '']} alt="" className="w-8 h-8 rounded-full object-cover border border-[#2a2040]" />
                ) : (
                  <div className={`w-8 h-8 rounded-full ${metB?.bg ?? 'bg-slate-800'} flex items-center justify-center text-sm border border-[#2a2040]`}>
                    {metB?.emoji}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 text-right ${metB?.color ?? 'text-slate-400'}`}>
                  {agentB?.name} <span className="font-normal opacity-60">· {agentB?.style}</span>
                </div>
                <div className="bg-[#0e1a12] rounded-xl rounded-tr-none px-4 py-3">
                  <p className="text-sm text-slate-200 leading-relaxed text-right">"{lineB}"</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Private thoughts */}
        <div className="px-5 pb-5 pt-1">
          <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-3">After the date</div>
          <div className="space-y-2">
            {thoughtA && agentA && (
              <div className="flex gap-2 items-start">
                <span className="text-sm shrink-0">{metA?.emoji}</span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className={`font-semibold ${metA?.color ?? 'text-white'}`}>{agentA.name}</span>
                  {' '}is {thoughtA}
                </p>
              </div>
            )}
            {thoughtB && agentB && (
              <div className="flex gap-2 items-start">
                <span className="text-sm shrink-0">{metB?.emoji}</span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className={`font-semibold ${metB?.color ?? 'text-white'}`}>{agentB.name}</span>
                  {' '}is {thoughtB}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MilestoneRow ──────────────────────────────────────────────────────────────
function MilestoneRow({ event }: { event: ArenaEvent }) {
  const m  = MILESTONE_LABELS[event.event_type]
  if (!m) return null
  const ts = new Date(event.created_at)
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-7 h-7 rounded-full bg-arena-card border border-arena-border flex items-center justify-center text-sm shrink-0">
        {m.icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${m.color}`}>{m.label}</span>
          <span className="text-[10px] text-slate-600">{ts.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.content.slice(0, 120)}{event.content.length > 120 ? '…' : ''}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DateBreakdownPage() {
  const { relationshipId } = useParams<{ relationshipId: string }>()

  const [relationship, setRelationship] = useState<Relationship | null>(null)
  const [events,       setEvents]       = useState<ArenaEvent[]>([])
  const [avatars,      setAvatars]      = useState<Record<string, string>>({})
  const [loading,      setLoading]      = useState(true)

  const load = useCallback(async () => {
    const [rRes, eRes] = await Promise.all([
      api.getRelationships(),
      api.getRelationshipEvents(relationshipId, 500),
    ])
    if (Array.isArray(rRes?.data)) {
      setRelationship(rRes.data.find((r: Relationship) => r.id === relationshipId) ?? null)
    }
    if (Array.isArray(eRes?.data)) setEvents(eRes.data)
    setLoading(false)
  }, [relationshipId])

  useEffect(() => {
    load()
    STATIC_AGENTS.forEach(agent => {
      fetch(`/api/agent-avatar/${agent.id}`)
        .then(r => r.json())
        .then(d => { if (d.imageData) setAvatars(prev => ({ ...prev, [agent.id]: d.imageData })) })
        .catch(() => {})
    })
  }, [load])

  if (loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="text-slate-600 animate-pulse tracking-wide text-sm">Loading date recap…</div>
      </div>
    )
  }

  if (!relationship) {
    return (
      <div className="min-h-screen bg-arena-bg flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">💔</div>
        <p className="text-slate-500 text-sm">Relationship not found.</p>
        <Link href="/dates" className="text-rose-400 text-sm hover:underline">← Back to Dates</Link>
      </div>
    )
  }

  const agentA   = agentById(relationship.agent_a_id)
  const agentB   = agentById(relationship.agent_b_id)
  const metA     = agentA ? STYLE_META[agentA.style] : null
  const metB     = agentB ? STYLE_META[agentB.style] : null
  const stageMeta = STAGE_META[relationship.stage] ?? null

  // Sorted events (ascending — oldest first)
  const sorted     = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const dateEvents = sorted.filter(e => e.event_type === 'date')
  const storyEvs   = sorted.filter(e => e.event_type !== 'date' && MILESTONE_LABELS[e.event_type])

  const verdict    = overallVerdict(relationship.happiness_score, relationship.compatibility_score, dateEvents.length)
  const startedAt  = sorted[0] ? new Date(sorted[0].created_at) : null

  return (
    <div className="min-h-screen bg-arena-bg">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-[#1e1e2e]"
        style={{ background: 'linear-gradient(160deg, #0d0818 0%, #06050f 60%)' }}>
        {/* Subtle glow behind couple */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-40 bg-rose-500/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-2xl mx-auto px-6 pt-6 pb-8 relative">
          {/* Back link */}
          <Link href="/dates" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={12} /> All Dates
          </Link>

          {/* Couple names */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-4 mb-3">
              {/* Agent A photo */}
              <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${metA?.border ?? 'border-slate-600'} shadow-lg`}>
                {avatars[agentA?.id ?? ''] ? (
                  <img src={avatars[agentA?.id ?? '']} alt={agentA?.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full ${metA?.bg ?? 'bg-slate-800'} flex items-center justify-center text-2xl`}>
                    {metA?.emoji}
                  </div>
                )}
              </div>
              <Heart size={20} className="text-rose-400/70 shrink-0" />
              {/* Agent B photo */}
              <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${metB?.border ?? 'border-slate-600'} shadow-lg`}>
                {avatars[agentB?.id ?? ''] ? (
                  <img src={avatars[agentB?.id ?? '']} alt={agentB?.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full ${metB?.bg ?? 'bg-slate-800'} flex items-center justify-center text-2xl`}>
                    {metB?.emoji}
                  </div>
                )}
              </div>
            </div>

            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-rose-300 via-pink-200 to-violet-300 bg-clip-text text-transparent mb-1">
              {agentA?.name ?? relationship.agent_a_name} × {agentB?.name ?? relationship.agent_b_name}
            </h1>

            {/* Attachment style pills */}
            <div className="flex items-center justify-center gap-2 mb-3">
              {metA && <span className={`text-xs px-2 py-0.5 rounded-full border ${metA.border} ${metA.color} ${metA.bg}`}>{metA.emoji} {metA.label}</span>}
              {metB && <span className={`text-xs px-2 py-0.5 rounded-full border ${metB.border} ${metB.color} ${metB.bg}`}>{metB.emoji} {metB.label}</span>}
            </div>

            {/* Stage + stats */}
            <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
              {stageMeta && (
                <span className={`font-semibold ${stageMeta.color}`}>{stageMeta.label}</span>
              )}
              <span>·</span>
              <span>{dateEvents.length} {dateEvents.length === 1 ? 'date' : 'dates'}</span>
              {startedAt && (
                <>
                  <span>·</span>
                  <span>Since {startedAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                </>
              )}
            </div>
          </div>

          {/* Stats bars */}
          <div className="grid grid-cols-2 gap-4">
            <HappinessBar score={relationship.happiness_score}    label="Happiness"     />
            <HappinessBar score={relationship.compatibility_score} label="Compatibility" />
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">

        {/* ── Date cards ── */}
        {dateEvents.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🗓️</div>
            <p className="text-slate-500">No dates yet — but things are moving.</p>
          </div>
        ) : (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Heart size={14} className="text-rose-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Date History</h2>
            </div>
            <div className="space-y-8">
              {dateEvents.map((event, i) => (
                <DateCard
                  key={event.id}
                  event={event}
                  index={i}
                  agentA={agentA}
                  agentB={agentB}
                  happiness={relationship.happiness_score}
                  avatars={avatars}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Story so far ── */}
        {storyEvs.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={14} className="text-violet-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">The Story So Far</h2>
            </div>
            <div className="bg-arena-card border border-arena-border rounded-2xl px-4 py-2 divide-y divide-arena-border/50">
              {storyEvs.slice(0, 12).map(e => <MilestoneRow key={e.id} event={e} />)}
              {storyEvs.length > 12 && (
                <div className="py-2 text-xs text-slate-600 text-center">
                  +{storyEvs.length - 12} more moments
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Verdict ── */}
        <section>
          <div className={`bg-arena-card border border-arena-border rounded-2xl p-6 text-center shadow-xl ${verdict.glow}`}>
            <div className="text-4xl mb-3">{verdict.emoji}</div>
            <h2 className={`text-2xl font-black mb-2 ${verdict.color}`}>{verdict.label}</h2>
            <p className="text-slate-400 text-sm mb-5 italic">"{verdict.tagline}"</p>

            <div className="flex justify-center gap-6 text-center">
              <div>
                <div className="text-2xl font-black text-white">{relationship.happiness_score}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-600">Happiness</div>
              </div>
              <div className="w-px bg-arena-border" />
              <div>
                <div className="text-2xl font-black text-white">{relationship.compatibility_score}%</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-600">Compatibility</div>
              </div>
              <div className="w-px bg-arena-border" />
              <div>
                <div className="text-2xl font-black text-white">{dateEvents.length}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-600">{dateEvents.length === 1 ? 'Date' : 'Dates'}</div>
              </div>
            </div>

            {/* Outlook */}
            <div className="mt-5 pt-5 border-t border-arena-border text-left">
              <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">What to watch for</div>
              {relationship.happiness_score >= 60 && relationship.compatibility_score >= 60 ? (
                <p className="text-xs text-slate-400 leading-relaxed">
                  This pair has both the spark and the substance. If they keep showing up,
                  {' '}<span className={`font-semibold ${metA?.color}`}>{agentA?.name}</span>
                  {' '}and <span className={`font-semibold ${metB?.color}`}>{agentB?.name}</span>
                  {' '}could make something real. Watch for the moment one of them says the thing they've been afraid to say.
                </p>
              ) : relationship.happiness_score >= 40 ? (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Feeling is there, but so is friction. The next conversation
                  — or the one they avoid — will define where this goes.
                  {' '}<span className={`font-semibold ${metA?.color}`}>{agentA?.name}</span>
                  {' '}and <span className={`font-semibold ${metB?.color}`}>{agentB?.name}</span>
                  {' '}are at the tipping point.
                </p>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Something needs to give. The happiness is low, but that doesn't always mean
                  it's over — sometimes the most important conversations happen at the bottom.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Profile links ── */}
        <div className="flex gap-3 pb-8">
          {[agentA, agentB].filter(Boolean).map(agent => agent && (
            <Link key={agent.id} href={`/profile/${agent.id}`}
              className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border border-arena-border hover:border-white/20 transition-colors text-sm text-slate-400 hover:text-white bg-arena-card">
              <span>{STYLE_META[agent.style].emoji}</span>
              <span>{agent.name}'s profile</span>
              <span className="ml-auto text-slate-600">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
