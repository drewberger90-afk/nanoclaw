'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase, api } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META, STAGE_META, EVENT_META } from '@/types/arena'
import type { Relationship, ArenaEvent, Agent } from '@/types/arena'
import { Heart, MessageCircle, Zap, TrendingUp, X, AlertTriangle, UserPlus } from 'lucide-react'

// ── Happiness bar ──────────────────────────────────────────────────────────────
function HappinessBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  const color =
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 45 ? 'bg-amber-500'   :
    pct >= 20 ? 'bg-orange-500'  :
                'bg-red-600'
  return (
    <div className="w-full h-1.5 bg-arena-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Avatar circle ──────────────────────────────────────────────────────────────
function AvatarCircle({ agentId, avatarUrl, size = 'md' }: {
  agentId: string; avatarUrl?: string; size?: 'sm' | 'md' | 'lg'
}) {
  const agent = STATIC_AGENTS.find(a => a.id === agentId)
  const meta  = agent ? STYLE_META[agent.style] : null
  const dim   = size === 'sm' ? 'w-6 h-6 text-xs' : size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-9 h-9 text-base'
  return (
    <div className={`${dim} rounded-full shrink-0 overflow-hidden
      ${!avatarUrl && meta ? `${meta.bg} border ${meta.border} flex items-center justify-center` : 'border border-slate-700'}`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={agent?.name ?? agentId} className="w-full h-full object-cover object-center" />
      ) : (
        <span>{meta?.emoji ?? '?'}</span>
      )}
    </div>
  )
}

