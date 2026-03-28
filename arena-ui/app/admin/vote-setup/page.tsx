'use client'
import { useEffect, useState, useCallback } from 'react'
import { AdminGate } from '@/components/AdminGate'
import { api } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META } from '@/types/arena'
import type { ShowRound, ShowRoundOption, ShowVoteType } from '@/types/arena'
import { Plus, Trash2, Send, CheckCircle, Zap, Trophy, Home, Shield, ChevronRight } from 'lucide-react'
import Link from 'next/link'

// ── Week helper ────────────────────────────────────────────────────────────────
const SHOW_START = new Date('2026-03-30T00:00:00')

function currentWeekNumber(): number {
  const now = new Date()
  if (now < SHOW_START) return 1
  return Math.floor((now.getTime() - SHOW_START.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function nextEliminationDate(weekNum: number): string {
  // Elimination every 2 weeks starting week 2
  const nextElimWeek = weekNum % 2 === 0 ? weekNum : weekNum + 1
  const d = new Date(SHOW_START.getTime() + (nextElimWeek - 1) * 7 * 24 * 60 * 60 * 1000)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Vote type config ───────────────────────────────────────────────────────────
const VOTE_META: Record<ShowVoteType, { icon: React.ElementType; label: string; color: string; border: string; bg: string; description: string }> = {
  weekly_challenge: { icon: Zap,    label: 'Weekly Challenge', color: 'text-amber-400',   border: 'border-amber-400/30',   bg: 'bg-amber-400/10',   description: 'Publish 3–4 challenge options for viewers to vote on' },
  elimination:      { icon: Trophy, label: 'Elimination',      color: 'text-red-400',     border: 'border-red-400/30',     bg: 'bg-red-400/10',     description: 'Viewers vote to eliminate a contestant every 2 weeks' },
  couples_move:     { icon: Home,   label: 'Couples Villa',    color: 'text-rose-400',    border: 'border-rose-400/30',    bg: 'bg-rose-400/10',    description: 'Move a couple from the singles villa to the couples villa' },
  immunity:         { icon: Shield, label: 'Immunity',         color: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', description: 'Grant a couple immunity from elimination this cycle' },
}

// ── Ballot tally bar ───────────────────────────────────────────────────────────
function TallyBar({ label, count, total, winner }: { label: string; count: number; total: number; winner?: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg ${winner ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-arena-muted/40'}`}>
      <div className="w-24 text-xs font-medium text-white truncate">{label}</div>
      <div className="flex-1 h-1.5 bg-arena-muted rounded-full overflow-hidden">
        <div className="h-full bg-rose-500/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
      <span className="text-xs text-slate-500 w-6 text-right">{count}</span>
      {winner && <CheckCircle size={13} className="text-emerald-400 shrink-0" />}
    </div>
  )
}

// ── Challenge option builder ───────────────────────────────────────────────────
function OptionBuilder({ options, onChange }: {
  options: Array<{ id: string; label: string; description: string }>
  onChange: (opts: Array<{ id: string; label: string; description: string }>) => void
}) {
  const add = () => {
    if (options.length >= 4) return
    onChange([...options, { id: crypto.randomUUID(), label: '', description: '' }])
  }
  const remove = (id: string) => onChange(options.filter(o => o.id !== id))
  const update = (id: string, field: 'label' | 'description', val: string) =>
    onChange(options.map(o => o.id === id ? { ...o, [field]: val } : o))

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={opt.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <input
              placeholder={`Option ${i + 1} label (e.g. "Jealousy Dare")`}
              value={opt.label}
              onChange={e => update(opt.id, 'label', e.target.value)}
              className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50"
            />
            <input
              placeholder="Short description shown to viewers"
              value={opt.description}
              onChange={e => update(opt.id, 'description', e.target.value)}
              className="w-full bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50"
            />
          </div>
          <button onClick={() => remove(opt.id)}
            className="mt-1.5 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {options.length < 4 && (
        <button onClick={add}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors mt-1">
          <Plus size={13} /> Add option
        </button>
      )}
    </div>
  )
}

// ── Round manager card ─────────────────────────────────────────────────────────
function RoundCard({
  type, round, counts, contestants, coupled, weekNum, onRefresh
}: {
  type: ShowVoteType
  round: ShowRound | null
  counts: Record<string, number>
  contestants: Array<{ id: string; name: string; show_role: string }>
  coupled: Array<{ id: string; name: string; show_role: string }>
  weekNum: number
  onRefresh: () => void
}) {
  const meta   = VOTE_META[type]
  const Icon   = meta.icon
  const total  = Object.values(counts).reduce((s, n) => s + n, 0)
  const isAgentRound = type === 'elimination' || type === 'couples_move' || type === 'immunity'

  const [options,   setOptions]   = useState<ShowRoundOption[]>([])
  const [saving,    setSaving]    = useState(false)
  const [executing, setExecuting] = useState(false)
  const [winner,    setWinner]    = useState<string>('')

  // Derive top choice from counts
  const topChoice = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  // Auto-set winner to top choice when counts loaded
  useEffect(() => {
    if (topChoice && !winner) setWinner(topChoice)
  }, [topChoice, winner])

  // Init options from existing round
  useEffect(() => {
    if (round?.options) setOptions(round.options)
  }, [round])

  const handlePublish = async () => {
    if (isAgentRound && !round) {
      // Agent-based rounds don't need custom options — just create with empty options
    } else if (!isAgentRound && options.filter(o => o.label.trim()).length < 2) {
      alert('Add at least 2 options before publishing')
      return
    }
    setSaving(true)
    try {
      const validOpts = isAgentRound ? [] : options.filter(o => o.label.trim())
      if (round) {
        await api.updateShowRound({ id: round.id, status: 'open', options: validOpts })
      } else {
        await api.createShowRound({ vote_type: type, week_number: weekNum, options: validOpts })
        // Immediately open it
        const res = await api.getShowRounds({ vote_type: type, week_number: weekNum })
        const newRound = Array.isArray(res?.data) ? res.data[0] : null
        if (newRound) await api.updateShowRound({ id: newRound.id, status: 'open' })
      }
      onRefresh()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleClose = async () => {
    if (!round) return
    setSaving(true)
    try { await api.updateShowRound({ id: round.id, status: 'closed' }); onRefresh() }
    catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleExecute = async () => {
    if (!round || !winner) { alert('Select a winner first'); return }
    if (!confirm(`Execute: ${type} → ${winner}? This will queue the action for the runner.`)) return
    setExecuting(true)
    try {
      await api.executeShowRound(round.id, winner)
      onRefresh()
    } catch (e) { console.error(e) }
    setExecuting(false)
  }

  const agentTargets = type === 'elimination' ? contestants : coupled

  return (
    <div className={`bg-arena-card border ${meta.border} rounded-2xl p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon size={16} className={meta.color} />
        <span className={`font-bold ${meta.color}`}>{meta.label}</span>
        {round && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider
            ${round.status === 'open'     ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
              round.status === 'closed'   ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
              round.status === 'executed' ? 'bg-slate-500/15 text-slate-400 border border-slate-500/30' :
              'bg-slate-700 text-slate-500'}`}>
            {round.status}
          </span>
        )}
        {!round && <span className="ml-auto text-[10px] text-slate-600">Not published</span>}
      </div>
      <p className="text-xs text-slate-500 -mt-2">{meta.description}</p>

      {/* Elimination biweekly info */}
      {type === 'elimination' && (
        <div className="text-xs text-slate-600">
          Biweekly · next elimination: <span className="text-slate-400">{nextEliminationDate(weekNum)}</span>
        </div>
      )}

      {/* Option builder — challenge only */}
      {!isAgentRound && (!round || round.status === 'draft') && (
        <OptionBuilder options={options} onChange={setOptions} />
      )}

      {/* Live tallies */}
      {round && round.status !== 'draft' && total > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">{total} total votes</div>
          {isAgentRound
            ? agentTargets
                .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
                .map(ag => (
                  <TallyBar key={ag.id} label={ag.name}
                    count={counts[ag.id] ?? 0} total={total}
                    winner={round.status !== 'open' && ag.id === topChoice} />
                ))
            : round.options
                .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
                .map(opt => (
                  <TallyBar key={opt.id} label={opt.label}
                    count={counts[opt.id] ?? 0} total={total}
                    winner={round.status !== 'open' && opt.id === topChoice} />
                ))
          }
        </div>
      )}

      {round && round.status !== 'draft' && total === 0 && (
        <p className="text-xs text-slate-600 italic">No votes yet</p>
      )}

      {/* Execute section */}
      {round && (round.status === 'open' || round.status === 'closed') && (
        <div className="border-t border-arena-border pt-4 space-y-2">
          <div className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Execute result</div>
          <div className="flex gap-2">
            <select
              value={winner}
              onChange={e => setWinner(e.target.value)}
              className="flex-1 bg-arena-muted border border-arena-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500/50"
            >
              <option value="">Select winner…</option>
              {isAgentRound
                ? agentTargets.map(ag => (
                    <option key={ag.id} value={ag.id}>{ag.name} ({counts[ag.id] ?? 0} votes)</option>
                  ))
                : round.options.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({counts[opt.id] ?? 0} votes)</option>
                  ))
              }
            </select>
            <button
              onClick={handleExecute} disabled={executing || !winner}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-sm font-medium hover:bg-rose-500/25 transition-colors disabled:opacity-40"
            >
              <Send size={13} />
              {executing ? 'Queuing…' : 'Execute'}
            </button>
          </div>
        </div>
      )}

      {round?.status === 'executed' && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle size={14} />
          Executed — runner is processing
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {(!round || round.status === 'draft') && (
          <button onClick={handlePublish} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50">
            <Send size={13} />
            {saving ? 'Publishing…' : 'Publish & Open Voting'}
          </button>
        )}
        {round?.status === 'open' && (
          <button onClick={handleClose} disabled={saving}
            className="px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/25 text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50">
            {saving ? 'Closing…' : 'Close Voting'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function VoteSetupPage() {
  const weekNum = currentWeekNumber()
  const [rounds,      setRounds]      = useState<ShowRound[]>([])
  const [counts,      setCounts]      = useState<Record<string, Record<string, number>>>({})
  const [contestants, setContestants] = useState<Array<{ id: string; name: string; show_role: string }>>([])
  const [coupled,     setCoupled]     = useState<Array<{ id: string; name: string; show_role: string }>>([])
  const [loading,     setLoading]     = useState(true)

  const loadCounts = useCallback(async (list: ShowRound[]) => {
    const active = list.filter(r => r.status !== 'draft')
    const results = await Promise.all(active.map(r => api.getBallotCounts(r.id)))
    const map: Record<string, Record<string, number>> = {}
    active.forEach((r, i) => { map[r.id] = results[i]?.data ?? {} })
    setCounts(map)
  }, [])

  const load = useCallback(async () => {
    try {
      const [roundRes, agentRes] = await Promise.all([
        api.getShowRounds({ week_number: weekNum }),
        api.getProfiles(),
      ])
      const list: ShowRound[] = Array.isArray(roundRes?.data) ? roundRes.data : []
      const agents = Array.isArray(agentRes?.data) ? agentRes.data : []
      setRounds(list)
      setContestants(agents.filter((a: Record<string, string>) => a.show_role === 'contestant'))
      setCoupled(agents.filter((a: Record<string, string>) => a.show_role === 'coupled'))
      await loadCounts(list)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [weekNum, loadCounts])

  useEffect(() => { load() }, [load])

  const byType = (t: ShowVoteType) => rounds.find(r => r.vote_type === t) ?? null

  return (
    <AdminGate>
    <div className="min-h-screen bg-arena-bg px-6 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Send size={18} className="text-rose-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">Vote Setup — Week {weekNum}</h1>
        </div>
        <p className="text-sm text-slate-500">
          Publish voting rounds, monitor ballots, and trigger execution.
        </p>
        <Link href="/vote" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-white mt-2 transition-colors">
          View public vote page <ChevronRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-arena-card border border-arena-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(['weekly_challenge', 'elimination', 'couples_move', 'immunity'] as const).map(type => (
            <RoundCard
              key={type}
              type={type}
              round={byType(type)}
              counts={counts[byType(type)?.id ?? ''] ?? {}}
              contestants={contestants}
              coupled={coupled}
              weekNum={weekNum}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
    </AdminGate>
  )
}
