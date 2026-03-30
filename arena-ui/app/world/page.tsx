'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, api } from '@/lib/supabase'
import { STATIC_AGENTS, STYLE_META, STAGE_META, EVENT_META } from '@/types/arena'
import type { ArenaEvent, Relationship, Agent } from '@/types/arena'
import { X } from 'lucide-react'

// ── SVG canvas dimensions ──────────────────────────────────────────────────────
const VW = 1000
const VH = 580

// ── Location definitions (SVG coordinates) ───────────────────────────────────
interface Loc { id: string; name: string; emoji: string; x: number; y: number; color: string; desc: string }

const LOCATIONS: Loc[] = [
  { id: 'arena',         name: 'The Arena House',   emoji: '🏠', x: 495, y: 295, color: '#a855f7', desc: 'Home base — where everyone lives' },
  { id: 'cafe',          name: 'Cozy Café',         emoji: '☕', x: 155, y: 168, color: '#f59e0b', desc: 'Morning lattes and honest conversations' },
  { id: 'beach',         name: 'Sunset Beach',      emoji: '🌅', x: 800, y: 200, color: '#f97316', desc: 'Golden hour confessions and long walks' },
  { id: 'theater',       name: 'Cinema',            emoji: '🎬', x: 118, y: 408, color: '#6366f1', desc: 'Shoulder-to-shoulder in the dark' },
  { id: 'gym',           name: 'The Gym',           emoji: '💪', x: 450, y: 165, color: '#10b981', desc: 'Tension burns, attraction sparks' },
  { id: 'club',          name: 'Neon Lounge',       emoji: '🎵', x: 548, y: 458, color: '#ec4899', desc: 'Late nights and lowered defenses' },
  { id: 'gallery',       name: 'Art Gallery',       emoji: '🎨', x: 252, y: 335, color: '#8b5cf6', desc: 'Where creative souls find each other' },
  { id: 'apartment',     name: 'Private Apartment', emoji: '🚪', x: 658, y: 365, color: '#64748b', desc: 'Closed doors, open hearts' },
  { id: 'singles_villa', name: 'Singles Villa',     emoji: '🌹', x: 610, y: 175, color: '#f43f5e', desc: 'Where contestants fall in (and out of) love' },
  { id: 'couples_villa', name: 'Couples Villa',     emoji: '💑', x: 875, y: 340, color: '#fb923c', desc: 'For couples who made it — for now' },
]

// Each agent starts at their personal home (location = "home_<id>")
const AGENT_HOME: Record<string, string> = {
  maya: 'home_maya', jake: 'home_jake', priya: 'home_priya', leo: 'home_leo',
  zara: 'home_zara', nia: 'home_nia', marcus: 'home_marcus', sienna: 'home_sienna',
  eli: 'home_eli', carmen: 'home_carmen', dev: 'home_dev', amara: 'home_amara',
  theo: 'home_theo', sofia: 'home_sofia', jordan: 'home_jordan', remi: 'home_remi',
  nadia: 'home_nadia', cass: 'home_cass', omar: 'home_omar', iris: 'home_iris',
}

// ── Individual agent home positions ───────────────────────────────────────────
type HomeClass = 'basic' | 'nice' | 'upscale'
interface HomeData { neighborhood: 'quiet' | 'creative' | 'lofts'; cls: HomeClass; x: number; y: number }

const HOME_Y = 515
const AGENT_HOME_DATA: Record<string, HomeData> = {
  // Quiet Residential (bottom-left, below theater)
  priya:  { neighborhood: 'quiet',    cls: 'nice',    x: 30,  y: HOME_Y },
  eli:    { neighborhood: 'quiet',    cls: 'basic',   x: 70,  y: HOME_Y },
  maya:   { neighborhood: 'quiet',    cls: 'nice',    x: 110, y: HOME_Y },
  nia:    { neighborhood: 'quiet',    cls: 'basic',   x: 150, y: HOME_Y },
  nadia:  { neighborhood: 'quiet',    cls: 'nice',    x: 190, y: HOME_Y },
  carmen: { neighborhood: 'quiet',    cls: 'nice',    x: 230, y: HOME_Y },
  iris:   { neighborhood: 'quiet',    cls: 'basic',   x: 270, y: HOME_Y },
  // Creative District (bottom-center)
  amara:  { neighborhood: 'creative', cls: 'upscale', x: 335, y: HOME_Y },
  remi:   { neighborhood: 'creative', cls: 'basic',   x: 375, y: HOME_Y },
  leo:    { neighborhood: 'creative', cls: 'basic',   x: 415, y: HOME_Y },
  theo:   { neighborhood: 'creative', cls: 'basic',   x: 455, y: HOME_Y },
  jordan: { neighborhood: 'creative', cls: 'nice',    x: 495, y: HOME_Y },
  omar:   { neighborhood: 'creative', cls: 'basic',   x: 535, y: HOME_Y },
  // Modern Lofts (bottom-right)
  jake:   { neighborhood: 'lofts',    cls: 'upscale', x: 655, y: HOME_Y },
  zara:   { neighborhood: 'lofts',    cls: 'upscale', x: 698, y: HOME_Y },
  marcus: { neighborhood: 'lofts',    cls: 'nice',    x: 741, y: HOME_Y },
  sienna: { neighborhood: 'lofts',    cls: 'nice',    x: 784, y: HOME_Y },
  dev:    { neighborhood: 'lofts',    cls: 'nice',    x: 827, y: HOME_Y },
  sofia:  { neighborhood: 'lofts',    cls: 'upscale', x: 870, y: HOME_Y },
  cass:   { neighborhood: 'lofts',    cls: 'nice',    x: 913, y: HOME_Y },
}

const NEIGHBORHOODS = [
  { id: 'quiet',    name: 'Quiet Residential', x: 150, color: '#f59e0b' },
  { id: 'creative', name: 'Creative District',  x: 435, color: '#8b5cf6' },
  { id: 'lofts',    name: 'Modern Lofts',       x: 784, color: '#64748b' },
]

function happinessColor(s: number) {
  return s >= 70 ? '#10b981' : s >= 45 ? '#f59e0b' : s >= 20 ? '#f97316' : '#ef4444'
}

function computeAgentLocations(profiles: Agent[]): Record<string, string> {
  const locs: Record<string, string> = { ...AGENT_HOME }
  profiles.forEach(p => { if (p.location) locs[p.id] = p.location })
  return locs
}

// ── Building illustrations ─────────────────────────────────────────────────────

function ArenaHouse({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 10} rx={80} ry={24} fill="#a855f7" opacity={0.07} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 10} rx={58} ry={8} fill="#000" opacity={0.35} />
      {/* Side wings */}
      <rect x={x - 58} y={y - 55} width={24} height={62} rx={2} fill="#18102e" />
      <rect x={x + 34} y={y - 55} width={24} height={62} rx={2} fill="#18102e" />
      {/* Main body */}
      <rect x={x - 44} y={y - 65} width={88} height={72} rx={3} fill="#28194e" />
      {/* Gable roof */}
      <polygon points={`${x - 50},${y - 65} ${x + 50},${y - 65} ${x + 32},${y - 95} ${x - 32},${y - 95}`} fill="#1c1438" />
      {/* Chimney */}
      <rect x={x + 16} y={y - 105} width={10} height={16} fill="#0f0a1c" />
      <rect x={x + 14} y={y - 107} width={14} height={4} fill="#0f0a1c" />
      {/* Upper windows */}
      <rect x={x - 38} y={y - 58} width={22} height={17} rx={2} fill={lit ? '#fbbf24' : '#12102a'} opacity={lit ? 0.88 : 1} />
      <rect x={x - 11} y={y - 58} width={22} height={17} rx={2} fill={lit ? '#fbbf24' : '#12102a'} opacity={lit ? 0.92 : 1} />
      <rect x={x + 16} y={y - 58} width={22} height={17} rx={2} fill={lit ? '#f97316' : '#12102a'} opacity={lit ? 0.75 : 1} />
      {/* Lower windows */}
      <rect x={x - 38} y={y - 36} width={22} height={17} rx={2} fill={lit ? '#fbbf24' : '#12102a'} opacity={lit ? 0.72 : 1} />
      <rect x={x + 16} y={y - 36} width={22} height={17} rx={2} fill={lit ? '#fbbf24' : '#12102a'} opacity={lit ? 0.82 : 1} />
      {/* Door arch */}
      <rect x={x - 9} y={y - 14} width={18} height={22} rx={9} fill="#6d28d9" />
      <circle cx={x + 6} cy={y} r={2} fill="#c4b5fd" />
      {/* Steps */}
      <rect x={x - 16} y={y + 7} width={32} height={4} rx={1} fill="#1e1540" />
      <rect x={x - 12} y={y + 10} width={24} height={4} rx={1} fill="#1e1540" />
      {/* Wing windows */}
      <rect x={x - 54} y={y - 44} width={14} height={12} rx={1} fill={lit ? '#fbbf24' : '#12102a'} opacity={lit ? 0.6 : 1} />
      <rect x={x + 40} y={y - 44} width={14} height={12} rx={1} fill={lit ? '#fbbf24' : '#12102a'} opacity={lit ? 0.6 : 1} />
      {/* Trees flanking */}
      <rect x={x - 80} y={y - 18} width={5} height={28} fill="#152215" />
      <circle cx={x - 77} cy={y - 30} r={20} fill="#1e3418" />
      <circle cx={x - 77} cy={y - 36} r={14} fill="#284520" />
      <rect x={x + 74} y={y - 22} width={5} height={32} fill="#152215" />
      <circle cx={x + 77} cy={y - 34} r={18} fill="#1e3418" />
      <circle cx={x + 77} cy={y - 40} r={12} fill="#284520" />
      {/* Window glow */}
      {lit && <>
        <rect x={x - 38} y={y - 58} width={22} height={17} rx={2} fill="#fbbf24" opacity={0.3} filter="url(#blur5)" />
        <rect x={x - 11} y={y - 58} width={22} height={17} rx={2} fill="#fbbf24" opacity={0.35} filter="url(#blur5)" />
        <rect x={x + 16} y={y - 58} width={22} height={17} rx={2} fill="#f97316" opacity={0.28} filter="url(#blur5)" />
      </>}
    </g>
  )
}