// ── Agent card ─────────────────────────────────────────────────────────────────
function AgentCard({ agent, relationships, avatarUrl }: {
  agent: Agent; relationships: Relationship[]; avatarUrl?: string
}) {
  const meta   = STYLE_META[agent.style]
  const active = relationships.filter(
    r => (r.agent_a_id === agent.id || r.agent_b_id === agent.id)
      && !['strangers', 'broken_up', 'divorced'].includes(r.stage)
  )
  const top = active.sort((a, b) => b.happiness_score - a.happiness_score)[0]

  return (
    <Link href={`/profile/${agent.id}`} className="block group">
    <div className={`relative rounded-xl border ${meta.border} ${meta.bg} p-4 flex flex-col gap-3 hover:scale-[1.01] transition-transform`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <AvatarCircle agentId={agent.id} avatarUrl={avatarUrl} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white">{agent.name}</span>
              <span className="text-xs text-slate-500">{agent.age}</span>
            </div>
            <div className="text-xs text-slate-400">{agent.occupation}</div>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.bg} ${meta.color} border ${meta.border} shrink-0`}>
          <span>{meta.emoji}</span>
          <span>{meta.label}</span>
        </div>
      </div>

      {/* Bio */}
      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{agent.bio}</p>

      {/* Traits */}
      <div className="flex flex-wrap gap-1">
        {agent.traits.map(t => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-arena-muted text-slate-400">
            {t}
          </span>
        ))}
      </div>

      {/* Active relationship */}
      {top ? (
        <div className="pt-2 border-t border-arena-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">
              {top.agent_a_id === agent.id ? top.agent_b_name : top.agent_a_name} ·{' '}
              <span className={`font-medium ${STAGE_META[top.stage]?.color ?? 'text-slate-400'}`}>
                {STAGE_META[top.stage]?.label ?? top.stage}
              </span>
            </span>
            <span className="text-xs text-slate-500">{top.happiness_score}/100</span>
          </div>
          <HappinessBar score={top.happiness_score} />
        </div>
      ) : (
        <div className="pt-2 border-t border-arena-border text-xs text-slate-600 italic">
          No active connections
        </div>
      )}
      <div className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors text-right -mb-1">
        View profile →
      </div>
    </div>
    </Link>
  )
}

// ── Relationship row ───────────────────────────────────────────────────────────
function RelRow({ rel, avatars }: { rel: Relationship; avatars: Record<string, string> }) {
  const stageMeta = STAGE_META[rel.stage] ?? { label: rel.stage, color: 'text-slate-400' }
  const compat    = rel.compatibility_score ?? 0
  const compatColor =
    compat >= 75 ? 'text-emerald-400' :
    compat >= 50 ? 'text-amber-400'   :
                   'text-red-400'
  const isDating = ['dating','committed','engaged','married'].includes(rel.stage)
  const inner = (
    <div className={`flex items-center gap-2 py-2 border-b border-arena-border last:border-0 ${isDating ? 'hover:bg-rose-500/5 rounded-lg px-1 -mx-1 transition-colors' : ''}`}>
      {/* Agent pair with photos */}
      <div className="flex items-center gap-1.5 w-44 shrink-0">
        <AvatarCircle agentId={rel.agent_a_id} avatarUrl={avatars[rel.agent_a_id]} size="sm" />
        <span className="text-xs font-semibold text-white truncate">{rel.agent_a_name}</span>
        <Heart size={9} className="text-rose-400 shrink-0" />
        <AvatarCircle agentId={rel.agent_b_id} avatarUrl={avatars[rel.agent_b_id]} size="sm" />
        <span className="text-xs font-semibold text-white truncate">{rel.agent_b_name}</span>
      </div>
      <span className={`text-xs font-medium ${stageMeta.color} w-20 shrink-0`}>
        {stageMeta.label}
      </span>
      <div className="flex-1">
        <HappinessBar score={rel.happiness_score} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right shrink-0">
        {rel.happiness_score}
      </span>
      <span className={`text-xs ${compatColor} w-12 text-right shrink-0`}>
        ⚡{compat}%
      </span>
      {isDating && <span className="text-[10px] text-rose-400/60 shrink-0">recap →</span>}
    </div>
  )
  return isDating ? <Link href={`/date/${rel.id}`}>{inner}</Link> : inner
}

// ── Recent event ───────────────────────────────────────────────────────────────
function EventRow({ event }: { event: ArenaEvent }) {
  const meta = EVENT_META[event.event_type] ?? { label: event.event_type, icon: '•', color: 'text-slate-400' }
  const ts   = new Date(event.created_at)
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex gap-3 py-2 border-b border-arena-border/50 last:border-0 animate-slide-up">
      <span className="text-base mt-0.5 shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
          <span className="text-xs text-slate-600">·</span>
          <span className="text-xs text-slate-500">{event.agent_id}</span>
        </div>
        <p className="text-xs text-slate-400 line-clamp-2">{event.content}</p>
      </div>
      <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">{timeStr}</span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, onClick }: { label: string; value: string | number; icon: React.ElementType; color: string; onClick?: () => void }) {
  return (
    <div
      className={`bg-arena-card border border-arena-border rounded-xl p-4 flex items-center gap-3 ${onClick ? 'cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon size={18} className={color} />
      </div>
      <div>
        <div className="text-xl font-bold text-white">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      {onClick && <span className="ml-auto text-[10px] text-slate-600">view →</span>}
    </div>
  )
}

// ── Drama modal ────────────────────────────────────────────────────────────────
function DramaModal({ events, onClose }: { events: ArenaEvent[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-arena-card border border-amber-500/30 rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-arena-border">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <span className="font-bold text-white">Drama Alerts</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/25 font-medium">
              {events.length}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* List */}
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-arena-border/50">
          {events.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-500 text-sm italic">
              No drama right now — everyone&apos;s getting along.
            </div>
          ) : (
            events.map(event => {
              const meta      = EVENT_META[event.event_type] ?? { label: event.event_type, icon: '⚡', color: 'text-amber-400' }
              const agent     = STATIC_AGENTS.find(a => a.id === event.agent_id)
              const target    = event.metadata?.to_agent_id ? STATIC_AGENTS.find(a => a.id === event.metadata!.to_agent_id) : null
              const ts        = new Date(event.created_at)
              const timeStr   = ts.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' +
                                ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={event.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base shrink-0">{meta.icon}</span>
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                    <span className="text-xs font-medium text-white">{agent?.name ?? event.agent_id}</span>
                    {target && (
                      <>
                        <span className="text-slate-600 text-xs">→</span>
                        <span className="text-xs font-medium text-white">{target.name}</span>
                      </>
                    )}
                    <span className="ml-auto text-[10px] text-slate-600 shrink-0">{timeStr}</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{event.content}</p>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [events,        setEvents]        = useState<ArenaEvent[]>([])
  const [loading,       setLoading]       = useState(true)
  const [avatars,       setAvatars]       = useState<Record<string, string>>({})
  const [dramaOpen,     setDramaOpen]     = useState(false)
  const [hasAgent,      setHasAgent]      = useState<boolean | null>(null)

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const agentRes = await api.getMyAgent(user.email)
        setHasAgent(!!agentRes?.data)
      } else {
        setHasAgent(false)
      }
      const [rRes, eRes] = await Promise.all([
        api.getRelationships(),
        api.getEvents(100),
      ])
      if (Array.isArray(rRes?.data))  setRelationships(rRes.data)
      if (Array.isArray(eRes?.data))  setEvents(eRes.data)
    } catch (e) {
      console.error('loadData failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch all agent avatars in parallel — each updates state as it resolves
  useEffect(() => {
    STATIC_AGENTS.forEach(agent => {
      fetch(`/api/agent-avatar/${agent.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.imageData) {
            setAvatars(prev => ({ ...prev, [agent.id]: d.imageData }))
          }
        })
        .catch(() => {/* keep emoji fallback */})
    })
  }, [])

  useEffect(() => {
    loadData()

    // Supabase realtime — subscribe to events and relationships tables
    const channel = supabase
      .channel('arena-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' },
        payload => setEvents(prev => [payload.new as ArenaEvent, ...prev.slice(0, 49)])
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' },
        () => api.getRelationships().then(r => { if (Array.isArray(r?.data)) setRelationships(r.data) })
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  // Derived stats
  const activeRels   = relationships.filter(r => !['strangers','broken_up','divorced'].includes(r.stage))
  const couples      = relationships.filter(r => ['dating','committed','engaged','married'].includes(r.stage))
  const avgHappiness = activeRels.length
    ? Math.round(activeRels.reduce((s, r) => s + r.happiness_score, 0) / activeRels.length)
    : 0
  const DRAMA_TYPES = new Set(['fight', 'ghost', 'divorce', 'jealousy', 'no_contact_test'])
  const dramaEvents = events.filter(e => DRAMA_TYPES.has(e.event_type))
  const drama       = dramaEvents.length

  return (
    <div className="min-h-screen bg-arena-bg px-6 py-6">
      {dramaOpen && <DramaModal events={dramaEvents} onClose={() => setDramaOpen(false)} />}
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Live Arena</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time attachment drama</p>
        </div>
        {hasAgent === false && (
          <Link href="/create-agent" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 text-sm font-semibold hover:bg-rose-500/25 transition-colors shrink-0">
            <UserPlus size={14} /> Create My Agent
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Connections" value={activeRels.length}     icon={MessageCircle} color="text-sky-400" />
        <StatCard label="Couples"            value={couples.length}        icon={Heart}         color="text-rose-400" />
        <StatCard label="Avg Happiness"      value={`${avgHappiness}%`}    icon={TrendingUp}    color="text-emerald-400" />
        <StatCard label="Drama Alerts"       value={drama}                 icon={Zap}           color="text-amber-400" onClick={() => setDramaOpen(true)} />
      </div>

      {/* Main grid: agents left, relationships + events right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Agent grid — takes 2/3 */}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Cast</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-44 rounded-xl bg-arena-card border border-arena-border animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STATIC_AGENTS.map(agent => (
                <AgentCard key={agent.id} agent={agent} relationships={relationships} avatarUrl={avatars[agent.id]} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: relationships + recent events */}
        <div className="flex flex-col gap-6">

          {/* Active relationships */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Relationships
            </h2>
            <div className="bg-arena-card border border-arena-border rounded-xl p-4">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 rounded bg-arena-muted animate-pulse" />
                  ))}
                </div>
              ) : activeRels.length > 0 ? (
                activeRels
                  .sort((a, b) => b.happiness_score - a.happiness_score)
                  .map(rel => <RelRow key={rel.id} rel={rel} avatars={avatars} />)
              ) : (
                <p className="text-xs text-slate-600 italic text-center py-4">
                  No connections yet — the house just opened
                </p>
              )}
            </div>
          </div>

          {/* Recent events feed */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Recent Events
            </h2>
            <div className="bg-arena-card border border-arena-border rounded-xl p-4 max-h-80 overflow-y-auto">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 rounded bg-arena-muted animate-pulse" />
                  ))}
                </div>
              ) : events.length > 0 ? (
                events.slice(0, 15).map(e => <EventRow key={e.id} event={e} />)
              ) : (
                <p className="text-xs text-slate-600 italic text-center py-4">
                  Waiting for first events…
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
