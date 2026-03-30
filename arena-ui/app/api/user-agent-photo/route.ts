import { NextRequest, NextResponse } from 'next/server'

const ARENA_API = process.env.NEXT_PUBLIC_ARENA_API_URL!
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FAL_KEY   = process.env.FAL_KEY

const BASE = 'portrait headshot, full face clearly visible, generous headroom above crown, chin fully visible, forehead fully visible, head not cropped at top or bottom, face centered with breathing room on all sides, natural soft light, shallow depth of field, muted tones, no text, no watermark, photorealistic, film grain, looking slightly toward camera'
const NEGATIVE = 'cropped forehead, cropped chin, cut off head, partial face, head cut off at top, missing top of head, zoomed in too close, face touching frame edge, cartoon, illustration, drawing, painting'

const STYLE_HINTS: Record<string, string> = {
  anxious:      'slightly uncertain warmth in expression, gentle half-smile, soft worried eyes',
  avoidant:     'calm unreadable expression, self-contained and guarded, cool detached gaze',
  secure:       'genuine relaxed smile, grounded and at ease, open warm expression',
  disorganized: 'intense eyes, magnetic and slightly restless energy, complex mixed expression',
}

async function arenaApi(action: string, params: Record<string, unknown>) {
  const res = await fetch(ARENA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action, ...params }),
  })
  return res.json()
}

function buildPrompt(agent: {
  age: number; gender: string; occupation: string
  style: string; bio: string; traits?: string[]
}): string {
  const genderWord = agent.gender === 'male' ? 'man' : agent.gender === 'female' ? 'woman' : 'person'
  const styleHint  = STYLE_HINTS[agent.style] ?? ''
  const bioSnippet = agent.bio.slice(0, 120).replace(/["""]/g, '')
  const traitHint  = agent.traits?.slice(0, 3).join(', ') ?? ''
  return [
    BASE,
    `${genderWord} ${agent.age}`,
    agent.occupation,
    styleHint,
    traitHint,
    bioSnippet,
  ].filter(Boolean).join(', ')
}

// ── GET — fetch cached avatar ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const cached = await arenaApi('get_agent_photos', { agent_id: agentId, photo_type: 'avatar' })
  const row    = Array.isArray(cached?.data) && cached.data[0]
  return NextResponse.json({ imageData: row?.image_url ?? null })
}

// ── POST — generate from bio or save uploaded photo ───────────────────────────
export async function POST(req: NextRequest) {
  const body              = await req.json()
  const { action, agent_id } = body as { action: string; agent_id: string }

  if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  // ── Generate via FAL.ai ────────────────────────────────────────────────────
  if (action === 'generate') {
    if (!FAL_KEY) return NextResponse.json({ error: 'Image generation not configured' }, { status: 400 })

    const { age, gender, occupation, style, bio, traits } =
      body as { age: number; gender: string; occupation: string; style: string; bio: string; traits?: string[] }

    const prompt = buildPrompt({ age, gender, occupation, style, bio, traits })

    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, negative_prompt: NEGATIVE, image_size: 'portrait_4_3', num_images: 1 }),
    })
    if (!falRes.ok) {
      const err = await falRes.text().catch(() => falRes.statusText)
      return NextResponse.json({ error: `Generation failed: ${err}` }, { status: 500 })
    }
    const falData = await falRes.json()
    const falUrl  = falData?.images?.[0]?.url
    if (!falUrl) return NextResponse.json({ error: 'No image returned from generator' }, { status: 500 })

    await arenaApi('save_agent_photos', {
      photos: [{ agent_id, photo_type: 'avatar', context_tag: 'avatar', image_url: falUrl, fal_url: falUrl, sort_order: 0 }],
    })
    return NextResponse.json({ imageData: falUrl })
  }

  // ── Save uploaded photo ────────────────────────────────────────────────────
  if (action === 'upload') {
    const { image_data } = body as { image_data: string }
    if (!image_data) return NextResponse.json({ error: 'image_data required' }, { status: 400 })

    await arenaApi('save_agent_photos', {
      photos: [{ agent_id, photo_type: 'avatar', context_tag: 'avatar', image_url: image_data, fal_url: null, sort_order: 0 }],
    })
    return NextResponse.json({ imageData: image_data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
