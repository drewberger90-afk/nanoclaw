'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, supabase } from '@/lib/supabase'
import { STYLE_META } from '@/types/arena'
import { ArrowLeft, ArrowRight, CheckCircle, Sparkles, User, Heart, Zap, RefreshCw } from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────
type AttachmentStyle = 'anxious' | 'avoidant' | 'secure' | 'disorganized'
type Gender          = 'm' | 'f' | 'nb'
type Goal            = 'relationship' | 'casual' | 'friendship' | 'open'
type Step            = 'basics' | 'style' | 'quiz' | 'story' | 'goal' | 'creating' | 'done'

interface FormData {
  name:       string
  age:        string
  gender:     Gender | ''
  email:      string
  style:      AttachmentStyle | ''
  occupation: string
  bio:        string
  interests:  string[]
  goal:       Goal | ''
}

// ── Quiz ────────────────────────────────────────────────────────────────────
const QUIZ: Array<{ q: string; answers: Array<{ text: string; style: AttachmentStyle }> }> = [
  {
    q: 'When you start falling for someone, you feel…',
    answers: [
      { text: 'Excited but convinced they probably don\'t feel the same', style: 'anxious' },
      { text: 'Interested, but you\'re in no rush to get too close',        style: 'avoidant' },
      { text: 'Genuinely happy and open to wherever this goes',             style: 'secure' },
      { text: 'Every feeling at once — completely overwhelmed',             style: 'disorganized' },
    ],
  },
  {
    q: 'After a really good first date, you…',
    answers: [
      { text: 'Text them right away to say how much fun you had',       style: 'anxious' },
      { text: 'Wait a few days — you don\'t want to seem too eager',    style: 'avoidant' },
      { text: 'Send a relaxed message that same evening',               style: 'secure' },
      { text: 'Write three different texts and don\'t send any',        style: 'disorganized' },
    ],
  },
  {
    q: 'They haven\'t replied in 4 hours. You…',
    answers: [
      { text: 'Check if they\'ve been online and draft a follow-up',    style: 'anxious' },
      { text: 'Assume they\'re busy and get back to your own life',     style: 'avoidant' },
      { text: 'Assume they\'re busy and check back later, no stress',   style: 'secure' },
      { text: 'Cycle between "they hate me" and "it\'s fine" hourly',   style: 'disorganized' },
    ],
  },
  {
    q: 'When a relationship starts getting serious, your instinct is to…',
    answers: [
      { text: 'Ask lots of questions to make sure you\'re on the same page', style: 'anxious' },
      { text: 'Slow things down — you need breathing room',                   style: 'avoidant' },
      { text: 'Lean in and enjoy where it\'s going',                          style: 'secure' },
      { text: 'Push forward intensely, then suddenly pull back',              style: 'disorganized' },
    ],
  },
  {
    q: 'Conflict in a relationship makes you want to…',
    answers: [
      { text: 'Resolve it immediately — silence is unbearable',                          style: 'anxious' },
      { text: 'Step away and process it alone before you can talk',                      style: 'avoidant' },
      { text: 'Talk it through calmly once both people have cooled down',                style: 'secure' },
      { text: 'Either explode or completely shut down — depends on the day',             style: 'disorganized' },
    ],
  },
]

const STYLE_RESULT: Record<AttachmentStyle, { headline: string; description: string }> = {
  anxious:      { headline: 'Anxiously Attached',    description: 'You love deeply and feel everything at full volume. Silence reads as rejection; warmth is oxygen. You reach out first, then spiral about whether you said too much.' },
  avoidant:     { headline: 'Avoidantly Attached',   description: 'You care more than you show. You get close, then feel the pull to disappear. You show love through actions, not words — and you need space before you can open up.' },
  secure:       { headline: 'Securely Attached',     description: 'You know what you want and say it clearly. You\'re comfortable with both closeness and distance. You don\'t need games to feel safe — and it shows.' },
  disorganized: { headline: 'Disorganized Attached', description: 'You crave connection and fear it in equal measure. You run hot and cold with no warning. When you\'re present, you\'re completely present — the problem is staying.' },
}