function CafeBuilding({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 8} rx={60} ry={18} fill="#f59e0b" opacity={0.07} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 8} rx={45} ry={7} fill="#000" opacity={0.3} />
      {/* Building body */}
      <rect x={x - 38} y={y - 58} width={76} height={65} rx={2} fill="#2c2218" />
      {/* Flat roof + parapet */}
      <rect x={x - 40} y={y - 62} width={80} height={7} rx={1} fill="#161108" />
      {/* Awning */}
      <path d={`M ${x - 42} ${y - 36} L ${x + 42} ${y - 36} L ${x + 36} ${y - 22} L ${x - 36} ${y - 22} Z`}
        fill="#b45309" opacity={0.9} />
      {/* Awning stripes */}
      {[-24, -12, 0, 12, 24].map(ox => (
        <line key={ox} x1={x + ox} y1={y - 36} x2={x + ox - 2} y2={y - 22}
          stroke="#92400e" strokeWidth={3} opacity={0.5} />
      ))}
      {/* Front window (large) */}
      <rect x={x - 30} y={y - 56} width={60} height={20} rx={1} fill={lit ? '#fbbf24' : '#1a1510'} opacity={lit ? 0.7 : 1} />
      {/* Window divide */}
      <line x1={x} y1={y - 56} x2={x} y2={y - 36} stroke="#0f0c08" strokeWidth={1.5} />
      {/* Door */}
      <rect x={x - 8} y={y - 20} width={16} height={27} rx={2} fill="#2a1a08" />
      <rect x={x - 6} y={y - 18} width={6} height={10} rx={1} fill={lit ? '#fbbf24' : '#1a1510'} opacity={lit ? 0.6 : 1} />
      <rect x={x + 1} y={y - 18} width={6} height={10} rx={1} fill={lit ? '#fbbf24' : '#1a1510'} opacity={lit ? 0.6 : 1} />
      {/* Outdoor café tables */}
      <ellipse cx={x - 52} cy={y - 5} rx={10} ry={4} fill="#2a1c0a" />
      <rect x={x - 53} y={y - 8} width={2} height={16} fill="#1a1008" />
      <circle cx={x - 48} cy={y - 8} r={3} fill="#7c4f1a" opacity={0.7} />
      <ellipse cx={x + 52} cy={y - 2} rx={10} ry={4} fill="#2a1c0a" />
      <rect x={x + 51} y={y - 5} width={2} height={16} fill="#1a1008" />
      <circle cx={x + 56} cy={y - 4} r={3} fill="#7c4f1a" opacity={0.7} />
      {/* Potted plants */}
      <rect x={x - 44} y={y - 12} width={8} height={10} rx={1} fill="#2d1a0a" />
      <circle cx={x - 40} cy={y - 16} r={7} fill="#1a3010" />
      <circle cx={x + 38} cy={y - 16} r={7} fill="#1a3010" />
      <rect x={x + 35} y={y - 12} width={8} height={10} rx={1} fill="#2d1a0a" />
      {/* "CAFÉ" sign */}
      <rect x={x - 20} y={y - 75} width={40} height={14} rx={3} fill="#92400e" />
      <text x={x} y={y - 64} textAnchor="middle" fontSize={8} fill="#fde68a" fontWeight="bold" fontFamily="serif">CAFÉ</text>
      {/* Window glow */}
      {lit && <rect x={x - 30} y={y - 56} width={60} height={20} rx={1} fill="#fbbf24" opacity={0.25} filter="url(#blur5)" />}
    </g>
  )
}

function BeachScene({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {/* Sun glow on horizon */}
      {lit && <ellipse cx={x} cy={y - 40} rx={55} ry={22} fill="#f97316" opacity={0.12} filter="url(#blur24)" />}
      {/* Water */}
      <rect x={x - 70} y={y - 65} width={140} height={55} rx={2} fill="#0d2a4a" />
      <rect x={x - 70} y={y - 65} width={140} height={30} fill="url(#waterGrad)" />
      {/* Horizon sun */}
      <circle cx={x - 10} cy={y - 48} r={18} fill="#f97316" opacity={0.5} filter="url(#blur8)" />
      <circle cx={x - 10} cy={y - 48} r={10} fill="#fbbf24" opacity={0.7} />
      {/* Wave lines */}
      <path d={`M ${x - 68} ${y - 20} Q ${x - 48} ${y - 26} ${x - 28} ${y - 20} Q ${x - 8} ${y - 14} ${x + 12} ${y - 20} Q ${x + 32} ${y - 26} ${x + 52} ${y - 20} Q ${x + 65} ${y - 16} ${x + 68} ${y - 20}`}
        stroke="#1a4a7a" strokeWidth={1.5} fill="none" opacity={0.8} />
      <path d={`M ${x - 68} ${y - 12} Q ${x - 40} ${y - 18} ${x - 18} ${y - 12} Q ${x + 5} ${y - 6} ${x + 28} ${y - 12} Q ${x + 50} ${y - 18} ${x + 68} ${y - 12}`}
        stroke="#1e5a8a" strokeWidth={1.5} fill="none" opacity={0.6} />
      {/* Sand */}
      <rect x={x - 70} y={y - 10} width={140} height={22} rx={1} fill="#2a1e10" />
      <rect x={x - 70} y={y - 10} width={140} height={8} fill="#3a2a15" opacity={0.5} />
      {/* Palm trees */}
      <rect x={x - 50} y={y - 48} width={5} height={42} rx={2} fill="#1a1208" transform={`rotate(-8, ${x - 47}, ${y - 6})`} />
      <ellipse cx={x - 52} cy={y - 48} rx={20} ry={10} fill="#152a10" transform={`rotate(-15, ${x - 52}, ${y - 48})`} />
      <ellipse cx={x - 44} cy={y - 54} rx={18} ry={8} fill="#1a3514" transform={`rotate(10, ${x - 44}, ${y - 54})`} />
      <rect x={x + 40} y={y - 52} width={5} height={46} rx={2} fill="#1a1208" transform={`rotate(6, ${x + 42}, ${y - 6})`} />
      <ellipse cx={x + 50} cy={y - 52} rx={20} ry={10} fill="#152a10" transform={`rotate(18, ${x + 50}, ${y - 52})`} />
      <ellipse cx={x + 42} cy={y - 58} rx={18} ry={8} fill="#1a3514" transform={`rotate(-10, ${x + 42}, ${y - 58})`} />
      {/* Beach chair */}
      <rect x={x - 8} y={y - 4} width={20} height={10} rx={2} fill="#2a1a08" opacity={0.7} />
    </g>
  )
}

function TheaterBuilding({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 8} rx={62} ry={18} fill="#6366f1" opacity={0.07} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 8} rx={48} ry={7} fill="#000" opacity={0.3} />
      {/* Main building */}
      <rect x={x - 46} y={y - 68} width={92} height={75} rx={2} fill="#222450" />
      {/* Decorative top */}
      <rect x={x - 50} y={y - 72} width={100} height={10} rx={2} fill="#1e2050" />
      <rect x={x - 44} y={y - 80} width={88} height={12} rx={2} fill="#1a1c48" />
      {/* Marquee box */}
      <rect x={x - 44} y={y - 50} width={88} height={28} rx={2} fill="#141630" />
      {/* Marquee ambient glow — always on */}
      <rect x={x - 44} y={y - 50} width={88} height={28} rx={2} fill="#4f46e5" opacity={0.12} filter="url(#blur8)" />
      {/* Marquee lights border — always lit like streetlights */}
      {[-40, -28, -16, -4, 8, 20, 32, 40].map(ox => (
        <g key={ox}>
          <circle cx={x + ox} cy={y - 52} r={2.5} fill="#fbbf24" opacity={0.95} />
          <circle cx={x + ox} cy={y - 52} r={6} fill="#fbbf24" opacity={0.12} filter="url(#blur5)" />
        </g>
      ))}
      {[-40, -28, -16, -4, 8, 20, 32, 40].map(ox => (
        <g key={ox}>
          <circle cx={x + ox} cy={y - 24} r={2.5} fill="#fbbf24" opacity={0.95} />
          <circle cx={x + ox} cy={y - 24} r={6} fill="#fbbf24" opacity={0.12} filter="url(#blur5)" />
        </g>
      ))}
      {/* "NOW SHOWING" — always visible */}
      <text x={x} y={y - 40} textAnchor="middle" fontSize={7} fill="#e2e8f0" fontFamily="monospace" letterSpacing="1"
        style={{ filter: 'drop-shadow(0 0 3px rgba(200,200,255,0.6))' }}>NOW SHOWING</text>
      {/* "ATTACHMENT DRAMA" — always golden with glow */}
      <text x={x} y={y - 31} textAnchor="middle" fontSize={6.5} fill="#fbbf24" fontFamily="monospace" fontWeight="bold"
        style={{ filter: 'drop-shadow(0 0 4px #fbbf24)' }}>ATTACHMENT DRAMA</text>
      {/* Doors (double) */}
      <rect x={x - 20} y={y - 20} width={16} height={27} rx={8 } fill="#0c0e22" />
      <rect x={x + 4} y={y - 20} width={16} height={27} rx={8} fill="#0c0e22" />
      <circle cx={x - 4} cy={y - 6} r={1.5} fill="#4f46e5" />
      <circle cx={x + 14} cy={y - 6} r={1.5} fill="#4f46e5" />
      {/* Steps */}
      <rect x={x - 30} y={y + 5} width={60} height={5} rx={1} fill="#121435" />
      <rect x={x - 24} y={y + 8} width={48} height={4} rx={1} fill="#121435" />
      {/* Upper detail windows */}
      <rect x={x - 40} y={y - 66} width={16} height={12} rx={1} fill={lit ? '#4f46e5' : '#12142a'} opacity={lit ? 0.6 : 1} />
      <rect x={x + 24} y={y - 66} width={16} height={12} rx={1} fill={lit ? '#4f46e5' : '#12142a'} opacity={lit ? 0.6 : 1} />
      {lit && <rect x={x - 44} y={y - 50} width={88} height={28} rx={2} fill="#4f46e5" opacity={0.1} filter="url(#blur8)" />}
    </g>
  )
}

