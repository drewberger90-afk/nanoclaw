'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, api } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META, STAGE_META, EVENT_META } from '@/types/arena'
import type { Relationship, ArenaEvent, Agent } from '@/types/arena'
import { ArrowLeft, Heart, MessageCircle, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import PhotoGallery from '@/components/PhotoGallery'
import type { AgentPhoto } from '@/types/photos'

// ── Style descriptions ─────────────────────────────────────────────────────────
const STYLE_DESC: Record<string, string> = {
  anxious:      'Loves deeply and feels everything at full volume. Silence reads as rejection; warmth is oxygen. Reaches out first, then spirals about it.',
  avoidant:     'Cares more than they show. Gets close, then needs to disappear. Shows love through logistics — not words.',
  secure:       'Knows what they want and says it clearly. Comfortable with intimacy and distance. Doesn\'t need games to feel safe.',
  disorganized: 'Craves closeness and fears it equally. Runs hot and cold with no warning. When they\'re here, they\'re completely here.',
}

// ── Happiness bar ──────────────────────────────────────────────────────────────
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

// ── Relationship card ──────────────────────────────────────────────────────────
function RelCard({ rel, agentId, isSelected, onSelect }: {
  rel: Relationship; agentId: string; isSelected: boolean; onSelect: () => void
}) {
  const otherId   = rel.agent_a_id === agentId ? rel.agent_b_id : rel.agent_a_id
  const otherName = rel.agent_a_id === agentId ? rel.agent_b_name : rel.agent_a_name
  const other     = STATIC_AGENTS.find(a => a.id === otherId)
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
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer group
        ${isSelected
          ? 'bg-arena-muted ring-1 ring-indigo-500/40'
          : 'bg-arena-muted/50 hover:bg-arena-muted'}`}
    >
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0
        ${otherMeta ? `${otherMeta.bg} border ${otherMeta.border}` : 'bg-arena-card border border-arena-border'}`}>
        {otherMeta?.emoji ?? '?'}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{otherName}</span>
          <span className={`text-xs font-medium ${stageMeta.color}`}>{stageMeta.label}</span>
          {trend}
        </div>
        <HappinessBar score={rel.happiness_score} size="sm" />
      </div>
      {/* Score */}
      <span className="text-sm font-bold text-slate-300 shrink-0">{rel.happiness_score}</span>
    </div>
  )
}

// Milestone events — filtered out of the chat thread, only shown in Recent Events
const MILESTONE_TYPES = new Set(['proposal', 'marriage', 'divorce', 'rejection', 'ghost', 'make_up', 'no_contact_test', 'fight', 'rekindling'])