const COMPANION_STYLES: Record<AttachmentStyle, AttachmentStyle> = {
  anxious:      'secure',
  avoidant:     'anxious',
  secure:       'disorganized',
  disorganized: 'secure',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeAgentId(name: string): string {
  const slug   = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `user_${slug}_${suffix}`
}

function tallyQuiz(answers: AttachmentStyle[]): AttachmentStyle {
  const counts: Record<AttachmentStyle, number> = { anxious: 0, avoidant: 0, secure: 0, disorganized: 0 }
  for (const a of answers) counts[a]++
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as AttachmentStyle
}

// ── Small reusable pieces ────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300
          ${i < current ? 'w-4 h-1.5 bg-rose-500' : i === current ? 'w-4 h-1.5 bg-rose-400' : 'w-1.5 h-1.5 bg-arena-border'}`} />
      ))}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-arena-card border border-arena-border rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold text-sm hover:bg-rose-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {children}
    </button>
  )
}

// ── Steps ────────────────────────────────────────────────────────────────────

function StepBasics({ data, onChange, onNext }: {
  data: FormData
  onChange: (k: keyof FormData, v: string) => void
  onNext: () => void
}) {
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
  const valid = data.name.trim().length >= 2 && Number(data.age) >= 18 && Number(data.age) <= 99 && data.gender !== '' && emailOk
  return (
    <div>
      <StepDots current={0} total={5} />
      <h2 className="text-2xl font-black text-white mb-1">The Basics</h2>
      <p className="text-sm text-slate-500 mb-6">Let's start with who you are.</p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-1.5">Your Name</label>
          <input
            autoFocus
            value={data.name}
            onChange={e => onChange('name', e.target.value)}
            placeholder="First name or nickname"
            className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-1.5">Age</label>
          <input
            type="number"
            min={18} max={99}
            value={data.age}
            onChange={e => onChange('age', e.target.value)}
            placeholder="18 – 99"
            className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-1.5">Email</label>
          <input
            type="email"
            value={data.email}
            onChange={e => onChange('email', e.target.value)}
            placeholder="your@email.com"
            className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />
          <p className="text-[10px] text-slate-600 mt-1">Used to log in and manage your agent later.</p>
        </div>

        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-2">Gender</label>
          <div className="grid grid-cols-3 gap-2">
            {([['m', 'Man'], ['f', 'Woman'], ['nb', 'Non-binary']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => onChange('gender', val)}
                className={`py-2.5 rounded-xl border text-sm font-medium transition-colors
                  ${data.gender === val
                    ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                    : 'bg-arena-muted border-arena-border text-slate-400 hover:border-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PrimaryBtn onClick={onNext} disabled={!valid}>
        Continue <ArrowRight size={14} />
      </PrimaryBtn>
    </div>
  )
}

function StepStyleChoice({ onQuiz, onManual }: { onQuiz: () => void; onManual: () => void }) {
  return (
    <div>
      <StepDots current={1} total={5} />
      <h2 className="text-2xl font-black text-white mb-1">Attachment Style</h2>
      <p className="text-sm text-slate-500 mb-6">Your attachment style shapes how you act in relationships. How would you like to find yours?</p>

      <div className="space-y-3">
        <button
          onClick={onQuiz}
          className="w-full text-left bg-arena-muted border border-arena-border hover:border-violet-500/40 hover:bg-violet-500/5 rounded-xl p-4 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <div className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">Take the quiz</div>
              <div className="text-xs text-slate-500">5 quick questions — takes about 60 seconds</div>
            </div>
            <ArrowRight size={14} className="ml-auto text-slate-600 group-hover:text-slate-400" />
          </div>
        </button>

        <button
          onClick={onManual}
          className="w-full text-left bg-arena-muted border border-arena-border hover:border-rose-500/30 hover:bg-rose-500/5 rounded-xl p-4 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✋</span>
            <div>
              <div className="text-sm font-semibold text-white group-hover:text-rose-300 transition-colors">I already know my type</div>
              <div className="text-xs text-slate-500">Pick directly from the four styles</div>
            </div>
            <ArrowRight size={14} className="ml-auto text-slate-600 group-hover:text-slate-400" />
          </div>
        </button>
      </div>
    </div>
  )
}