function GymBuilding({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 8} rx={60} ry={18} fill="#10b981" opacity={0.07} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 8} rx={48} ry={7} fill="#000" opacity={0.28} />
      {/* Glass modern building */}
      <rect x={x - 46} y={y - 70} width={92} height={77} rx={3} fill="#162e24" />
      {/* Grid windows — glass facade */}
      {[0, 1, 2].map(col => [0, 1, 2, 3].map(row => (
        <rect key={`${col}-${row}`}
          x={x - 40 + col * 30} y={y - 66 + row * 18}
          width={24} height={14} rx={1}
          fill={lit ? (row === 0 ? '#10b981' : '#34d399') : '#0a1a14'}
          opacity={lit ? (0.3 + Math.sin(col + row) * 0.15) : 0.6}
        />
      )))}
      {/* Top sign strip */}
      <rect x={x - 46} y={y - 74} width={92} height={8} rx={2} fill="#065f46" />
      <text x={x} y={y - 67} textAnchor="middle" fontSize={7} fill="#6ee7b7" fontWeight="bold" letterSpacing="2">THE GYM</text>
      {/* Equipment silhouettes inside (subtle) */}
      {lit && <>
        <rect x={x - 30} y={y - 30} width={3} height={20} fill="#10b981" opacity={0.15} />
        <rect x={x - 20} y={y - 36} width={14} height={3} fill="#10b981" opacity={0.12} />
        <rect x={x + 20} y={y - 36} width={14} height={3} fill="#10b981" opacity={0.12} />
        {/* grid glow */}
        {[0, 1, 2].map(col => (
          <rect key={col} x={x - 40 + col * 30} y={y - 66} width={24} height={14} rx={1}
            fill="#10b981" opacity={0.15} filter="url(#blur5)" />
        ))}
      </>}
      {/* Door */}
      <rect x={x - 10} y={y - 18} width={20} height={25} rx={2} fill="#0a1a14" />
      {/* Steps */}
      <rect x={x - 16} y={y + 6} width={32} height={4} rx={1} fill="#0a1a14" />
    </g>
  )
}

function NeonLounge({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <>
        <ellipse cx={x} cy={y + 8} rx={72} ry={22} fill="#ec4899" opacity={0.10} filter="url(#blur24)" />
        <ellipse cx={x} cy={y - 20} rx={55} ry={35} fill="#7c3aed" opacity={0.06} filter="url(#blur24)" />
      </>}
      <ellipse cx={x} cy={y + 8} rx={50} ry={7} fill="#000" opacity={0.35} />
      {/* Main building */}
      <rect x={x - 48} y={y - 72} width={96} height={79} rx={2} fill="#1c1230" />
      {/* Upper stories */}
      <rect x={x - 48} y={y - 72} width={96} height={30} rx={2} fill="#150d22" />
      {/* Neon sign - LOUNGE */}
      <rect x={x - 36} y={y - 58} width={72} height={16} rx={3} fill="#1a0a28" />
      <text x={x} y={y - 46} textAnchor="middle" fontSize={9} fill="#f472b6"
        fontFamily="monospace" fontWeight="bold" letterSpacing="2"
        style={{ filter: 'drop-shadow(0 0 5px #ec4899)' }}>
        LOUNGE
      </text>
      {/* Neon decorations — always on */}
      <rect x={x - 42} y={y - 65} width={84} height={1} stroke="#7c3aed" strokeWidth={1} fill="none" opacity={0.8} style={{ filter: 'drop-shadow(0 0 3px #7c3aed)' }} />
      <rect x={x - 42} y={y - 42} width={84} height={1} stroke="#ec4899" strokeWidth={1} fill="none" opacity={0.8} style={{ filter: 'drop-shadow(0 0 3px #ec4899)' }} />
      {/* Lower facade — darker panels */}
      <rect x={x - 44} y={y - 38} width={40} height={45} rx={1} fill="#0e0818" />
      <rect x={x + 4} y={y - 38} width={40} height={45} rx={1} fill="#0e0818" />
      {/* Windows — upper */}
      <rect x={x - 40} y={y - 68} width={16} height={12} rx={1} fill={lit ? '#7c3aed' : '#14082a'} opacity={lit ? 0.5 : 1} />
      <rect x={x - 18} y={y - 68} width={16} height={12} rx={1} fill={lit ? '#ec4899' : '#14082a'} opacity={lit ? 0.5 : 1} />
      <rect x={x + 4} y={y - 68} width={16} height={12} rx={1} fill={lit ? '#7c3aed' : '#14082a'} opacity={lit ? 0.55 : 1} />
      <rect x={x + 24} y={y - 68} width={16} height={12} rx={1} fill={lit ? '#ec4899' : '#14082a'} opacity={lit ? 0.45 : 1} />
      {/* Entrance */}
      <rect x={x - 14} y={y - 20} width={28} height={27} rx={3} fill="#0a0514" />
      <path d={`M ${x - 14} ${y - 20} A 14 14 0 0 1 ${x + 14} ${y - 20}`} fill="#150a24" />
      {/* Bouncer */}
      <rect x={x + 22} y={y - 10} width={8} height={18} rx={2} fill="#1a1028" />
      <circle cx={x + 26} cy={y - 16} r={5} fill="#2a1a38" />
    </g>
  )
}

function ArtGallery({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 8} rx={58} ry={18} fill="#8b5cf6" opacity={0.07} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 8} rx={46} ry={7} fill="#000" opacity={0.28} />
      {/* Clean minimalist building */}
      <rect x={x - 46} y={y - 65} width={92} height={72} rx={2} fill="#261e38" />
      {/* Top beam */}
      <rect x={x - 48} y={y - 68} width={96} height={7} rx={1} fill="#12101e" />
      {/* Large gallery windows */}
      <rect x={x - 40} y={y - 60} width={36} height={44} rx={1} fill={lit ? '#c4b5fd' : '#16122a'} opacity={lit ? 0.15 : 1} />
      <rect x={x + 4} y={y - 60} width={36} height={44} rx={1} fill={lit ? '#a78bfa' : '#16122a'} opacity={lit ? 0.18 : 1} />
      {/* Art inside windows (small colored rects) */}
      {lit && <>
        <rect x={x - 36} y={y - 56} width={10} height={14} fill="#f472b6" opacity={0.45} />
        <rect x={x - 22} y={y - 52} width={14} height={18} fill="#fbbf24" opacity={0.35} />
        <rect x={x + 8} y={y - 56} width={12} height={16} fill="#34d399" opacity={0.3} />
        <rect x={x + 24} y={y - 54} width={10} height={20} fill="#818cf8" opacity={0.4} />
      </>}
      {/* Window frames */}
      <rect x={x - 40} y={y - 60} width={36} height={44} rx={1} stroke="#2a2040" strokeWidth={1.5} fill="none" />
      <rect x={x + 4} y={y - 60} width={36} height={44} rx={1} stroke="#2a2040" strokeWidth={1.5} fill="none" />
      {/* Door */}
      <rect x={x - 7} y={y - 16} width={14} height={23} rx={1} fill="#12101e" />
      <line x1={x} y1={y - 16} x2={x} y2={y + 7} stroke="#2a2040" strokeWidth={1} />
      {/* "GALLERY" sign */}
      <text x={x} y={y - 72} textAnchor="middle" fontSize={6} fill="#c4b5fd"
        letterSpacing="3" fontFamily="serif"
        style={{ filter: 'drop-shadow(0 0 3px rgba(167,139,250,0.7))' }}>GALLERY</text>
      {/* Sculpture outside */}
      <rect x={x - 60} y={y - 20} width={6} height={28} rx={1} fill="#1e1830" />
      <ellipse cx={x - 57} cy={y - 22} rx={8} ry={8} fill="#221c35" />
      <circle cx={x - 57} cy={y - 26} r={5} fill="#2a2245" />
      {lit && <>
        <rect x={x - 40} y={y - 60} width={36} height={44} fill="#8b5cf6" opacity={0.08} filter="url(#blur8)" />
        <rect x={x + 4} y={y - 60} width={36} height={44} fill="#7c3aed" opacity={0.08} filter="url(#blur8)" />
      </>}
    </g>
  )
}