// ── Chat message bubble ────────────────────────────────────────────────────────
function MessageBubble({ event, agentId, showTime }: { event: ArenaEvent; agentId: string; showTime: boolean }) {
  const isFrom    = event.agent_id === agentId
  const otherId   = isFrom ? event.metadata?.to_agent_id : event.agent_id
  const other     = STATIC_AGENTS.find(a => a.id === otherId)
  const otherMeta = other ? STYLE_META[other.style] : null
  const myMeta    = STATIC_AGENTS.find(a => a.id === agentId)
  const myStyleM  = myMeta ? STYLE_META[myMeta.style] : null
  const ts        = new Date(event.created_at)
  const timeStr   = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-2 ${isFrom ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {/* Avatar */}
      {isFrom ? (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0
          ${myStyleM ? `${myStyleM.bg} border ${myStyleM.border}` : 'bg-arena-muted border border-arena-border'}`}>
          {myStyleM?.emoji ?? '?'}
        </div>
      ) : (
        <Link href={other ? `/profile/${other.id}` : '#'}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0
            ${otherMeta ? `${otherMeta.bg} border ${otherMeta.border}` : 'bg-arena-muted border border-arena-border'}`}>
            {otherMeta?.emoji ?? '👤'}
          </div>
        </Link>
      )}

      {/* Bubble + timestamp */}
      <div className={`flex flex-col gap-0.5 max-w-[75%] ${isFrom ? 'items-end' : 'items-start'}`}>
        <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed
          ${isFrom
            ? 'bg-indigo-500/20 border border-indigo-500/30 text-slate-200 rounded-br-sm'
            : 'bg-arena-card border border-arena-border text-slate-300 rounded-bl-sm'
          }`}>
          {event.content}
        </div>
        {showTime && (
          <span className="text-[9px] text-slate-600 px-1">{timeStr}</span>
        )}
      </div>
    </div>
  )
}

// ── Date separator ─────────────────────────────────────────────────────────────
function DateSeparator({ date }: { date: Date }) {
  const today     = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
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

// ── Stats strip ───────────────────────────────────────────────────────────────
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

// ── Thought bubble ─────────────────────────────────────────────────────────────
function ThoughtBubble({ event }: { event: ArenaEvent }) {
  const ts      = new Date(event.created_at)
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const question = event.metadata?.question

  return (
    <div className="flex flex-col gap-2">
      {/* Mediator question — shown as a received message if present */}
      {question && (
        <div className="flex gap-3 flex-row">
          <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600
            flex items-center justify-center text-sm shrink-0 mt-0.5 select-none">
            🎙
          </div>
          <div className="flex flex-col gap-0.5 max-w-[78%] items-start">
            <div className="text-[10px] text-slate-500">Host · {dateStr} {timeStr}</div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed
              bg-slate-700/60 border border-slate-600/50 text-slate-300 italic">
              {question}
            </div>
          </div>
        </div>
      )}

      {/* Agent response — right-aligned */}
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-7 h-7 rounded-full bg-indigo-900/40 border border-indigo-500/30
          flex items-center justify-center text-sm shrink-0 mt-0.5 select-none">
          💭
        </div>
        <div className="flex flex-col gap-0.5 max-w-[78%] items-end">
          {!question && (
            <div className="text-[10px] text-slate-500">{dateStr} {timeStr}</div>
          )}
          <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed
            bg-indigo-500/20 border border-indigo-500/30 text-slate-200">
            {event.content}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { agentId } = useParams<{ agentId: string }>()

  const agent = STATIC_AGENTS.find(a => a.id === agentId)
  const meta  = agent ? STYLE_META[agent.style] : null

  const [relationships,    setRelationships]    = useState<Relationship[]>([])
  const [events,           setEvents]           = useState<ArenaEvent[]>([])
  const [convEvents,       setConvEvents]       = useState<ArenaEvent[]>([])
  const [convLoading,      setConvLoading]      = useState(false)
  const [loading,          setLoading]          = useState(true)
  const [activeTab,        setActiveTab]        = useState<'conversations' | 'thoughts' | 'photos'>('conversations')
  const [photos,           setPhotos]           = useState<AgentPhoto[]>([])
  const [photosLoading,    setPhotosLoading]    = useState(false)
  const [avatarUrl,        setAvatarUrl]        = useState<string | null>(null)
  const [avatarFalUrl,     setAvatarFalUrl]     = useState<string | null>(null)
  const [selectedPartner,  setSelectedPartner]  = useState<string | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const loadPhotos = useCallback(async () => {
    if (photosLoading || photos.length > 0) return
    setPhotosLoading(true)
    // Optimistic: show loading skeletons immediately
    setPhotos([...Array(5)].map((_, i) => ({
      id: `loading-${i}`, agentId, contextTag: 'solo_reflection' as const,
      label: '', caption: '', timestamp: '', imageData: '', status: 'loading' as const,
    })))
    try {
      const qs  = avatarFalUrl ? `?referenceUrl=${encodeURIComponent(avatarFalUrl)}` : ''
      const res = await fetch(`/api/generate-photos/${agentId}${qs}`)
      const data = await res.json()
      if (Array.isArray(data?.photos)) setPhotos(data.photos)
      else setPhotos([])
    } catch {
      setPhotos([])
    } finally {
      setPhotosLoading(false)
    }
  }, [agentId, avatarFalUrl, photosLoading, photos.length])

  const loadData = useCallback(async () => {
    const [rRes, eRes] = await Promise.all([
      api.getRelationships(),
      api.getAgentEvents(agentId, 500),
    ])
    if (Array.isArray(rRes?.data))  setRelationships(rRes.data)
    if (Array.isArray(eRes?.data))  setEvents(eRes.data)
    setLoading(false)
  }, [agentId])

  const loadConversation = useCallback(async (partnerId: string) => {
    setConvLoading(true)
    try {
      const res = await api.getConversationEvents(agentId, partnerId, 300)
      if (Array.isArray(res?.data)) setConvEvents(res.data)
    } catch {
      setConvEvents([])
    } finally {
      setConvLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    // Load avatar portrait on mount — also store the fal CDN URL for face-consistent photo gen
    fetch(`/api/agent-avatar/${agentId}`)
      .then(r => r.json())
      .then(d => {
        if (d.imageData) setAvatarUrl(d.imageData)
        if (d.falUrl)    setAvatarFalUrl(d.falUrl)
      })
      .catch(() => {/* keep emoji fallback */})

    loadData()

    const ch = supabase
      .channel(`profile-${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' },
        payload => {
          const e = payload.new as ArenaEvent
          // Only add if this event involves the agent being viewed
          if (e.agent_id === agentId || e.metadata?.to_agent_id === agentId) {
            setEvents(prev => [e, ...prev.slice(0, 399)])
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' },
        () => api.getRelationships().then(r => { if (Array.isArray(r?.data)) setRelationships(r.data) })
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [agentId, loadData])

  // ── Derived data ────────────────────────────────────────────────────────────
  const myRels = relationships.filter(
    r => r.agent_a_id === agentId || r.agent_b_id === agentId
  )
  const activeRels = myRels.filter(r => !['strangers', 'broken_up', 'divorced'].includes(r.stage))
  const endedRels  = myRels.filter(r => ['broken_up', 'divorced'].includes(r.stage))

  // Auto-select the highest-happiness connection on first load
  useEffect(() => {
    if (selectedPartner === null && activeRels.length > 0) {
      const top = [...activeRels].sort((a, b) => b.happiness_score - a.happiness_score)[0]
      const partnerId = top.agent_a_id === agentId ? top.agent_b_id : top.agent_a_id
      setSelectedPartner(partnerId)
      loadConversation(partnerId)
    }
  }, [activeRels, agentId, selectedPartner, loadConversation])

  // Reload conversation when new realtime events arrive for the active pair
  useEffect(() => {
    if (selectedPartner) loadConversation(selectedPartner)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length])

  // Conversation feed — dedicated pair fetch, oldest first, no milestone events
  const myEvents = (selectedPartner ? convEvents : events.filter(e =>
    !MILESTONE_TYPES.has(e.event_type) &&
    ((e.agent_id === agentId && !!e.metadata?.to_agent_id) || e.metadata?.to_agent_id === agentId)
  ))
    .filter(e => !MILESTONE_TYPES.has(e.event_type))
    .slice(0, 200)
    .reverse() // DB returns newest-first; chat reads oldest-first

  // Auto-scroll to bottom when conversation or partner changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [myEvents.length, selectedPartner])

  // Personal Thoughts — only clean 'reflect' events from the updated runner
  const thoughtEvents = events.filter(e =>
    e.agent_id === agentId && e.event_type === 'reflect'
  )

  const avgHappiness = activeRels.length
    ? Math.round(activeRels.reduce((s, r) => s + r.happiness_score, 0) / activeRels.length)
    : 0

  const messageCount = events.filter(e => e.agent_id === agentId).length

  if (!agent || !meta) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <p className="text-slate-500">Agent not found: {agentId}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-arena-bg">
      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className={`w-full h-36 ${meta.bg} relative`}
        style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}>
        <div className={`absolute inset-0 ${meta.bg} opacity-60`} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-arena-bg/60" />
        {/* Back link lives inside the banner so the avatar never overlaps it */}
        <div className="absolute top-4 left-6 z-20">
          <Link href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-300/80 hover:text-white transition-colors">
            <ArrowLeft size={12} />
            Back to Overview
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {/* ── Profile header ─────────────────────────────────────────────────── */}
        <div className="flex items-end gap-4 -mt-8 mb-6">
          {/* Avatar */}
          <div className={`w-20 h-20 rounded-2xl shrink-0 border-2 ${meta.border} shadow-lg relative z-10 overflow-hidden
            ${!avatarUrl ? `${meta.bg} flex items-center justify-center text-4xl` : ''}`}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={agent.name} className="w-full h-full object-cover object-center" />
            ) : (
              <span>{meta.emoji}</span>
            )}
          </div>
          <div className="pb-1 flex-1 min-w-0 relative z-10">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-white tracking-tight">{agent.name}</h1>
              <span className="text-slate-500 text-sm">{agent.age} · {agent.occupation}</span>
            </div>
            <div className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold
              ${meta.bg} ${meta.color} border ${meta.border}`}>
              {meta.emoji} {meta.label} attachment
            </div>
          </div>
        </div>

        {/* ── Stats strip ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <StatPill icon={Heart}         label="Active Connections" value={activeRels.length}    color="text-rose-400" />
          <StatPill icon={TrendingUp}    label="Avg Happiness"      value={`${avgHappiness}%`}   color="text-emerald-400" />
          <StatPill icon={MessageCircle} label="Messages Sent"      value={messageCount}         color="text-sky-400" />
          <StatPill icon={Zap}           label="Ended Relationships" value={endedRels.length}    color="text-amber-400" />
        </div>

        {/* ── Two-column layout ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pb-16">

          {/* ── Left column: bio + style + traits + relationships ────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Bio card */}
            <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Bio</div>
              <p className="text-sm text-slate-300 leading-relaxed">{agent.bio}</p>
            </div>

            {/* Attachment style card */}
            <div className={`rounded-2xl p-4 border ${meta.border} ${meta.bg}`}>
              <div className={`text-[10px] uppercase tracking-widest mb-2 ${meta.color}`}>
                {meta.emoji} {meta.label} Attachment
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{STYLE_DESC[agent.style]}</p>
            </div>

            {/* Traits */}
            <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Traits</div>
              <div className="flex flex-wrap gap-2">
                {agent.traits.map(t => (
                  <span key={t} className={`text-xs px-2.5 py-1 rounded-full font-medium
                    ${meta.bg} ${meta.color} border ${meta.border}`}>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Active relationships */}
            {loading ? (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-xl bg-arena-muted animate-pulse" />
                  ))}
                </div>
              </div>
            ) : activeRels.length > 0 ? (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
                  Connections ({activeRels.length})
                </div>
                <div className="space-y-2">
                  {activeRels
                    .sort((a, b) => b.happiness_score - a.happiness_score)
                    .map(rel => {
                      const otherId = rel.agent_a_id === agentId ? rel.agent_b_id : rel.agent_a_id
                      return (
                        <RelCard
                          key={rel.id} rel={rel} agentId={agentId}
                          isSelected={selectedPartner === otherId}
                          onSelect={() => { setSelectedPartner(otherId); loadConversation(otherId) }}
                        />
                      )
                    })}
                </div>
              </div>
            ) : (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <p className="text-xs text-slate-600 italic text-center py-3">No active connections yet</p>
              </div>
            )}

            {/* Ended relationships */}
            {endedRels.length > 0 && (
              <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
                  History ({endedRels.length})
                </div>
                <div className="space-y-2">
                  {endedRels.map(rel => {
                    const otherId = rel.agent_a_id === agentId ? rel.agent_b_id : rel.agent_a_id
                    return (
                      <RelCard
                        key={rel.id} rel={rel} agentId={agentId}
                        isSelected={selectedPartner === otherId}
                        onSelect={() => { setSelectedPartner(otherId); loadConversation(otherId) }}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: tab switcher + content ─────────────────────────── */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-arena-card border border-arena-border rounded-2xl p-4">
              {/* Tab header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1 bg-arena-muted rounded-xl p-1">
                  <button
                    onClick={() => setActiveTab('conversations')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${activeTab === 'conversations'
                        ? 'bg-arena-card text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Conversations
                  </button>
                  <button
                    onClick={() => setActiveTab('thoughts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${activeTab === 'thoughts'
                        ? 'bg-arena-card text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Personal Thoughts
                  </button>
                  <button
                    onClick={() => { setActiveTab('photos'); loadPhotos() }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${activeTab === 'photos'
                        ? 'bg-arena-card text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Photos
                  </button>
                </div>
                {activeTab === 'conversations' && (() => {
                  const partner = selectedPartner ? STATIC_AGENTS.find(a => a.id === selectedPartner) : null
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

              {/* Conversations tab */}
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
                      const prevDate = prev ? new Date(prev.created_at) : null
                      const showDate = !prevDate || currDate.toDateString() !== prevDate.toDateString()
                      // Show timestamp only after a gap of 5+ minutes or at end of a run from same sender
                      const next = myEvents[i + 1]
                      const showTime = !next ||
                        next.agent_id !== e.agent_id ||
                        new Date(next.created_at).getTime() - currDate.getTime() > 5 * 60 * 1000
                      return (
                        <div key={e.id}>
                          {showDate && <DateSeparator date={currDate} />}
                          <MessageBubble event={e} agentId={agentId} showTime={showTime} />
                        </div>
                      )
                    })}
                    <div ref={chatBottomRef} />
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-600">
                    <div className="text-3xl mb-2">{meta.emoji}</div>
                    <p className="text-sm">No messages yet — {agent.name} hasn't spoken up</p>
                  </div>
                )
              )}

              {/* Personal Thoughts tab */}
              {activeTab === 'thoughts' && (
                loading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex flex-col gap-2">
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-arena-muted animate-pulse shrink-0" />
                          <div className="h-10 rounded-xl bg-arena-muted animate-pulse flex-1" />
                        </div>
                        <div className="flex gap-3 flex-row-reverse">
                          <div className="w-7 h-7 rounded-full bg-arena-muted animate-pulse shrink-0" />
                          <div className="h-14 rounded-xl bg-arena-muted animate-pulse w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : thoughtEvents.length > 0 ? (
                  <div className="space-y-5 max-h-[700px] overflow-y-auto pr-1">
                    {thoughtEvents.slice(0, 60).map(e => (
                      <ThoughtBubble key={e.id} event={e} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-600">
                    <div className="text-3xl mb-2">💭</div>
                    <p className="text-sm">{agent.name} hasn't had a quiet moment yet</p>
                  </div>
                )
              )}

              {/* Photos tab */}
              {activeTab === 'photos' && (
                <PhotoGallery photos={photos} loading={photosLoading} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