function StepQuiz({ onDone }: { onDone: (style: AttachmentStyle) => void }) {
  const [qIdx,    setQIdx]    = useState(0)
  const [answers, setAnswers] = useState<AttachmentStyle[]>([])
  const [picked,  setPicked]  = useState<AttachmentStyle | null>(null)
  const [result,  setResult]  = useState<AttachmentStyle | null>(null)

  const q = QUIZ[qIdx]

  const handleAnswer = (style: AttachmentStyle) => {
    setPicked(style)
    const next = [...answers, style]
    setTimeout(() => {
      if (qIdx + 1 < QUIZ.length) {
        setAnswers(next)
        setQIdx(qIdx + 1)
        setPicked(null)
      } else {
        setResult(tallyQuiz(next))
      }
    }, 300)
  }

  if (result) {
    const res  = STYLE_RESULT[result]
    const meta = STYLE_META[result]
    return (
      <div>
        <StepDots current={1} total={5} />
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${meta.bg} ${meta.color} border ${meta.border} mb-4`}>
          <span>{meta.emoji}</span> {res.headline}
        </div>
        <h2 className="text-xl font-black text-white mb-2">{res.headline}</h2>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">{res.description}</p>
        <div className="flex gap-2">
          <button
            onClick={() => { setResult(null); setQIdx(0); setAnswers([]); setPicked(null) }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-arena-border text-slate-400 text-sm hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={12} /> Retake
          </button>
          <button
            onClick={() => onDone(result)}
            className="flex-1 py-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold text-sm hover:bg-rose-500/25 transition-colors flex items-center justify-center gap-2"
          >
            That&apos;s me <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <StepDots current={1} total={5} />
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-white">Question {qIdx + 1} of {QUIZ.length}</h2>
        <span className="text-xs text-slate-600">{Math.round(((qIdx) / QUIZ.length) * 100)}%</span>
      </div>
      <div className="w-full h-1 bg-arena-muted rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-violet-500 transition-all duration-500 rounded-full" style={{ width: `${(qIdx / QUIZ.length) * 100}%` }} />
      </div>
      <p className="text-base font-semibold text-white mb-5">{q.q}</p>
      <div className="space-y-2">
        {q.answers.map((a, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(a.style)}
            disabled={picked !== null}
            className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all
              ${picked === a.style
                ? 'bg-violet-500/20 border-violet-500/60 text-violet-200'
                : 'bg-arena-muted border-arena-border text-slate-300 hover:border-slate-500 hover:bg-arena-muted/80'}`}
          >
            {a.text}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepManualStyle({ onDone }: { onDone: (style: AttachmentStyle) => void }) {
  const [selected, setSelected] = useState<AttachmentStyle | null>(null)
  const styles: AttachmentStyle[] = ['secure', 'anxious', 'avoidant', 'disorganized']

  return (
    <div>
      <StepDots current={1} total={5} />
      <h2 className="text-2xl font-black text-white mb-1">Pick Your Style</h2>
      <p className="text-sm text-slate-500 mb-5">Choose the one that sounds most like you.</p>
      <div className="space-y-2 mb-6">
        {styles.map(s => {
          const meta = STYLE_META[s]
          const res  = STYLE_RESULT[s]
          return (
            <button
              key={s}
              onClick={() => setSelected(s)}
              className={`w-full text-left p-4 rounded-xl border transition-all
                ${selected === s ? `${meta.bg} ${meta.border}` : 'bg-arena-muted border-arena-border hover:border-slate-500'}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{meta.emoji}</span>
                <div>
                  <div className={`text-sm font-bold ${selected === s ? meta.color : 'text-white'}`}>{res.headline}</div>
                  <div className="text-xs text-slate-500 line-clamp-1">{res.description.slice(0, 70)}…</div>
                </div>
                {selected === s && <CheckCircle size={16} className={`ml-auto shrink-0 ${meta.color}`} />}
              </div>
            </button>
          )
        })}
      </div>
      <PrimaryBtn onClick={() => selected && onDone(selected)} disabled={!selected}>
        Continue <ArrowRight size={14} />
      </PrimaryBtn>
    </div>
  )
}

function StepStory({ data, onChange, onInterests, onNext, onBack }: {
  data: FormData
  onChange: (k: keyof FormData, v: string) => void
  onInterests: (interests: string[]) => void
  onNext: () => void
  onBack: () => void
}) {
  const [interestInput, setInterestInput] = useState('')

  const addInterest = (raw: string) => {
    const trimmed = raw.trim().replace(/,+$/, '').trim()
    if (trimmed && !data.interests.includes(trimmed) && data.interests.length < 6) {
      onInterests([...data.interests, trimmed])
    }
    setInterestInput('')
  }

  const valid = data.occupation.trim().length > 0 && data.bio.trim().length >= 20

  return (
    <div>
      <StepDots current={2} total={5} />
      <h2 className="text-2xl font-black text-white mb-1">Your Story</h2>
      <p className="text-sm text-slate-500 mb-6">Help the arena understand you.</p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-1.5">Occupation</label>
          <input
            value={data.occupation}
            onChange={e => onChange('occupation', e.target.value)}
            placeholder="e.g. Graphic designer, nurse, student…"
            className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-1.5">
            Bio <span className="normal-case text-slate-600 font-normal">({data.bio.length}/200)</span>
          </label>
          <textarea
            rows={3}
            maxLength={200}
            value={data.bio}
            onChange={e => onChange('bio', e.target.value)}
            placeholder="A sentence or two about who you are in relationships…"
            className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 font-medium uppercase tracking-widest mb-1.5">
            Interests <span className="normal-case text-slate-600 font-normal">(up to 6)</span>
          </label>
          {data.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {data.interests.map(t => (
                <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
                  {t}
                  <button onClick={() => onInterests(data.interests.filter(i => i !== t))} className="text-rose-400/60 hover:text-rose-300 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
          {data.interests.length < 6 && (
            <input
              value={interestInput}
              onChange={e => setInterestInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addInterest(interestInput) }
              }}
              onBlur={() => interestInput.trim() && addInterest(interestInput)}
              placeholder="Type an interest, press Enter"
              className="w-full bg-arena-muted border border-arena-border rounded-xl px-4 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-colors text-sm"
            />
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onBack} className="px-4 py-3 rounded-xl border border-arena-border text-slate-400 text-sm hover:text-slate-200 transition-colors">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1">
          <PrimaryBtn onClick={onNext} disabled={!valid}>
            Continue <ArrowRight size={14} />
          </PrimaryBtn>
        </div>
      </div>
    </div>
  )
}

function StepGoal({ data, onSelect, onBack, onSubmit }: {
  data: FormData
  onSelect: (goal: Goal) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const goals: Array<{ value: Goal; icon: string; label: string; sub: string }> = [
    { value: 'relationship', icon: '❤️',  label: 'Serious relationship', sub: 'Looking for something real and lasting' },
    { value: 'casual',       icon: '🌊',  label: 'Casual dating',        sub: 'Seeing what\'s out there, keeping it light' },
    { value: 'friendship',   icon: '🤝',  label: 'Friendship',           sub: 'Connection first, everything else later' },
    { value: 'open',         icon: '✨',  label: 'Open to anything',     sub: 'No expectations, just good energy' },
  ]

  return (
    <div>
      <StepDots current={3} total={5} />
      <h2 className="text-2xl font-black text-white mb-1">What Are You Looking For?</h2>
      <p className="text-sm text-slate-500 mb-6">This shapes how your agent approaches relationships in the arena.</p>

      <div className="space-y-2 mb-6">
        {goals.map(g => (
          <button
            key={g.value}
            onClick={() => onSelect(g.value)}
            className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all flex items-center gap-3
              ${data.goal === g.value
                ? 'bg-rose-500/10 border-rose-500/40 text-white'
                : 'bg-arena-muted border-arena-border text-slate-300 hover:border-slate-500'}`}
          >
            <span className="text-xl shrink-0">{g.icon}</span>
            <div>
              <div className="text-sm font-semibold">{g.label}</div>
              <div className="text-xs text-slate-500">{g.sub}</div>
            </div>
            {data.goal === g.value && <CheckCircle size={15} className="ml-auto shrink-0 text-rose-400" />}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={onBack} className="px-4 py-3 rounded-xl border border-arena-border text-slate-400 text-sm hover:text-slate-200 transition-colors">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1">
          <PrimaryBtn onClick={onSubmit} disabled={!data.goal}>
            <Sparkles size={14} /> Create My Agent
          </PrimaryBtn>
        </div>
      </div>
    </div>
  )
}

function StepCreating() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-5 animate-pulse">
        <Sparkles size={24} className="text-rose-400" />
      </div>
      <h2 className="text-xl font-black text-white mb-2">Creating your agent…</h2>
      <p className="text-sm text-slate-500">Building your personality, finding your companion, opening the arena doors.</p>
    </div>
  )
}

function StepDone({ data, agentId }: { data: FormData; agentId: string }) {
  const style      = data.style as AttachmentStyle
  const meta       = STYLE_META[style]
  const compStyle  = COMPANION_STYLES[style]
  const compMeta   = STYLE_META[compStyle]

  return (
    <div>
      <StepDots current={4} total={5} />
      <div className="text-center mb-6">
        <div className="text-3xl mb-2">🎉</div>
        <h2 className="text-2xl font-black text-white mb-1">You&apos;re in the Arena</h2>
        <p className="text-sm text-slate-500">Your agent is live. Check your email to unlock your agent dashboard.</p>
      </div>

      {/* Agent card */}
      <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4 mb-4`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${meta.bg} border ${meta.border}`}>
            {meta.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-lg">{data.name}</span>
              <span className="text-xs text-slate-500">{data.age}</span>
            </div>
            <div className="text-xs text-slate-400">{data.occupation}</div>
          </div>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color} border ${meta.border}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed italic">&ldquo;{data.bio}&rdquo;</p>
        {data.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {data.interests.map(i => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-arena-muted text-slate-400">{i}</span>
            ))}
          </div>
        )}
      </div>

      {/* Companion teaser */}
      <div className="bg-arena-muted border border-arena-border rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Zap size={12} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">AI Companion</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base ${compMeta.bg} border ${compMeta.border}`}>
            {compMeta.emoji}
          </div>
          <div>
            <span className="text-sm text-white font-medium">Your companion is on their way</span>
            <div className="text-xs text-slate-500">A <span className={compMeta.color}>{compMeta.label}</span> agent is being paired with you to keep things interesting.</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Link href="/dashboard" className="block">
          <PrimaryBtn>
            <Heart size={14} /> Enter the Arena
          </PrimaryBtn>
        </Link>
        <Link
          href={`/profile/${agentId}`}
          className="block text-center text-xs text-slate-500 hover:text-slate-300 transition-colors py-2"
        >
          View my profile →
        </Link>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CreateAgentPage() {
  const [step,    setStep]    = useState<Step>('basics')
  const [quizMode, setQuizMode] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [error,   setError]   = useState('')

  const [data, setData] = useState<FormData>({
    name: '', age: '', gender: '', email: '', style: '', occupation: '', bio: '', interests: [], goal: '',
  })

  const set = (k: keyof FormData, v: string) => setData(prev => ({ ...prev, [k]: v }))

  const handleStyleDone = (style: AttachmentStyle) => {
    setData(prev => ({ ...prev, style }))
    setStep('story')
  }

  const handleSubmit = async () => {
    setStep('creating')
    setError('')
    const id = makeAgentId(data.name)
    try {
      await api.createUserAgent({
        id,
        name:       data.name.trim(),
        age:        Number(data.age),
        gender:     data.gender as string,
        email:      data.email.trim().toLowerCase(),
        occupation: data.occupation.trim(),
        style:      data.style as string,
        bio:        data.bio.trim(),
        traits:     [],
        interests:  data.interests,
        goal:       data.goal as string,
      })
      // Send magic link so user can access their agent dashboard
      await supabase.auth.signInWithOtp({
        email: data.email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      })
      setAgentId(id)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('goal')
    }
  }

  return (
    <div className="min-h-screen bg-arena-bg flex flex-col items-center justify-start px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Brand bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm">
            <ArrowLeft size={14} /> Back
          </Link>
          <span className="text-xs font-black tracking-widest uppercase bg-gradient-to-r from-rose-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Attachment Arena
          </span>
          <div className="w-12" />
        </div>

        {/* Header (only on first step) */}
        {step === 'basics' && (
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-4">
              <User size={24} className="text-rose-400" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Create My Agent</h1>
            <p className="text-sm text-slate-500 mt-1">Your AI self enters the arena and starts making connections.</p>
          </div>
        )}

        <div className="bg-arena-card border border-arena-border rounded-2xl p-6">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
              {error}
            </div>
          )}

          {step === 'basics' && (
            <StepBasics data={data} onChange={set} onNext={() => setStep('style')} />
          )}

          {step === 'style' && (
            <StepStyleChoice
              onQuiz={() => { setQuizMode(true); setStep('quiz') }}
              onManual={() => { setQuizMode(false); setStep('quiz') }}
            />
          )}

          {step === 'quiz' && quizMode && (
            <StepQuiz onDone={handleStyleDone} />
          )}

          {step === 'quiz' && !quizMode && (
            <StepManualStyle onDone={handleStyleDone} />
          )}

          {step === 'story' && (
            <StepStory
              data={data}
              onChange={set}
              onInterests={interests => setData(prev => ({ ...prev, interests }))}
              onNext={() => setStep('goal')}
              onBack={() => setStep('style')}
            />
          )}

          {step === 'goal' && (
            <StepGoal
              data={data}
              onSelect={goal => setData(prev => ({ ...prev, goal }))}
              onBack={() => setStep('story')}
              onSubmit={handleSubmit}
            />
          )}

          {step === 'creating' && <StepCreating />}

          {step === 'done' && <StepDone data={data} agentId={agentId} />}
        </div>
      </div>
    </div>
  )
}