function ApartmentBuilding({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 8} rx={55} ry={16} fill="#64748b" opacity={0.06} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 8} rx={44} ry={7} fill="#000" opacity={0.3} />
      {/* Building body — residential */}
      <rect x={x - 42} y={y - 80} width={84} height={87} rx={2} fill="#181620" />
      {/* Roof details */}
      <rect x={x - 44} y={y - 83} width={88} height={7} rx={1} fill="#121018" />
      {/* Many small windows — residential feel */}
      {[0, 1, 2, 3].map(row =>
        [0, 1, 2].map(col => {
          const wLit = lit && (row + col) % 2 === 0
          return (
            <rect key={`${row}-${col}`}
              x={x - 34 + col * 28} y={y - 74 + row * 20}
              width={16} height={12} rx={1}
              fill={wLit ? '#fbbf24' : (lit && (row + col) % 3 === 1 ? '#4a6fa5' : '#111016')}
              opacity={wLit ? 0.7 : 1}
            />
          )
        })
      )}
      {/* Entry door with buzzer panel */}
      <rect x={x - 10} y={y - 12} width={20} height={19} rx={1} fill="#0e0c18" />
      <rect x={x + 12} y={y - 10} width={8} height={12} rx={1} fill="#1a1828" />
      {[0, 1, 2, 3].map(i => (
        <circle key={i} cx={x + 16} cy={y - 8 + i * 3} r={0.8} fill={lit ? '#64748b' : '#2a2840'} />
      ))}
      {/* Steps */}
      <rect x={x - 16} y={y + 6} width={32} height={4} rx={1} fill="#121018" />
      {/* Window glows */}
      {lit && [0, 2].map(col => (
        <rect key={col} x={x - 34 + col * 28} y={y - 74} width={16} height={12} rx={1}
          fill="#fbbf24" opacity={0.2} filter="url(#blur5)" />
      ))}
      {/* Laundry / detail */}
      <line x1={x - 42} y1={y - 30} x2={x - 50} y2={y - 28} stroke="#2a2840" strokeWidth={1} />
    </g>
  )
}

function SinglesVilla({ x, y, lit, count }: { x: number; y: number; lit: boolean; count: number }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 12} rx={90} ry={28} fill="#f43f5e" opacity={0.08} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 12} rx={72} ry={10} fill="#000" opacity={0.38} />
      {/* Garden walls */}
      <rect x={x - 76} y={y - 15} width={152} height={8} rx={1} fill="#1e0a14" />
      <rect x={x - 76} y={y - 15} width={8} height={8} rx={1} fill="#2a0e1a" />
      <rect x={x + 68} y={y - 15} width={8} height={8} rx={1} fill="#2a0e1a" />
      {/* Main villa body */}
      <rect x={x - 62} y={y - 82} width={124} height={70} rx={3} fill="#1c0c18" />
      {/* Side wings */}
      <rect x={x - 74} y={y - 68} width={16} height={54} rx={2} fill="#180a14" />
      <rect x={x + 58} y={y - 68} width={16} height={54} rx={2} fill="#180a14" />
      {/* Terracotta / Mediterranean roof */}
      <rect x={x - 68} y={y - 88} width={136} height={10} rx={2} fill="#1a0810" />
      <polygon points={`${x - 66},${y - 88} ${x + 66},${y - 88} ${x + 48},${y - 108} ${x - 48},${y - 108}`} fill="#120608" />
      {/* Villa sign */}
      <rect x={x - 38} y={y - 106} width={76} height={14} rx={3} fill="#7f1d1d" opacity={0.9} />
      <text x={x} y={y - 95} textAnchor="middle" fontSize={7} fill="#fda4af"
        fontFamily="serif" letterSpacing="2" fontWeight="bold"
        style={{ filter: 'drop-shadow(0 0 4px rgba(244,63,94,0.8))' }}>SINGLES VILLA</text>
      {/* Rose/pink glow on sign — always on */}
      <rect x={x - 38} y={y - 106} width={76} height={14} rx={3} fill="#f43f5e" opacity={0.15} filter="url(#blur5)" />
      {/* Upper windows — arched */}
      <rect x={x - 52} y={y - 76} width={22} height={20} rx={11} fill={lit ? '#fda4af' : '#140810'} opacity={lit ? 0.25 : 1} />
      <rect x={x - 22} y={y - 76} width={22} height={20} rx={11} fill={lit ? '#fb7185' : '#140810'} opacity={lit ? 0.28 : 1} />
      <rect x={x + 8} y={y - 76} width={22} height={20} rx={11} fill={lit ? '#fda4af' : '#140810'} opacity={lit ? 0.22 : 1} />
      <rect x={x + 38} y={y - 76} width={22} height={20} rx={11} fill={lit ? '#fb7185' : '#140810'} opacity={lit ? 0.3 : 1} />
      {/* Lower balcony railing */}
      <rect x={x - 58} y={y - 50} width={116} height={3} rx={1} fill="#280a18" />
      {[...Array(12)].map((_, i) => (
        <rect key={i} x={x - 55 + i * 10} y={y - 50} width={2} height={14} fill="#280a18" />
      ))}
      {/* Lower windows */}
      <rect x={x - 50} y={y - 44} width={30} height={22} rx={2} fill={lit ? '#fda4af' : '#14080e'} opacity={lit ? 0.2 : 1} />
      <rect x={x + 20} y={y - 44} width={30} height={22} rx={2} fill={lit ? '#fb7185' : '#14080e'} opacity={lit ? 0.22 : 1} />
      {/* Grand entrance */}
      <rect x={x - 16} y={y - 18} width={32} height={26} rx={3} fill="#0e0408" />
      <path d={`M ${x - 16} ${y - 18} A 16 16 0 0 1 ${x + 16} ${y - 18}`} fill="#180810" />
      {/* Rose bushes flanking entrance */}
      <circle cx={x - 26} cy={y - 6} r={8} fill="#1a0810" />
      <circle cx={x - 26} cy={y - 10} r={5} fill="#3d0f1f" />
      {lit && <circle cx={x - 26} cy={y - 10} r={3} fill="#f43f5e" opacity={0.4} />}
      <circle cx={x + 26} cy={y - 6} r={8} fill="#1a0810" />
      <circle cx={x + 26} cy={y - 10} r={5} fill="#3d0f1f" />
      {lit && <circle cx={x + 26} cy={y - 10} r={3} fill="#f43f5e" opacity={0.4} />}
      {/* Wing windows */}
      <rect x={x - 70} y={y - 56} width={10} height={14} rx={1} fill={lit ? '#fda4af' : '#120610'} opacity={lit ? 0.2 : 1} />
      <rect x={x + 60} y={y - 56} width={10} height={14} rx={1} fill={lit ? '#fda4af' : '#120610'} opacity={lit ? 0.2 : 1} />
      {/* Contestant count badge */}
      {count > 0 && (
        <g>
          <circle cx={x + 66} cy={y - 100} r={10} fill="#f43f5e" />
          <text x={x + 66} y={y - 96} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">{count}</text>
        </g>
      )}
      {/* Window glows */}
      {lit && <>
        <rect x={x - 52} y={y - 76} width={22} height={20} rx={11} fill="#f43f5e" opacity={0.12} filter="url(#blur8)" />
        <rect x={x + 8} y={y - 76} width={22} height={20} rx={11} fill="#f43f5e" opacity={0.10} filter="url(#blur8)" />
      </>}
    </g>
  )
}

function CouplesVilla({ x, y, lit, count }: { x: number; y: number; lit: boolean; count: number }) {
  return (
    <g>
      {lit && <ellipse cx={x} cy={y + 12} rx={82} ry={26} fill="#fb923c" opacity={0.09} filter="url(#blur24)" />}
      <ellipse cx={x} cy={y + 12} rx={66} ry={10} fill="#000" opacity={0.38} />
      {/* Stone path */}
      {[-10, -4, 2, 8].map(ox => (
        <ellipse key={ox} cx={x + ox} cy={y + 8} rx={5} ry={3} fill="#1a150c" opacity={0.6} />
      ))}
      {/* Main cottage body */}
      <rect x={x - 56} y={y - 70} width={112} height={78} rx={3} fill="#1e1508" />
      {/* Warm thatch roof */}
      <polygon points={`${x - 62},${y - 70} ${x + 62},${y - 70} ${x + 44},${y - 105} ${x - 44},${y - 105}`} fill="#160e04" />
      {/* Roof cap */}
      <rect x={x - 46} y={y - 108} width={92} height={6} rx={2} fill="#0e0902" />
      {/* Dormer windows */}
      <rect x={x - 26} y={y - 96} width={18} height={16} rx={2} fill={lit ? '#fbbf24' : '#140e04'} opacity={lit ? 0.3 : 1} />
      <rect x={x + 10} y={y - 96} width={18} height={16} rx={2} fill={lit ? '#f97316' : '#140e04'} opacity={lit ? 0.28 : 1} />
      {/* Chimney */}
      <rect x={x + 28} y={y - 118} width={12} height={18} fill="#12100a" />
      <rect x={x + 26} y={y - 120} width={16} height={4} fill="#0e0c08" />
      {/* Smoke wisps */}
      {lit && <>
        <path d={`M ${x + 34} ${y - 122} Q ${x + 36} ${y - 130} ${x + 33} ${y - 138}`}
          stroke="#2a2010" strokeWidth={2} fill="none" opacity={0.5} strokeLinecap="round" />
        <path d={`M ${x + 36} ${y - 124} Q ${x + 40} ${y - 132} ${x + 37} ${y - 142}`}
          stroke="#2a2010" strokeWidth={1.5} fill="none" opacity={0.35} strokeLinecap="round" />
      </>}
      {/* "Couples Villa" sign — heart + text */}
      <rect x={x - 36} y={y - 80} width={72} height={14} rx={3} fill="#2a1a06" />
      <text x={x} y={y - 69} textAnchor="middle" fontSize={6.5} fill="#fed7aa"
        fontFamily="serif" letterSpacing="2" fontWeight="bold"
        style={{ filter: 'drop-shadow(0 0 3px rgba(251,146,60,0.7))' }}>COUPLES VILLA</text>
      {/* Large warm windows */}
      <rect x={x - 48} y={y - 62} width={36} height={28} rx={2} fill={lit ? '#fbbf24' : '#140e04'} opacity={lit ? 0.22 : 1} />
      <rect x={x + 12} y={y - 62} width={36} height={28} rx={2} fill={lit ? '#f97316' : '#140e04'} opacity={lit ? 0.20 : 1} />
      {/* Window cross bars */}
      <line x1={x - 30} y1={y - 62} x2={x - 30} y2={y - 34} stroke="#0e0a04" strokeWidth={1} />
      <line x1={x - 48} y1={y - 48} x2={x - 12} y2={y - 48} stroke="#0e0a04" strokeWidth={1} />
      <line x1={x + 30} y1={y - 62} x2={x + 30} y2={y - 34} stroke="#0e0a04" strokeWidth={1} />
      <line x1={x + 12} y1={y - 48} x2={x + 48} y2={y - 48} stroke="#0e0a04" strokeWidth={1} />
      {/* Door with heart wreath */}
      <rect x={x - 14} y={y - 22} width={28} height={32} rx={4} fill="#0e0904" />
      <path d={`M ${x - 14} ${y - 22} A 14 14 0 0 1 ${x + 14} ${y - 22}`} fill="#120c06" />
      <text x={x} y={y - 28} textAnchor="middle" fontSize={10} fill={lit ? '#f97316' : '#2a1808'}>{lit ? '♥' : '♡'}</text>
      {/* Flower boxes */}
      <rect x={x - 48} y={y - 34} width={36} height={6} rx={1} fill="#1a1208" />
      <rect x={x + 12} y={y - 34} width={36} height={6} rx={1} fill="#1a1208" />
      {lit && <>
        {[-44, -38, -32, -26].map(ox => (
          <circle key={ox} cx={x + ox} cy={y - 37} r={3} fill="#f43f5e" opacity={0.5} />
        ))}
        {[16, 22, 28, 34, 40].map(ox => (
          <circle key={ox} cx={x + ox} cy={y - 37} r={3} fill="#fb923c" opacity={0.5} />
        ))}
      </>}
      {/* Couple count badge */}
      {count > 0 && (
        <g>
          <circle cx={x + 60} cy={y - 98} r={10} fill="#fb923c" />
          <text x={x + 60} y={y - 94} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">{count}</text>
        </g>
      )}
      {lit && <>
        <rect x={x - 48} y={y - 62} width={36} height={28} rx={2} fill="#fbbf24" opacity={0.12} filter="url(#blur8)" />
        <rect x={x + 12} y={y - 62} width={36} height={28} rx={2} fill="#f97316" opacity={0.10} filter="url(#blur8)" />
      </>}
    </g>
  )
}

