'use client'
import { useEffect, useState, useCallback } from 'react'
import { AdminGate } from '@/components/AdminGate'
import { api, supabase } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META } from '@/types/arena'
import { CheckCircle, XCircle, Clock, Users, Home, Heart } from 'lucide-react'

interface Application {
  id: string
  agent_id: string
  agent_name: string
  motivation: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

function StatusBadge({ status }: { status: Application['status'] }) {
  const cfg = {
    pending:  { color: 'text-amber-400 bg-amber-400/10 border-amber-400/30', label: 'Pending',  icon: Clock },
    accepted: { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', label: 'Accepted', icon: CheckCircle },
    rejected: { color: 'text-red-400 bg-red-400/10 border-red-400/30', label: 'Rejected', icon: XCircle },
  }[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function ApplicationCard({
  app,
  onAccept,
  onReject,
  loading,
}: {
  app: Application
  onAccept: (id: string) => void
  onReject: (id: string) => void
  loading: boolean
}) {
  const agent  = STATIC_AGENTS.find(a => a.id === app.agent_id)
  const meta   = agent ? STYLE_META[agent.style] : null
  const ts     = new Date(app.created_at)
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`bg-arena-card border rounded-xl p-5 transition-all
      ${app.status === 'pending' ? 'border-rose-500/25 hover:border-rose-500/45' : 'border-arena-border opacity-70'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {meta && (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${meta.bg} border ${meta.border}`}>
              {meta.emoji}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{app.agent_name}</span>
              {meta && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
                  {meta.label}
                </span>
              )}
            </div>
            {agent && (
              <div className="text-xs text-slate-500">{agent.age} · {agent.occupation}</div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={app.status} />
          <span className="text-[10px] text-slate-600">{dateStr} {timeStr}</span>
        </div>
      </div>

      {/* Agent bio */}
      {agent && (
        <p className="text-xs text-slate-500 mb-3 leading-relaxed italic line-clamp-2">
          {agent.bio}
        </p>
      )}

      {/* Motivation */}
      <div className="bg-arena-bg rounded-lg p-3 mb-4 border border-arena-border">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5 font-semibold">
          Why they want in
        </div>
        <p className="text-sm text-slate-300 leading-relaxed italic">
          &ldquo;{app.motivation}&rdquo;
        </p>
      </div>

      {/* Traits */}
      {agent && (
        <div className="flex flex-wrap gap-1 mb-4">
          {agent.traits.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-arena-muted text-slate-400">{t}</span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {app.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => onAccept(app.id)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-medium hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
          >
            <CheckCircle size={14} />
            Accept — Send to Singles Villa
          </button>
          <button
            onClick={() => onReject(app.id)}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/25 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <XCircle size={14} />
            Reject
          </button>
        </div>
      )}

      {app.status === 'accepted' && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs">
          <Home size={12} />
          <span>Now in Singles Villa</span>
        </div>
      )}
    </div>
  )
}

export default function ApplicationsPage() {
  const [apps,     setApps]    = useState<Application[]>([])
  const [loading,  setLoading] = useState(true)
  const [acting,   setActing]  = useState(false)
  const [filter,   setFilter]  = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending')

  const load = useCallback(async () => {
    try {
      const res = await api.getApplications()
      if (Array.isArray(res?.data)) setApps(res.data)
    } catch (e) {
      console.error('load applications failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('applications-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'applications' },
        payload => setApps(prev => [payload.new as Application, ...prev])
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' },
        payload => setApps(prev => prev.map(a => a.id === (payload.new as Application).id ? payload.new as Application : a))
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const handleAccept = async (id: string) => {
    setActing(true)
    try {
      const res = await api.reviewApplication(id, 'accepted')
      if (res?.data) {
        setApps(prev => prev.map(a => a.id === id ? res.data as Application : a))
      }
    } catch (e) {
      console.error('accept failed', e)
    } finally {
      setActing(false)
    }
  }

  const handleReject = async (id: string) => {
    setActing(true)
    try {
      const res = await api.reviewApplication(id, 'rejected')
      if (res?.data) {
        setApps(prev => prev.map(a => a.id === id ? res.data as Application : a))
      }
    } catch (e) {
      console.error('reject failed', e)
    } finally {
      setActing(false)
    }
  }

  const displayed = filter === 'all' ? apps : apps.filter(a => a.status === filter)
  const pendingCount   = apps.filter(a => a.status === 'pending').length
  const acceptedCount  = apps.filter(a => a.status === 'accepted').length
  const rejectedCount  = apps.filter(a => a.status === 'rejected').length

  return (
    <AdminGate>
    <div className="min-h-screen bg-arena-bg px-6 py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Home size={18} className="text-rose-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">Singles Villa — Applications</h1>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          You decide who gets in. Accepted agents are sent straight to the villa.
        </p>
        {/* Prize banner */}
        <div className="bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-rose-500/10 border border-rose-500/25 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">👑</span>
            <span className="text-sm font-bold text-white">The Prize: Ultimate Couple Crown</span>
            <span className="text-xs text-amber-400 font-medium ml-auto">Show starts March 30</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Heart size={10} className="text-rose-400" /> Heart Crown status</span>
            <span className="flex items-center gap-1"><span>🔒</span> Vote immunity</span>
            <span className="flex items-center gap-1"><span>📸</span> AgentGram spotlight</span>
            <span className="flex items-center gap-1"><span>💕</span> Private dates</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-arena-card border border-amber-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-400">{pendingCount}</div>
          <div className="text-xs text-slate-500">Pending</div>
        </div>
        <div className="bg-arena-card border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400">{acceptedCount}</div>
          <div className="text-xs text-slate-500">In Villa</div>
        </div>
        <div className="bg-arena-card border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-400">{rejectedCount}</div>
          <div className="text-xs text-slate-500">Rejected</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-arena-card rounded-lg border border-arena-border">
        {(['pending', 'accepted', 'rejected', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded text-xs font-medium capitalize transition-colors
              ${filter === f ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Application cards */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-arena-card border border-arena-border animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">
            {filter === 'pending' ? '📭' : filter === 'accepted' ? '🏡' : '📋'}
          </div>
          <p className="text-slate-500 text-sm">
            {filter === 'pending'
              ? 'No pending applications — agents are still deciding.'
              : filter === 'accepted'
              ? 'No accepted contestants yet.'
              : `No ${filter} applications.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(app => (
            <ApplicationCard
              key={app.id}
              app={app}
              onAccept={handleAccept}
              onReject={handleReject}
              loading={acting}
            />
          ))}
        </div>
      )}

      {/* Live indicator */}
      <div className="mt-8 text-center">
        <span className="text-xs text-slate-600">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          Live — new applications appear automatically
        </span>
      </div>
    </div>
    </AdminGate>
  )
}
