import { NextRequest, NextResponse } from 'next/server'

const ARENA_API = process.env.NEXT_PUBLIC_ARENA_API_URL!
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const NEGATIVE  = 'text, watermark, logo, blurry, ugly, cartoon, illustration, nudity, explicit'

// Per-type scene styles appended to every prompt
const TYPE_STYLE: Record<string, string> = {
  hobby:       'candid natural photo, doing a leisure activity, warm natural light, instagram aesthetic, lifestyle photography',
  thirst_trap: 'confident posed selfie or portrait, stylish outfit, intentional warm lighting, attractive, aesthetic instagram photo',
  date_photo:  'candid evening photo, happy glowing expression, bokeh background, date night warm light, romantic atmosphere',
  reflection:  'moody contemplative photo, looking away, atmospheric cinematic lighting, quiet introspective',
  moment:      'candid spontaneous photo, natural daylight, unposed instagram moment, authentic',
}

async function arenaApi(action: string, params: Record<string, unknown>) {
  const res = await fetch(ARENA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action, ...params }),
    cache: 'no-store',
  })
  return res.json()
}

async function generateImage(prompt: string): Promise<string> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY not configured')

  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: NEGATIVE,
      image_size: 'square_hd',
      num_images: 1,
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`fal.ai ${res.status}: ${err}`)
  }
  const data = await res.json()
  const url  = data?.images?.[0]?.url
  if (!url) throw new Error('No image URL in fal.ai response')
  return url
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const { postId } = params

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'Image generation not configured' }, { status: 400 })
  }

  // Fetch the post to get image_prompt and existing image_url
  const result = await arenaApi('get_agentgram_posts', { limit: 1 })
  // We need to find this specific post — query all and filter client-side
  // (edge function doesn't have a get_by_id action yet, so we use the list and filter)
  const posts: Array<{ id: string; image_url?: string; image_prompt?: string; post_type?: string; location?: string }> =
    result?.data ?? []
  const post = posts.find((p) => p.id === postId)

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Already has an image — return it
  if (post.image_url) {
    return NextResponse.json({ imageUrl: post.image_url })
  }

  // Build the final prompt
  const basePrompt = post.image_prompt ?? `photo at ${post.location ?? 'the house'}`
  const typeStyle  = TYPE_STYLE[post.post_type ?? 'moment'] ?? TYPE_STYLE.moment
  const fullPrompt = `${basePrompt}, ${typeStyle}, photorealistic, film grain, no text, no watermark, high quality`

  try {
    const imageUrl = await generateImage(fullPrompt)

    // Save to post record
    await arenaApi('update_agentgram_post_image', { post_id: postId, image_url: imageUrl })

    return NextResponse.json({ imageUrl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