// ── Tiny home component ────────────────────────────────────────────────────────
function TinyHome({ x, y, agentStyle, cls, lit }: {
  x: number; y: number; agentStyle: string; cls: HomeClass; lit: boolean
}) {
  const sc: Record<string, { w: string; r: string; win: string; acc: string }> = {
    anxious:      { w: '#1e1318', r: '#2a1618', win: '#fbbf24', acc: '#f97316' },
    avoidant:     { w: '#0f1820', r: '#0a1118', win: '#60a5fa', acc: '#3b82f6' },
    secure:       { w: '#111c10', r: '#15200e', win: '#4ade80', acc: '#22c55e' },
    disorganized: { w: '#1e1020', r: '#280e2e', win: '#e879f9', acc: '#c026d3' },
  }
  const { w, r, win, acc } = sc[agentStyle] ?? sc.secure
  const W  = cls === 'upscale' ? 16 : cls === 'nice' ? 13 : 10
  const H  = cls === 'upscale' ? 22 : cls === 'nice' ? 18 : 14
  const rH = cls === 'upscale' ? 0  : cls === 'nice' ? 9  : 7
  const winW = Math.max(4, W * 0.55)
  const winH = Math.max(3, H * 0.22)

  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx={W * 0.8} ry={2} fill="#000" opacity={0.45} />
      <rect x={x - W} y={y - H} width={W * 2} height={H} rx={1} fill={w} />
      {cls === 'upscale' ? (
        <>
          <rect x={x - W - 2} y={y - H - 4} width={W * 2 + 4} height={5} rx={1} fill={r} />
          <rect x={x - W} y={y - H} width={W * 2} height={1.5} fill={acc} opacity={lit ? 0.65 : 0.15} />
        </>
      ) : (
        <polygon points={`${x - W - 2},${y - H} ${x + W + 2},${y - H} ${x},${y - H - rH}`} fill={r} />
      )}
      {cls === 'nice' && <rect x={x + W - 4} y={y - H - rH + 2} width={3} height={5} fill={r} />}
      <rect x={x - W + 2} y={y - H + 3} width={winW} height={winH} rx={0.5}
        fill={lit ? win : '#05050e'} opacity={lit ? 0.85 : 1} />
      <rect x={x + 2} y={y - H + 3} width={winW} height={winH} rx={0.5}
        fill={lit ? win : '#05050e'} opacity={lit ? 0.85 : 1} />
      <rect x={x - 2} y={y - Math.max(6, H * 0.38)} width={4} height={Math.max(6, H * 0.38)} rx={0.5} fill="#040408" />
      {cls === 'upscale' && lit && (
        <rect x={x - W + 1} y={y - 3} width={W * 2 - 2} height={1} fill={acc} opacity={0.5} />
      )}
      {lit && (
        <g opacity={0.35} filter="url(#blur5)">
          <rect x={x - W + 2} y={y - H + 3} width={winW} height={winH} rx={0.5} fill={win} />
          <rect x={x + 2} y={y - H + 3} width={winW} height={winH} rx={0.5} fill={win} />
        </g>
      )}
    </g>
  )
}

// ── Background terrain (grounds the upper buildings) ──────────────────────────
function BackgroundTerrain() {
  return (
    <g>
      {/* Distant ridge — peaks near cafe (~x=155), gym (~x=450), singles villa (~x=610) */}
      <path
        d="M 0,260 C 0,210 55,160 155,155 C 240,152 330,153 420,148 C 460,145 530,135 610,132 C 655,130 710,140 780,155 C 840,166 910,188 1000,235 L 1000,260 Z"
        fill="#183520" opacity={0.95}
      />
      {/* Mid ridge — softer rolling layer */}
      <path
        d="M 0,260 C 50,250 140,232 240,238 C 330,244 420,235 510,237 C 580,238 650,228 730,232 C 810,236 900,248 1000,254 L 1000,260 Z"
        fill="#1e3c18" opacity={0.9}
      />
    </g>
  )
}

