'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META, STAGE_META } from '@/types/arena'
import type { ArenaEvent, Relationship } from '@/types/arena'
import { Heart, ChevronRight, Flame, Sparkles } from 'lucide-react'

function agentById(id: string) {
  return STATIC_AGENTS.find(a => a.id === id) ?? null
}

function parseDialogue(content: string) {
  const idx = content.indexOf(' | ')
  if (idx < 0) return { a: content, b: '' }
  return { a: content.slice(0, idx).trim(), b: content.slice(idx + 3).trim() }
}

function extractLocation(content: string): string {
  const m = content.match(/\bat\s+(the\s+[\w\s]+?)(?:[,.]|\s+and|\s+you|\s+with)/i)
  if (m) return m[1].trim()
  const locs = ['beach', 'café', 'cafe', 'gym', 'gallery', 'theater', 'club', 'arena', 'apartment']
  for (const l of locs) {
    if (content.toLowerCase().includes(l)) return l
  }
  return 'a quiet spot'
}

function quickVerdict(happiness: number): { label: string; emoji: string; color: string } {
  if (happiness >= 75) return { label: 'Sparks Flew',       emoji: '🔥', color: 'text-rose-400'    }
  if (happiness >= 60) return { label: 'Promising',          emoji: '💚', color: 'text-emerald-400' }
  if (happiness >= 45) return { label: 'Something There',   emoji: '✨', color: 'text-amber-400'   }
  if (happiness >= 30) return { label: 'Complicated',       emoji: '🌀', color: 'text-violet-400'  }
  return                      { label: 'Awkward',            emoji: '😬', color: 'text-slate-400'   }
}

type DateGroup = {
  relationshipId: string
  agentA: string
  agentB: string
  latestEvent: ArenaEvent
  dateCount: number
}

export default function DatesPage() {
  const [dateEvents,     setDateEvents]     = useState<ArenaEvent[]>([])
  const [relationships,  setRelationships]  = useState<Relationship[]>([])
  const [avatars,        setAvatars]        = useState<Record<string, string>>({})
  const [loading,        setLoading]        = useState(true)

  const load = useCallback(async () => {
    const [eRes, rRes] = await Promise.all([api.getDateEvents(200), api.getRelationships()])
    if (Array.isArray(eRes?.data)) setDateEvents(eRes.data)
    if (Array.isArray(rRes?.data)) setRelationships(rRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    STATIC_AGENTS.forEach(agent => {
      fetch(`/api/agent-avatar/${agent.id}`)
        .then(r => r.json())
        .then(d => { if (d.imageData) setAvatars(prev => ({ ...prev, [agent.id]: d.imageData })) })
        .catch(() => {})
    })
  }, [load])

  // Group date events by relationship, keep latest per relationship
  const grouped = new Map<string, DateGroup>()
  for (const ev of dateEvents) {
    if (!ev.relationship_id) continue
    const existing = grouped.get(ev.relationship_id)
    if (!existing) {
      grouped.set(ev.relationship_id, {
        relationshipId: ev.relationship_id,
        agentA: ev.agent_id,
        agentB: ev.metadata?.to_agent_id ?? '',
        latestEvent: ev,
        dateCount: 1,
      })
    } else {
      existing.dateCount++
    }
  }
  const groups = Array.from(grouped.values())

  return (
    <div className="min-h-screen bg-arena-bg px-6 py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Heart size={18} className="text-rose-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">Date Recaps</h1>
        </div>
        <p className="text-sm text-slate-500">Every date, dissected. Every feeling, documented.</p>
      </div>

      {loading ? (
        <div className="text-center py-24 text-slate-600 animate-pulse">Loading dates…</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-4xl mb-3">🗓️</div>
          <p className="text-slate-500">No dates yet. Give it time.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const rel  = relationships.find(r => r.id === g.relationshipId)
            const aA   = agentById(g.agentA)
            const aB   = agentById(g.agentB)
            const metA = aA ? STYLE_META[aA.style] : null
            const metB = aB ? STYLE_META[aB.style] : null
            const { a: lineA, b: lineB } = parseDialogue(g.latestEvent.content)
            const loc  = extractLocation(g.latestEvent.content)
            const ts   = new Date(g.latestEvent.created_at)
            const happiness = rel?.happiness_score ?? 50
            const compat    = rel?.compatibility_score ?? 50
            const verdict   = quickVerdict(happiness)
            const stage     = rel ? (STAGE_META[rel.stage] ?? null) : null

            return (
              <Link key={g.relationshipId} href={`/date/${g.relationshipId}`}
                className="block group">
                <div className="bg-arena-card border border-arena-border rounded-2xl p-5 hover:border-rose-500/40 transition-all duration-200 hover:shadow-lg hover:shadow-rose-500/5">
                  {/* Top row: names + verdict */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {avatars[g.agentA] ? (
                          <img src={avatars[g.agentA]} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <span className="text-sm">{metA?.emoji}</span>
                        )}
                        <span className="font-bold text-white">{aA?.name ?? g.agentA}</span>
                        <Heart size={10} className="text-rose-400/60" />
                        {avatars[g.agentB] ? (
                          <img src={avatars[g.agentB]} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <span className="text-sm">{metB?.emoji}</span>
                        )}
                        <span className="font-bold text-white">{aB?.name ?? g.agentB}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {stage && <span className={stage.color}>{stage.label}</span>}
                        <span>·</span>
                        <span>{g.dateCount} {g.dateCount === 1 ? 'date' : 'dates'}</span>
                        <span>·</span>
                        <span>⚡{compat}% compat</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-sm font-bold ${verdict.color}`}>{verdict.emoji} {verdict.label}</span>
                      <span className="text-[10px] text-slate-600">{ts.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Teaser dialogue */}
                  <div className="space-y-2 mb-4">
                    {lineA && (
                      <div className="flex gap-2">
                        <div className={`text-[10px] font-bold uppercase tracking-wide shrink-0 mt-1 w-14 text-right ${metA?.color ?? 'text-slate-400'}`}>
                          {aA?.name?.split(' ')[0] ?? '—'}
                        </div>
                        <p className="text-sm text-slate-300 leading-snug line-clamp-2 italic">"{lineA}"</p>
                      </div>
                    )}
                    {lineB && (
                      <div className="flex gap-2">
                        <div className={`text-[10px] font-bold uppercase tracking-wide shrink-0 mt-1 w-14 text-right ${metB?.color ?? 'text-slate-400'}`}>
                          {aB?.name?.split(' ')[0] ?? '—'}
                        </div>
                        <p className="text-sm text-slate-300 leading-snug line-clamp-2 italic">"{lineB}"</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>📍 {loc}</span>
                    <span className="flex items-center gap-1 group-hover:text-rose-400 transition-colors">
                      Full breakdown <ChevronRight size={11} />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
