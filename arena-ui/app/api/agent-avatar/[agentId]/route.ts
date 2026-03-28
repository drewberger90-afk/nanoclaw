import { NextRequest, NextResponse } from 'next/server'

// ── Portrait prompts — one per agent ─────────────────────────────────────────
// Close-up, natural light, face-forward headshots matching each agent's look.

const BASE = 'portrait headshot, full face clearly visible, generous headroom above crown, chin fully visible, forehead fully visible, head not cropped at top or bottom, face centered with breathing room on all sides, natural soft light, shallow depth of field, muted tones, no text, no watermark, photorealistic, film grain, looking slightly toward camera'
const NEGATIVE = 'cropped forehead, cropped chin, cut off head, partial face, head cut off at top, missing top of head, zoomed in too close, face touching frame edge'

const AVATAR_PROMPTS: Record<string, string> = {
  maya:    `${BASE}. young south asian woman 27, dark curly hair, warm expressive eyes, gentle uncertain half-smile, soft window light, cozy indoor setting, slightly anxious warmth in expression`,
  jake:    `${BASE}. white man 30, dark hair, strong jaw, calm unreadable expression, minimal background, cool natural light, self-contained and guarded, doesn't give much away`,
  priya:   `${BASE}. south asian woman 29, warm confident face, natural hair, genuine relaxed smile, bright soft light, grounded and at ease, the kind of person who has figured things out`,
  leo:     `${BASE}. young man 26, curly dark hair, intense dark eyes, slightly tousled, brooding artistic energy, moody low light, magnetic and a little lost at the same time`,
  zara:    `${BASE}. black woman 31, natural hair styled up, sharp intelligent eyes, composed confident expression, clean modern background, warm light, someone who knows exactly what they want`,
  nia:     `${BASE}. young black woman 25, natural hair with a colorful accessory, big expressive eyes, bright eager smile, warm light, joyful and a little anxious, the most loveable chaos`,
  marcus:  `${BASE}. black man 33, close-cropped hair, steady calm gaze, quiet strength, clean neutral background, even warm light, patient and thoughtful, a person of very few wasted words`,
  sienna:  `${BASE}. white woman 28, dark hair loosely framing face, cool observant eyes, dry neutral expression, slight detachment, overcast soft light, beautiful in an unsettling way`,
  eli:    `${BASE}. white man 24, warm face, round glasses, soft light brown hair, gentle uncertain eagerness in expression, cozy warm light, earnest and slightly nervous`,
  carmen: `${BASE}. latina woman 29, warm dark eyes, dark hair pulled back neatly, strong capable presence, confident warm smile, bright clinical light, the kind of person you trust immediately`,
  dev:    `${BASE}. south asian man 27, stylish undercut fade, effortlessly cool, slightly amused half-smile, clean minimal background, sharp and self-contained`,
  amara:  `${BASE}. black woman 32, natural hair, intense searching eyes behind small round glasses, filmmaker energy, slightly dramatic light, brilliant and unsettled`,
  theo:   `${BASE}. mixed race man 26 Black and white, athletic build suggested, bright warm smile that doesn't quite cover the worry underneath, gym natural light, charming and anxious`,
  sofia:  `${BASE}. white woman 30, sleek dark bob perfectly maintained, cool elegant expression, slight ironic distance, wine-bar warm dim light, beautiful in an unreachable way`,
  jordan: `${BASE}. black man 28, kind open face, natural relaxed style, genuine warm expression, soft natural light, the kind of person you tell things to immediately`,
  remi:   `${BASE}. mixed race woman 25 Asian and white, striking face, visible tattoos at neckline and collarbone, intense dark eyes, moody dramatic light, magnetic and a little dangerous`,
  nadia:  `${BASE}. persian woman 31, dark hair framing face, sharp intelligent eyes behind modern glasses, slightly worried warmth in expression, clean desk light, brilliant and self-monitoring`,
  cass:   `${BASE}. white woman 33, sandy hair loosely back, outdoorsy natural beauty, self-sufficient calm expression, overcast natural light, someone who has been alone in beautiful places`,
  omar:   `${BASE}. black man 27, charismatic naturally expressive face, quick intelligence in his eyes, slight smirk that contains something real, warm stage-adjacent light, funny and complicated`,
  iris:   `${BASE}. east asian woman 22, bright curious intelligent eyes, unpretentious natural style, genuine open expression, soft coastal light, younger than she seems and older than she looks`,
}

const ARENA_API = process.env.NEXT_PUBLIC_ARENA_API_URL!
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function arenaApi(action: string, params: Record<string, unknown>) {
  const res = await fetch(ARENA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action, ...params }),
  })
  return res.json()
}

async function generateAvatarFresh(prompt: string): Promise<string> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not configured')

  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, negative_prompt: NEGATIVE, image_size: 'portrait_4_3', num_images: 1 }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`fal.ai ${res.status}: ${err}`)
  }
  const data = await res.json()
  const url  = data?.images?.[0]?.url
  if (!url) throw new Error('No image URL in response')
  return url
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params
  const prompt = AVATAR_PROMPTS[agentId]

  if (!prompt) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  if (!process.env.FAL_KEY) return NextResponse.json({ error: 'Image generation not configured' }, { status: 400 })

  // ── Check cache ──────────────────────────────────────────────────────────────
  const cached = await arenaApi('get_agent_photos', { agent_id: agentId, photo_type: 'avatar' })
  if (Array.isArray(cached?.data) && cached.data.length > 0) {
    const row = cached.data[0]
    return NextResponse.json({ imageData: row.image_url, falUrl: row.fal_url ?? row.image_url })
  }

  // ── Generate fresh ───────────────────────────────────────────────────────────
  try {
    const falUrl = await generateAvatarFresh(prompt)

    // Save to DB — awaited so it completes before the request ends
    await arenaApi('save_agent_photos', {
      photos: [{ agent_id: agentId, photo_type: 'avatar', context_tag: 'avatar', image_url: falUrl, fal_url: falUrl, sort_order: 0 }],
    })

    return NextResponse.json({ imageData: falUrl, falUrl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