// ── Street network ─────────────────────────────────────────────────────────────
function Streets() {
  return (
    <g opacity={0.35}>
      {/* Main roads — connecting center to all locations */}
      <path d={`M 495 295 Q 330 240 155 168`} stroke="#3d3555" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={`M 495 295 Q 650 240 800 200`} stroke="#3d3555" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={`M 495 295 Q 300 350 118 408`} stroke="#3d3555" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={`M 495 295 Q 472 228 450 165`} stroke="#3d3555" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={`M 495 295 Q 518 380 548 458`} stroke="#3d3555" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={`M 495 295 Q 370 315 252 335`} stroke="#3d3555" strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d={`M 495 295 Q 580 328 658 365`} stroke="#3d3555" strokeWidth={8} fill="none" strokeLinecap="round" />
      {/* Cross streets */}
      <path d={`M 252 335 Q 185 372 118 408`} stroke="#3d3555" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M 252 335 Q 205 250 155 168`} stroke="#3d3555" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M 658 365 Q 603 412 548 458`} stroke="#3d3555" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M 450 165 Q 530 170 610 175`} stroke="#3d3555" strokeWidth={6} fill="none" strokeLinecap="round" />
      {/* Villa roads */}
      <path d={`M 495 295 Q 555 235 610 175`} stroke="#2a1424" strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d={`M 800 200 Q 840 268 875 340`} stroke="#241808" strokeWidth={8} fill="none" strokeLinecap="round" />
      {/* Road center lines (subtle) */}
      <path d={`M 495 295 Q 330 240 155 168`} stroke="#4a4260" strokeWidth={1} strokeDasharray="8 12" fill="none" opacity={0.5} />
      <path d={`M 495 295 Q 650 240 800 200`} stroke="#4a4260" strokeWidth={1} strokeDasharray="8 12" fill="none" opacity={0.5} />
    </g>
  )
}

// ── Streetlights ───────────────────────────────────────────────────────────────
function Streetlights() {
  const lights = [
    { x: 325, y: 230 }, { x: 230, y: 195 }, { x: 530, y: 210 }, { x: 478, y: 205 },
    { x: 300, y: 365 }, { x: 380, y: 355 }, { x: 576, y: 378 }, { x: 608, y: 430 },
  ]
  return (
    <g>
      {lights.map((l, i) => (
        <g key={i}>
          <rect x={l.x - 1} y={l.y - 22} width={2} height={22} fill="#1e1c30" />
          <line x1={l.x} y1={l.y - 22} x2={l.x + 8} y2={l.y - 24} stroke="#1e1c30" strokeWidth={1.5} />
          <circle cx={l.x + 8} cy={l.y - 24} r={3} fill="#fbbf24" opacity={0.8} />
          <circle cx={l.x + 8} cy={l.y - 24} r={8} fill="#fbbf24" opacity={0.08} filter="url(#blur8)" />
        </g>
      ))}
    </g>
  )
}

// ── Ambient trees / greenery ───────────────────────────────────────────────────
function Greenery() {
  const trees = [
    { x: 380, y: 240 }, { x: 420, y: 238 }, { x: 560, y: 248 }, { x: 590, y: 250 },
    { x: 340, y: 410 }, { x: 460, y: 400 }, { x: 650, y: 310 }, { x: 680, y: 308 },
    { x: 200, y: 290 }, { x: 750, y: 290 }, { x: 430, y: 400 },
  ]
  return (
    <g>
      {trees.map((t, i) => (
        <g key={i}>
          <rect x={t.x - 2} y={t.y - 6} width={4} height={14} fill="#152215" />
          <circle cx={t.x} cy={t.y - 14} r={12} fill="#1e3418" />
          <circle cx={t.x} cy={t.y - 18} r={8} fill="#284520" />
        </g>
      ))}
    </g>
  )
}

// ── Time-of-day sky system ─────────────────────────────────────────────────────

interface SkyTheme {
  sky0: string; sky1: string; sky2: string   // zenith, mid, horizon
  ground0: string; ground1: string
  stars: number          // 0–1 opacity multiplier
  isNight: boolean       // streetlights / window glow on?
  bodyType: 'sun' | 'moon'
  bodyOpacity: number    // 0–1
  bodyColor: string
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function lerpHex(c1: string, c2: string, t: number): string {
  const p = (s: string, o: number) => parseInt(s.slice(o, o + 2), 16)
  const r = Math.round(lerp(p(c1, 1), p(c2, 1), t))
  const g = Math.round(lerp(p(c1, 3), p(c2, 3), t))
  const b = Math.round(lerp(p(c1, 5), p(c2, 5), t))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

// Keyframes by hour (0–23). Values interpolate between adjacent entries.
const SKY_KEYS: Array<{ h: number } & SkyTheme> = [
  { h:  0, sky0:'#160830', sky1:'#0e0520', sky2:'#080415', ground0:'#120e22', ground1:'#0a0818', stars:1,    isNight:true,  bodyType:'moon', bodyOpacity:0.95, bodyColor:'#eeeae0' },
  { h:  5, sky0:'#1a0a38', sky1:'#100622', sky2:'#080415', ground0:'#120e22', ground1:'#0a0818', stars:0.8,  isNight:true,  bodyType:'moon', bodyOpacity:0.65, bodyColor:'#dedad0' },
  { h:  6, sky0:'#8c3a18', sky1:'#3a1828', sky2:'#160a20', ground0:'#1a1020', ground1:'#100814', stars:0.2,  isNight:true,  bodyType:'sun',  bodyOpacity:0.75, bodyColor:'#ff8844' },
  { h:  7, sky0:'#f08040', sky1:'#904030', sky2:'#241430', ground0:'#201210', ground1:'#120a10', stars:0,    isNight:false, bodyType:'sun',  bodyOpacity:0.92, bodyColor:'#ffbb55' },
  { h:  8, sky0:'#5aaade', sky1:'#3a82cc', sky2:'#2268b8', ground0:'#1c2830', ground1:'#121e24', stars:0,    isNight:false, bodyType:'sun',  bodyOpacity:1,    bodyColor:'#fff090' },
  { h: 10, sky0:'#3898e0', sky1:'#2280cc', sky2:'#1a66b4', ground0:'#182430', ground1:'#101820', stars:0,    isNight:false, bodyType:'sun',  bodyOpacity:1,    bodyColor:'#fff8b8' },
  { h: 14, sky0:'#3898e0', sky1:'#2280cc', sky2:'#1a66b4', ground0:'#182430', ground1:'#101820', stars:0,    isNight:false, bodyType:'sun',  bodyOpacity:1,    bodyColor:'#fff8b8' },
  { h: 16, sky0:'#5aaade', sky1:'#4082cc', sky2:'#2268b8', ground0:'#1c2830', ground1:'#121e24', stars:0,    isNight:false, bodyType:'sun',  bodyOpacity:0.95, bodyColor:'#ffe070' },
  { h: 18, sky0:'#e07030', sky1:'#903020', sky2:'#281020', ground0:'#1e1018', ground1:'#120a10', stars:0.05, isNight:false, bodyType:'sun',  bodyOpacity:0.85, bodyColor:'#ff7733' },
  { h: 19, sky0:'#4a2058', sky1:'#220e32', sky2:'#0e0618', ground0:'#160a20', ground1:'#0e0818', stars:0.45, isNight:true,  bodyType:'moon', bodyOpacity:0.35, bodyColor:'#ccc4dc' },
  { h: 20, sky0:'#220e38', sky1:'#140a28', sky2:'#0a0618', ground0:'#120e20', ground1:'#0c0a18', stars:0.75, isNight:true,  bodyType:'moon', bodyOpacity:0.70, bodyColor:'#e4e0f0' },
  { h: 22, sky0:'#160830', sky1:'#0e0520', sky2:'#080415', ground0:'#120e22', ground1:'#0a0818', stars:1,    isNight:true,  bodyType:'moon', bodyOpacity:0.95, bodyColor:'#eeeae0' },
]

function getSkyTheme(date: Date): SkyTheme & { frac: number; bodyX: number; bodyY: number } {
  const h = date.getHours() + date.getMinutes() / 60
  let i = SKY_KEYS.length - 2
  for (let k = 0; k < SKY_KEYS.length - 1; k++) {
    if (h >= SKY_KEYS[k].h && h < SKY_KEYS[k + 1].h) { i = k; break }
  }
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1]
  const t = (h - a.h) / (b.h - a.h)

  // Sun arc: rises at x=50 at 6am, peaks x=500 y=30 at noon, sets x=950 at 18
  // Moon arc: rises at x=900 at 20:00, peaks at x=500 at 1am, sets at x=100 at 6am
  let bodyX: number, bodyY: number
  if (h >= 6 && h <= 18) {
    const p = (h - 6) / 12  // 0→1 across the day
    bodyX = 50 + p * 900
    bodyY = 245 - Math.sin(p * Math.PI) * 170   // peak at y≈75, safe under slice cropping
  } else {
    // Moon: 20h→6h (wrapping)
    const moonH = h >= 20 ? h - 20 : h + 4
    const p = moonH / 10
    bodyX = 900 - p * 800
    bodyY = 230 - Math.sin(p * Math.PI) * 150   // peak at y≈80
  }

  return {
    sky0: lerpHex(a.sky0, b.sky0, t),
    sky1: lerpHex(a.sky1, b.sky1, t),
    sky2: lerpHex(a.sky2, b.sky2, t),
    ground0: lerpHex(a.ground0, b.ground0, t),
    ground1: lerpHex(a.ground1, b.ground1, t),
    stars: lerp(a.stars, b.stars, t),
    isNight: h < 7.5 || h >= 18.5,
    bodyType: h >= 7 && h <= 19 ? 'sun' : 'moon',
    bodyOpacity: lerp(a.bodyOpacity, b.bodyOpacity, t),
    bodyColor: lerpHex(a.bodyColor, b.bodyColor, t),
    frac: t,
    bodyX, bodyY,
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WorldPage() {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [events,        setEvents]        = useState<ArenaEvent[]>([])
  const [profiles,      setProfiles]      = useState<Agent[]>([])
  const [avatars,       setAvatars]       = useState<Record<string, string>>({})
  const [selected,      setSelected]      = useState<string | null>(null)
  const [hoveredAgent,  setHoveredAgent]  = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [now,           setNow]           = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const sky = getSkyTheme(now)

  const load = useCallback(async () => {
    const [rRes, eRes, pRes] = await Promise.all([api.getRelationships(), api.getEvents(80), api.getProfiles()])
    if (Array.isArray(rRes?.data)) setRelationships(rRes.data)
    if (Array.isArray(eRes?.data)) setEvents(eRes.data)
    if (Array.isArray(pRes?.data)) setProfiles(pRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    STATIC_AGENTS.forEach(agent => {
      fetch(`/api/agent-avatar/${agent.id}`)
        .then(r => r.json())
        .then(d => { if (d.imageData) setAvatars(prev => ({ ...prev, [agent.id]: d.imageData })) })
        .catch(() => {})
    })
  }, [])

  // Fetch avatars for user-created agents once profiles load
  useEffect(() => {
    profiles.forEach(agent => {
      if (STATIC_AGENTS.find(s => s.id === agent.id)) return
      fetch(`/api/agent-avatar/${agent.id}`)
        .then(r => r.json())
        .then(d => { if (d.imageData) setAvatars(prev => ({ ...prev, [agent.id]: d.imageData })) })
        .catch(() => {})
    })
  }, [profiles])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('world-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' },
        p => setEvents(prev => [p.new as ArenaEvent, ...prev.slice(0, 79)])
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agents' },
        p => setProfiles(prev => {
          const updated = p.new as Agent
          return prev.find(a => a.id === updated.id)
            ? prev.map(a => a.id === updated.id ? { ...a, location: updated.location } : a)
            : [...prev, updated]
        })
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const allAgents: Agent[] = [
    ...STATIC_AGENTS,
    ...profiles.filter(p => !STATIC_AGENTS.find(s => s.id === p.id) && !p.id.startsWith('cmp_')),
  ]

  const agentLocations = computeAgentLocations(profiles)
  const activeRels     = relationships.filter(r => !['strangers','broken_up','divorced'].includes(r.stage))
  const coupleRels     = relationships.filter(r => ['dating','committed','engaged','married'].includes(r.stage))

  const agentsByLoc: Record<string, Agent[]> = {}
  allAgents.forEach(agent => {
    const loc = agentLocations[agent.id] ?? `home_${agent.id}`
    ;(agentsByLoc[loc] ??= []).push(agent)
  })

  const selectedLoc    = selected ? LOCATIONS.find(l => l.id === selected) ?? null : null
  const agentsHere     = selected ? (agentsByLoc[selected] ?? []) : []
  const agentIdsHere   = new Set(agentsHere.map(a => a.id))
  const locEvents      = events.filter(e =>
    agentIdsHere.has(e.agent_id) ||
    (e.metadata?.to_agent_id && agentIdsHere.has(e.metadata.to_agent_id))
  ).slice(0, 25)

  const hoveredData = hoveredAgent ? allAgents.find(a => a.id === hoveredAgent) ?? null : null
  const hoveredRels = hoveredAgent ? activeRels.filter(r => r.agent_a_id === hoveredAgent || r.agent_b_id === hoveredAgent) : []

  return (
    <div className="fixed inset-0 overflow-hidden" style={{
      top: 64,
      background: sky.ground1,
    }}>
      {/* ── SVG map ── */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          {/* Filters */}
          <filter id="blur5" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="blur8" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="blur24" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="24" />
          </filter>
          {/* Gradients */}
          <radialGradient id="skyGrad" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor={sky.sky0} />
            <stop offset="60%" stopColor={sky.sky1} />
            <stop offset="100%" stopColor={sky.sky2} />
          </radialGradient>
          <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky.ground0} />
            <stop offset="100%" stopColor={sky.ground1} />
          </linearGradient>
          <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a4060" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#0d2a40" stopOpacity={0} />
          </linearGradient>
          {/* Vignette */}
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="100%" stopColor="#020108" stopOpacity={0.7} />
          </radialGradient>
          {/* Sun glow */}
          {sky.bodyType === 'sun' && (
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={sky.bodyColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={sky.bodyColor} stopOpacity={0} />
            </radialGradient>
          )}
          {/* Clip paths for agent avatars */}
          {allAgents.map(agent => {
            const locId = agentLocations[agent.id] ?? `home_${agent.id}`
            let ax: number, ay: number
            if (locId.startsWith('home_')) {
              const hd = AGENT_HOME_DATA[locId.replace('home_', '')]
              if (!hd) return null
              ax = hd.x; ay = hd.y - 38
            } else {
              const loc = LOCATIONS.find(l => l.id === locId)
              if (!loc) return null
              const agents = agentsByLoc[locId] ?? []
              const idx = agents.indexOf(agent)
              const spread = agents.length
              ax = loc.x + (spread > 1 ? (idx - (spread - 1) / 2) * 22 : 0)
              ay = loc.y - 80
            }
            return (
              <clipPath key={agent.id} id={`aclip-${agent.id}`}>
                <circle cx={ax} cy={ay} r={16} />
              </clipPath>
            )
          })}
        </defs>

        {/* Sky */}
        <rect width={VW} height={VH} fill="url(#skyGrad)" />

        {/* Stars */}
        {sky.stars > 0 && [
          [80, 30], [150, 55], [240, 20], [320, 45], [440, 15], [560, 35], [680, 22],
          [750, 50], [860, 28], [940, 45], [100, 80], [480, 65], [820, 70], [360, 12],
          [200, 10], [620, 8], [900, 18], [40, 60], [710, 75], [390, 48],
        ].map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r={0.8 + (i % 3) * 0.4} fill="#e2e8f0"
            opacity={(0.2 + (i % 4) * 0.1) * sky.stars} />
        ))}

        {/* Sun / Moon */}
        {sky.bodyOpacity > 0 && sky.bodyY < 260 && (
          <g opacity={sky.bodyOpacity}>
            {sky.bodyType === 'sun' ? (
              <>
                <ellipse cx={sky.bodyX} cy={sky.bodyY} rx={70} ry={50}
                  fill="url(#sunGlow)" />
                <circle cx={sky.bodyX} cy={sky.bodyY} r={18} fill={sky.bodyColor} />
              </>
            ) : (
              <>
                <circle cx={sky.bodyX} cy={sky.bodyY} r={28}
                  fill={sky.bodyColor} opacity={0.08} />
                <circle cx={sky.bodyX} cy={sky.bodyY} r={14} fill={sky.bodyColor} />
                {/* Crescent shadow */}
                <circle cx={sky.bodyX + 5} cy={sky.bodyY - 2} r={11}
                  fill={sky.sky1} />
              </>
            )}
          </g>
        )}

        {/* Ground */}
        <rect y={260} width={VW} height={VH - 260} fill="url(#groundGrad)" />

        {/* Background terrain — hills that ground the upper buildings */}
        <BackgroundTerrain />

        {/* Streets */}
        <Streets />

        {/* Greenery */}
        <Greenery />

        {/* Streetlights */}
        <Streetlights />

        {/* ── Buildings ── */}
        {LOCATIONS.map(loc => {
          const agents = agentsByLoc[loc.id] ?? []
          const occupied = agents.length > 0
          // Window glow only makes sense when it's dark out
          const lit = occupied && sky.isNight
          switch (loc.id) {
            case 'arena':     return <ArenaHouse    key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'cafe':      return <CafeBuilding  key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'beach':     return <BeachScene    key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'theater':   return <TheaterBuilding key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'gym':       return <GymBuilding   key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'club':      return <NeonLounge    key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'gallery':       return <ArtGallery    key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'apartment':     return <ApartmentBuilding key={loc.id} x={loc.x} y={loc.y} lit={lit} />
            case 'singles_villa': return <SinglesVilla key={loc.id} x={loc.x} y={loc.y} lit={lit} count={agents.length} />
            case 'couples_villa': return <CouplesVilla key={loc.id} x={loc.x} y={loc.y} lit={lit} count={agents.length} />
            default:              return null
          }
        })}


        {/* ── Neighborhood base plates ── */}
        <rect x={10}  y={468} width={280} height={60} rx={4} fill="#0c0a18" opacity={0.55} />
        <rect x={315} y={468} width={238} height={60} rx={4} fill="#0c0a18" opacity={0.55} />
        <rect x={630} y={468} width={308} height={60} rx={4} fill="#0c0a18" opacity={0.55} />
        {/* Neighborhood street lines */}
        <line x1={10}  y1={530} x2={290} y2={530} stroke="#1e1c2e" strokeWidth={3} />
        <line x1={315} y1={530} x2={553} y2={530} stroke="#1e1c2e" strokeWidth={3} />
        <line x1={630} y1={530} x2={938} y2={530} stroke="#1e1c2e" strokeWidth={3} />
        {/* Connecting streets from neighborhoods to main roads */}
        <path d={`M 150 468 Q 150 440 200 408`} stroke="#1e1c2e" strokeWidth={4} fill="none" opacity={0.5} />
        <path d={`M 435 468 Q 495 458 548 458`} stroke="#1e1c2e" strokeWidth={4} fill="none" opacity={0.5} />
        <path d={`M 784 468 Q 720 418 658 365`} stroke="#1e1c2e" strokeWidth={4} fill="none" opacity={0.5} />

        {/* ── Individual agent homes ── */}
        {allAgents.map(agent => {
          const hd = AGENT_HOME_DATA[agent.id]
          if (!hd) return null
          const isHome = (agentLocations[agent.id] ?? `home_${agent.id}`).startsWith('home_')
          return (
            <TinyHome key={agent.id} x={hd.x} y={hd.y} agentStyle={agent.style} cls={hd.cls} lit={isHome && sky.isNight} />
          )
        })}

        {/* ── Agent avatars in SVG ── */}
        {allAgents.map(agent => {
          const locId = agentLocations[agent.id] ?? `home_${agent.id}`
          let ax: number, ay: number
          if (locId.startsWith('home_')) {
            const hd = AGENT_HOME_DATA[locId.replace('home_', '')]
            if (!hd) return null
            ax = hd.x; ay = hd.y - 38
          } else {
            const loc = LOCATIONS.find(l => l.id === locId)
            if (!loc) return null
            const agents = agentsByLoc[locId] ?? []
            const idx    = agents.indexOf(agent)
            const spread = agents.length
            const offsetX = spread > 1 ? (idx - (spread - 1) / 2) * 22 : 0
            ax = loc.x + offsetX
            ay = loc.y - 80
          }
          const atHome   = locId.startsWith('home_')
          const agentIdx = allAgents.indexOf(agent)
          const meta     = STYLE_META[agent.style]
          const url      = avatars[agent.id]
          const hasDrama = activeRels.some(r =>
            r.happiness_score < 35 && (r.agent_a_id === agent.id || r.agent_b_id === agent.id)
          )
          const isCouple = coupleRels.some(r => r.agent_a_id === agent.id || r.agent_b_id === agent.id)
          // Avatars at home are slightly smaller and more muted
          const r = atHome ? 13 : 17
          return (
            <g key={agent.id} style={{ animation: `bob ${2 + agentIdx * 0.3}s ease-in-out infinite` }}
               className="cursor-pointer" opacity={atHome ? 0.82 : 1}>
              {/* Halo glow for couples (skip at home unless partner is also home) */}
              {isCouple && !atHome && <circle cx={ax} cy={ay} r={22} fill="#ec4899" opacity={0.15} filter="url(#blur8)" />}
              {/* Drama ring */}
              {hasDrama && <circle cx={ax} cy={ay} r={r + 3} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.7} />}
              {/* Avatar border */}
              <circle cx={ax} cy={ay} r={r + 1} fill="#0f0f1a"
                stroke={meta.border.replace('border-','').replace('/30','')}
                strokeWidth={atHome ? 1.5 : 2} />
              {/* Photo or emoji */}
              {url ? (
                <image href={url} x={ax - r} y={ay - r} width={r * 2} height={r * 2}
                  clipPath={`url(#aclip-${agent.id})`} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <text x={ax} y={ay + (atHome ? 4 : 5)} fontSize={atHome ? 11 : 14} textAnchor="middle" className="select-none">{meta.emoji}</text>
              )}
              {/* Name label — only show when not at home (too cramped) or on hover */}
              {!atHome && <>
                <rect x={ax - 18} y={ay + 20} width={36} height={12} rx={3} fill="#0a0914" opacity={0.8} />
                <text x={ax} y={ay + 29} fontSize={7.5} fill="#e2e8f0" textAnchor="middle" fontWeight="600"
                  fontFamily="Inter, system-ui">{agent.name}</text>
              </>}
              {atHome && <>
                <rect x={ax - 14} y={ay + r + 3} width={28} height={10} rx={2} fill="#0a0914" opacity={0.7} />
                <text x={ax} y={ay + r + 10} fontSize={6.5} fill="#9ca3af" textAnchor="middle"
                  fontFamily="Inter, system-ui">{agent.name}</text>
              </>}
              {/* Heart / drama badge */}
              {isCouple && !hasDrama && !atHome && (
                <text x={ax + 12} y={ay - 12} fontSize={9} opacity={0.9}>💕</text>
              )}
              {hasDrama && (
                <text x={ax + r} y={ay - r} fontSize={9} opacity={0.9}>⚡</text>
              )}
            </g>
          )
        })}

        {/* ── Click zones (invisible, on top) ── */}
        {LOCATIONS.map(loc => (
          <g key={loc.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(s => s === loc.id ? null : loc.id)}>
            <circle cx={loc.x} cy={loc.y - 40} r={52} fill="transparent" />
            {/* Selected ring */}
            {selected === loc.id && (
              <circle cx={loc.x} cy={loc.y - 40} r={56} fill="none"
                stroke={loc.color} strokeWidth={2} strokeDasharray="6 4" opacity={0.7}
                style={{ filter: `drop-shadow(0 0 6px ${loc.color})` }} />
            )}
          </g>
        ))}

        {/* ── Floating hearts for high-happiness couples ── */}
        {coupleRels.filter(r => r.happiness_score >= 65).slice(0, 3).map((rel, i) => {
          const locId = agentLocations[rel.agent_a_id] ?? 'arena'
          const loc   = LOCATIONS.find(l => l.id === locId)
          if (!loc) return null
          return [0, 1].map(j => (
            <text key={`${rel.id}-${j}`} x={loc.x + (j === 0 ? -10 : 8)} fontSize={10}
              style={{ animation: `floatUp ${2.5 + j * 0.6 + i * 0.3}s ease-in ${j * 0.9 + i * 0.4}s infinite` }}>
              💖
            </text>
          ))
        })}

        {/* Vignette overlay */}
        <rect width={VW} height={VH} fill="url(#vignette)" pointerEvents="none" />
      </svg>

      {/* ── Location labels (HTML overlay for crisp text) ── */}
      {LOCATIONS.map(loc => {
        const pct = { left: `${(loc.x / VW) * 100}%`, top: `${((loc.y + 12) / VH) * 100}%` }
        const agents = agentsByLoc[loc.id] ?? []
        return (
          <div key={loc.id}
            className="absolute -translate-x-1/2 pointer-events-none text-center"
            style={pct}
          >
            <div className={`text-[10px] font-bold tracking-wide whitespace-nowrap
              ${selected === loc.id ? 'text-white' : 'text-slate-400'}`}
              style={selected === loc.id ? { textShadow: `0 0 8px ${loc.color}` } : undefined}
            >
              {loc.name}
              {agents.length > 0 && (
                <span className="ml-1.5 text-[9px] font-normal opacity-70">({agents.length})</span>
              )}
            </div>
          </div>
        )
      })}

      {/* ── Neighborhood labels ── */}
      {NEIGHBORHOODS.map(n => {
        const homeCnt = allAgents.filter(a => AGENT_HOME_DATA[a.id]?.neighborhood === n.id && (agentLocations[a.id] ?? `home_${a.id}`).startsWith('home_')).length
        return (
          <div key={n.id} className="absolute -translate-x-1/2 pointer-events-none text-center"
            style={{ left: `${(n.x / VW) * 100}%`, top: `${(545 / VH) * 100}%` }}>
            <div className="text-[9px] font-semibold tracking-widest uppercase whitespace-nowrap"
              style={{ color: n.color, opacity: 0.6 }}>
              {n.name}{homeCnt > 0 && <span className="ml-1 opacity-70 font-normal normal-case tracking-normal">({homeCnt} home)</span>}
            </div>
          </div>
        )
      })}

      {/* ── Agent hover tooltip ── */}
      {hoveredData && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fade-in"
          style={{ right: selected ? 320 : undefined }}>
          <div className="bg-[#0f0e1a]/95 backdrop-blur border border-[#1e1e2e] rounded-xl p-4 shadow-2xl min-w-[240px]">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-full overflow-hidden border-2 shrink-0 ${STYLE_META[hoveredData.style].border}`}>
                {avatars[hoveredData.id]
                  ? <img src={avatars[hoveredData.id]} alt={hoveredData.name} className="w-full h-full object-cover object-center" />
                  : <div className={`w-full h-full ${STYLE_META[hoveredData.style].bg} flex items-center justify-center text-xl`}>
                      {STYLE_META[hoveredData.style].emoji}
                    </div>
                }
              </div>
              <div>
                <div className="font-bold text-white text-sm">{hoveredData.name}</div>
                <div className={`text-xs ${STYLE_META[hoveredData.style].color}`}>
                  {STYLE_META[hoveredData.style].emoji} {STYLE_META[hoveredData.style].label}
                </div>
              </div>
            </div>
            {hoveredRels.length > 0 ? (
              <div className="space-y-1 border-t border-[#1e1e2e] pt-2">
                {hoveredRels.map(rel => {
                  const partner = rel.agent_a_id === hoveredData.id ? rel.agent_b_name : rel.agent_a_name
                  const stage   = STAGE_META[rel.stage]
                  return (
                    <div key={rel.id} className="flex items-center justify-between text-xs gap-3">
                      <span className="text-slate-400">with {partner}</span>
                      <span className={`${stage?.color ?? 'text-slate-400'} font-medium shrink-0`}>{stage?.label ?? rel.stage}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic border-t border-[#1e1e2e] pt-2">No active connections</p>
            )}
          </div>
        </div>
      )}

      {/* ── Side panel ── */}
      {selectedLoc && (
        <div className="fixed right-0 z-40 flex flex-col border-l border-[#1e1e2e] shadow-2xl"
          style={{ top: 64, bottom: 0, width: 320, background: 'rgba(13,11,22,0.97)', backdropFilter: 'blur(16px)', animation: 'slideInRight 0.22s ease-out' }}>
          <div className="p-4 border-b border-[#1e1e2e] flex items-start justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: `${selectedLoc.color}1a`, border: `1px solid ${selectedLoc.color}44` }}>
                {selectedLoc.emoji}
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">{selectedLoc.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{selectedLoc.desc}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)}
              className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/5 transition-colors shrink-0 mt-0.5">
              <X size={14} />
            </button>
          </div>

          <div className="p-4 border-b border-[#1e1e2e] shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2.5">Here right now</div>
            {agentsHere.length === 0 ? (
              <p className="text-xs text-slate-600 italic">Nobody here right now</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {agentsHere.map(agent => {
                  const meta  = STYLE_META[agent.style]
                  const relHere = coupleRels.find(r =>
                    (r.agent_a_id === agent.id || r.agent_b_id === agent.id) &&
                    agentIdsHere.has(r.agent_a_id) && agentIdsHere.has(r.agent_b_id)
                  )
                  return (
                    <div key={agent.id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border"
                      style={{ background: `${selectedLoc.color}0f`, borderColor: `${selectedLoc.color}30` }}>
                      <div className={`w-5 h-5 rounded-full overflow-hidden border ${meta.border} shrink-0`}>
                        {avatars[agent.id]
                          ? <img src={avatars[agent.id]} alt={agent.name} className="w-full h-full object-cover object-center" />
                          : <div className={`w-full h-full ${meta.bg} flex items-center justify-center text-[9px]`}>{meta.emoji}</div>
                        }
                      </div>
                      <span className="text-xs text-white font-medium">{agent.name}</span>
                      {relHere && (
                        <span className="text-[10px]">{relHere.happiness_score >= 65 ? '💕' : relHere.happiness_score < 35 ? '⚡' : '•'}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Recent activity</div>
            {locEvents.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-3xl block mb-2">{selectedLoc.emoji}</span>
                <p className="text-xs text-slate-600 italic">No recent activity here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {locEvents.map(e => {
                  const meta = EVENT_META[e.event_type] ?? { label: e.event_type, icon: '•', color: 'text-slate-400' }
                  const time = new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={e.id} className="flex gap-2.5 animate-fade-in">
                      <span className="text-base shrink-0 mt-0.5 leading-none">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
                          <span className="text-[10px] text-slate-600">·</span>
                          <span className="text-[10px] text-slate-500">{e.agent_id}</span>
                          <span className="text-[10px] text-slate-600 ml-auto">{time}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-4">{e.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-slate-500 text-sm animate-pulse tracking-wide">Loading world…</div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 z-30 flex items-center gap-5 py-2 px-6 pointer-events-none"
        style={{ left: 0, right: selected ? 320 : 0, background: 'linear-gradient(to top, rgba(6,5,15,0.9), transparent)' }}>
        {[['#10b981','Thriving'],['#f59e0b','Tension'],['#ef4444','Crisis']].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <div className="w-8 h-px" style={{ background: c, opacity: 0.7 }} />{l}
          </div>
        ))}
        <span className="text-[10px] text-slate-600 ml-auto">Click a location to explore · Hover agents for info</span>
      </div>

      <style>{`
        @keyframes bob {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
