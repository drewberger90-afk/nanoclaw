'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase, api } from '@/lib/supabase'
import { EVENT_META, STATIC_AGENTS, STYLE_META } from '@/types/arena'
import type { ArenaEvent } from '@/types/arena'
import { Filter } from 'lucide-react'

const ALL_TYPES = Object.keys(EVENT_META)

function agentById(id: string | undefined) {
  return id ? STATIC_AGENTS.find(a => a.id === id) ?? null : null
}

function EventCard({ event }: { event: ArenaEvent }) {
  const meta    = EVENT_META[event.event_type] ?? { label: event.event_type, icon: '💬', color: 'text-slate-400' }
  const ts      = new Date(event.created_at)
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const from   = agentById(event.agent_id)
  const to     = agentById(event.metadata?.to_agent_id)
  const fromMeta = from ? STYLE_META[from.style] : null
  const toMeta   = to   ? STYLE_META[to.style]   : null

  return (
    <div className="flex gap-4 animate-slide-up">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 bg-arena-card border border-arena-border">
          {meta.icon}
        </div>
        <div className="w-px flex-1 bg-arena-border mt-1" />
      </div>

      {/* Content */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="bg-arena-card border border-arena-border rounded-xl p-4">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold uppercase tracking-wide ${meta.color}`}>
                {meta.label}
              </span>
              {/* From agent */}
              {from ? (
                <span className={`text-xs font-semibold ${fromMeta?.color ?? 'text-slate-300'}`}>
                  {fromMeta?.emoji} {from.name}
                </span>
              ) : (
                <span className="text-xs text-slate-500">{event.agent_id}</span>
              )}
              {/* Arrow + to agent */}
              {to && (
                <>
                  <span className="text-slate-600 text-xs">→</span>
                  <span className={`text-xs font-semibold ${toMeta?.color ?? 'text-slate-300'}`}>
                    {toMeta?.emoji} {to.name}
                  </span>
                </>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-slate-600">{dateStr}</div>
              <div className="text-[10px] text-slate-500">{timeStr}</div>
            </div>
          </div>
          {/* Message body */}
          <p className="text-sm text-slate-300 leading-relaxed">{event.content}</p>
          {/* Date recap link */}
          {event.event_type === 'date' && event.relationship_id && (
            <div className="mt-3 pt-3 border-t border-arena-border/50">
              <Link href={`/date/${event.relationship_id}`}
                className="inline-flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors">
                💕 View date breakdown →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TimelinePage() {
  const [events,      setEvents]      = useState<ArenaEvent[]>([])
  const [filter,      setFilter]      = useState<string>('all')
  const [loading,     setLoading]     = useState(true)
  const [showFilter,  setShowFilter]  = useState(false)
  const [newCount,    setNewCount]    = useState(0)

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.getEvents(500)
      if (Array.isArray(res?.data)) setEvents(res.data)
    } catch (e) {
      console.error('loadEvents failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()

    const channel = supabase
      .channel('timeline-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' },
        payload => {
          setEvents(prev => [payload.new as ArenaEvent, ...prev])
          setNewCount(n => n + 1)
          setTimeout(() => setNewCount(n => Math.max(0, n - 1)), 5000)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadEvents])

  const displayed = filter === 'all'
    ? events
    : events.filter(e => e.event_type === filter)

  return (
    <div className="min-h-screen bg-arena-bg px-6 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Timeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {events.length} events · {newCount > 0 && <span className="text-emerald-400">{newCount} new</span>}
          </p>
        </div>
        <button
          onClick={() => setShowFilter(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors
            ${showFilter ? 'bg-white/10 border-white/20 text-white' : 'border-arena-border text-slate-400 hover:text-white hover:border-white/20'}`}
        >
          <Filter size={14} />
          {filter === 'all' ? 'All events' : (EVENT_META[filter]?.label ?? filter)}
        </button>
      </div>

      {/* Filter chips */}
      {showFilter && (
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-arena-card border border-arena-border rounded-xl animate-fade-in">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
              ${filter === 'all' ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            All
          </button>
          {ALL_TYPES.map(type => {
            const m = EVENT_META[type]
            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors
                  ${filter === type ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-arena-card border border-arena-border animate-pulse shrink-0" />
              <div className="flex-1 h-24 rounded-xl bg-arena-card border border-arena-border animate-pulse" />
            </div>
          ))}
        </div>
      ) : displayed.length > 0 ? (
        <div>
          {displayed.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      ) : (
        <div className="text-center py-20 text-slate-600">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">No {filter === 'all' ? '' : filter + ' '}events yet</p>
        </div>
      )}
    </div>
  )
}
