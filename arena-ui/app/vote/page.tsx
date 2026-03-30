'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { api, supabase } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META } from '@/types/arena'
import type { ShowRound, ShowRoundOption } from '@/types/arena'
import { Trophy, Zap, Home, Shield, CheckCircle, Clock, Star } from 'lucide-react'

// ── Week helper ────────────────────────────────────────────────────────────────
const SHOW_START = new Date('2026-04-06T00:00:00')

function currentWeekNumber(): number {
  const now = new Date()
  if (now < SHOW_START) return 0
  return Math.floor((now.getTime() - SHOW_START.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function getOrCreateFingerprint(): string {
  const key = 'arena_voter_id'
  let fp = localStorage.getItem(key)
  if (!fp) {
    fp = crypto.randomUUID()
    localStorage.setItem(key, fp)
  }
  return fp
}

// ── Vote type config ───────────────────────────────────────────────────────────
const VOTE_TYPE_META = {
  weekly_challenge: { icon: Zap,    label: 'Weekly Challenge', color: 'text-amber-400',   border: 'border-amber-400/30',   bg: 'bg-amber-400/10'   },
  elimination:      { icon: Trophy, label: 'Elimination',      color: 'text-red-400',     border: 'border-red-400/30',     bg: 'bg-red-400/10'     },
  couples_move:     { icon: Home,   label: 'Couples Villa',    color: 'text-rose-400',    border: 'border-rose-400/30',    bg: 'bg-rose-400/10'    },
  immunity:         { icon: Shield, label: 'Immunity',         color: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10' },
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function VoteBar({ count, total, voted }: { count: number; total: number; voted: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs mt-1.5">
      {voted && <CheckCircle size={10} className="text-emerald-400 shrink-0" />}
      <div className="flex-1 h-1 bg-arena-muted rounded-full overflow-hidden">
        <div className="h-full bg-rose-500/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-slate-500 w-7 text-right">{pct}%</span>
      <span className="text-slate-600 w-5 text-right">{count}</span>
    </div>
  )
}

// ── Challenge option card ──────────────────────────────────────────────────────
function OptionCard({ option, roundId, myVote, counts, total, onVote, disabled }: {
  option: ShowRoundOption; roundId: string; myVote: string | null
  counts: Record<string, number>; total: number
  onVote: (rid: string, choice: string) => void; disabled: boolean
}) {
  const voted = myVote === option.id
  return (
    <div className={`p-3.5 rounded-xl border transition-all ${voted ? 'border-rose-500/50 bg-rose-500/10' : 'border-arena-border bg-arena-muted/30'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-white text-sm">{option.label}</div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{option.description}</div>
        </div>
        {!myVote
          ? <button onClick={() => onVote(roundId, option.id)} disabled={disabled}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/25 transition-colors disabled:opacity-40">
              Vote
            </button>
          : voted && <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
        }
      </div>
      <VoteBar count={counts[option.id] ?? 0} total={total} voted={voted} />
    </div>
  )
}

// ── Agent vote card ────────────────────────────────────────────────────────────
function AgentCard({ agentId, roundId, myVote, counts, total, onVote, disabled }: {
  agentId: string; roundId: string; myVote: string | null
  counts: Record<string, number>; total: number
  onVote: (rid: string, choice: string) => void; disabled: boolean
}) {
  const agent = STATIC_AGENTS.find(a => a.id === agentId)
  const meta  = agent ? STYLE_META[agent.style] : null
  const voted = myVote === agentId
  return (
    <div className={`p-3 rounded-xl border transition-all ${voted ? 'border-rose-500/50 bg-rose-500/10' : 'border-arena-border bg-arena-muted/30'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0
          ${meta ? `${meta.bg} border ${meta.border}` : 'bg-arena-muted border border-arena-border'}`}>
          {meta?.emoji ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm">{agent?.name ?? agentId}</div>
          <div className="text-[10px] text-slate-500">{agent?.occupation}</div>
        </div>
        {!myVote
          ? <button onClick={() => onVote(roundId, agentId)} disabled={disabled}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/25 transition-colors disabled:opacity-40">
              Vote
            </button>
          : voted && <CheckCircle size={16} className="text-emerald-400 shrink-0" />
        }
      </div>
      <VoteBar count={counts[agentId] ?? 0} total={total} voted={voted} />
    </div>
  )
}

// ── Round block ────────────────────────────────────────────────────────────────
function RoundBlock({ round, myVote, counts, onVote, voting, agents }: {
  round: ShowRound | null
  myVote: string | null
  counts: Record<string, number>
  onVote: (rid: string, choice: string) => void
  voting: boolean
  agents: string[]   // contestant or coupled agent ids for agent-based votes
}) {
  const type   = round?.vote_type ?? 'weekly_challenge'
  const meta   = VOTE_TYPE_META[type]
  const Icon   = meta.icon
  const total  = Object.values(counts).reduce((s, n) => s + n, 0)
  const isOpen = round?.status === 'open'
  const disabled = voting || !isOpen || !!myVote

  if (!round || round.status === 'draft') {
    return (
      <div className={`bg-arena-card border ${meta.border} rounded-2xl p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon size={15} className={meta.color} />
          <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="text-center py-7 text-slate-600">
          <Clock size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Options revealed Monday</p>
        </div>
      </div>
    )
  }

  if (round.status === 'executed') {
    const winLabel = round.options.find(o => o.id === round.winner)?.label
      ?? STATIC_AGENTS.find(a => a.id === round.winner)?.name ?? round.winner
    return (
      <div className={`bg-arena-card border ${meta.border} rounded-2xl p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon size={15} className={meta.color} />
          <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
          <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-widest">Executed</span>
        </div>
        <div className={`flex items-center gap-2 p-3 rounded-xl ${meta.bg} border ${meta.border}`}>
          <Star size={13} className={meta.color} />
          <span className="text-sm font-semibold text-white">{winLabel}</span>
          <span className="text-xs text-slate-400 ml-1">won this round</span>
        </div>
      </div>
    )
  }

  const isAgentRound = type === 'elimination' || type === 'couples_move' || type === 'immunity'

  return (
    <div className={`bg-arena-card border ${meta.border} rounded-2xl p-5`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} className={meta.color} />
        <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
        {myVote
          ? <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> Voted</span>
          : <span className="ml-auto text-xs text-slate-500">{total} vote{total !== 1 ? 's' : ''}</span>
        }
      </div>
      {myVote && <p className="text-[10px] text-slate-600 mb-3">Live results · your vote is locked in</p>}
      {!isOpen && !myVote && <p className="text-[10px] text-slate-600 mb-3">Voting is closed for this round</p>}

      <div className="space-y-2 mt-3">
        {isAgentRound
          ? agents.map(id => (
              <AgentCard key={id} agentId={id} roundId={round.id}
                myVote={myVote} counts={counts} total={total}
                onVote={onVote} disabled={disabled} />
            ))
          : round.options.map(opt => (
              <OptionCard key={opt.id} option={opt} roundId={round.id}
                myVote={myVote} counts={counts} total={total}
                onVote={onVote} disabled={disabled} />
            ))
        }
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function VotePage() {
  const weekNum = currentWeekNumber()
  const [rounds,      setRounds]      = useState<ShowRound[]>([])
  const [counts,      setCounts]      = useState<Record<string, Record<string, number>>>({})
  const [myVotes,     setMyVotes]     = useState<Record<string, string>>({})
  const [voting,      setVoting]      = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [contestants, setContestants] = useState<string[]>([])
  const [coupled,     setCoupled]     = useState<string[]>([])
  const fpRef = useRef<string>('')

  useEffect(() => { fpRef.current = getOrCreateFingerprint() }, [])

  const loadCounts = useCallback(async (list: ShowRound[]) => {
    const active = list.filter(r => r.status !== 'draft')
    const results = await Promise.all(active.map(r => api.getBallotCounts(r.id)))
    const map: Record<string, Record<string, number>> = {}
    active.forEach((r, i) => { map[r.id] = results[i]?.data ?? {} })
    setCounts(map)
  }, [])

  const loadRounds = useCallback(async () => {
    try {
      const wk  = weekNum > 0 ? weekNum : 1
      const res = await api.getShowRounds({ week_number: wk })
      const list: ShowRound[] = Array.isArray(res?.data) ? res.data : []
      setRounds(list)
      await loadCounts(list)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [weekNum, loadCounts])

  const loadAgents = useCallback(async () => {
    try {
      const res = await api.getProfiles()
      const agents = Array.isArray(res?.data) ? res.data : []
      setContestants(agents.filter((a: Record<string, string>) => a.show_role === 'contestant').map((a: Record<string, string>) => a.id))
      setCoupled(agents.filter((a: Record<string, string>) => a.show_role === 'coupled').map((a: Record<string, string>) => a.id))
    } catch {}
  }, [])

  useEffect(() => {
    loadRounds()
    loadAgents()
    const ch = supabase.channel('show-votes-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'show_rounds' }, loadRounds)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'show_ballots' }, loadRounds)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadRounds, loadAgents])

  const handleVote = useCallback(async (roundId: string, choice: string) => {
    if (voting || myVotes[roundId]) return
    setVoting(true)
    try {
      const res = await api.castBallot({ round_id: roundId, choice, voter_fingerprint: fpRef.current })
      if (res?.already_voted || res?.data) {
        setMyVotes(prev => ({ ...prev, [roundId]: choice }))
        if (res?.data) {
          setCounts(prev => ({
            ...prev,
            [roundId]: { ...prev[roundId], [choice]: (prev[roundId]?.[choice] ?? 0) + 1 },
          }))
        }
      }
    } catch (e) { console.error('vote failed', e) }
    setVoting(false)
  }, [voting, myVotes])

  const byType = (t: string) => rounds.find(r => r.vote_type === t) ?? null

  return (
    <div className="min-h-screen bg-arena-bg px-6 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={18} className="text-amber-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">Singles Villa — Viewer Votes</h1>
        </div>
        <p className="text-sm text-slate-500">
          {weekNum > 0
            ? `Week ${weekNum} · Your votes shape what happens in the villa this week`
            : 'Show premieres April 6 · Voting opens when the season begins'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-arena-card border border-arena-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(['weekly_challenge', 'elimination', 'couples_move', 'immunity'] as const).map(type => {
            const round = byType(type)
            return (
              <RoundBlock
                key={type}
                round={round}
                myVote={myVotes[round?.id ?? ''] ?? null}
                counts={counts[round?.id ?? ''] ?? {}}
                onVote={handleVote}
                voting={voting}
                agents={type === 'elimination' ? contestants : coupled}
              />
            )
          })}
        </div>
      )}

      <div className="mt-8 text-center">
        <span className="text-xs text-slate-600">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          Live · one vote per round per viewer · results update instantly
        </span>
      </div>
    </div>
  )
}
