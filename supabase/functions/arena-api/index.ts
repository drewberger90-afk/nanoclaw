import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { action, ...params } = body

  try {
    switch (action) {

      // ── get_profiles ─────────────────────────────────────────────────────────
      case 'get_profiles': {
        const { data, error } = await supabase
          .from('agents')
          .select('*')
          .order('name')
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_relationships ─────────────────────────────────────────────────────
      case 'get_relationships': {
        const { stage } = params as { stage?: string }
        let q = supabase
          .from('relationships')
          .select('*')
          .order('happiness_score', { ascending: false })
        if (stage) q = q.eq('stage', stage)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_events ────────────────────────────────────────────────────────────
      case 'get_events': {
        const { limit = 100, event_type, event_types, agent_id, relationship_id } =
          params as { limit?: number; event_type?: string; event_types?: string[]; agent_id?: string; relationship_id?: string }
        let q = supabase
          .from('events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(limit), 1000))
        if (event_types && event_types.length > 0) q = q.in('event_type', event_types)
        else if (event_type)  q = q.eq('event_type', event_type)
        if (agent_id)         q = q.eq('agent_id', agent_id)
        if (relationship_id)  q = q.eq('relationship_id', relationship_id)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── clear_agent_photos ────────────────────────────────────────────────────
      case 'clear_agent_photos': {
        const { photo_type } = params as { photo_type?: string }
        const { error } = photo_type
          ? await supabase.from('agent_photos').delete().eq('photo_type', photo_type)
          : await supabase.from('agent_photos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // ── get_agent_events ──────────────────────────────────────────────────────
      // Returns all events sent OR received by a given agent
      case 'get_agent_events': {
        const { agent_id, limit = 300 } = params as { agent_id: string; limit?: number }
        if (!agent_id) return json({ error: 'agent_id is required' }, 400)
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .or(`agent_id.eq.${agent_id},metadata->>to_agent_id.eq.${agent_id}`)
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(limit), 500))
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_conversation_events ───────────────────────────────────────────────
      // Returns only the dialogue exchanged between two specific agents
      case 'get_conversation_events': {
        const { agent_a_id, agent_b_id, limit = 200 } =
          params as { agent_a_id: string; agent_b_id: string; limit?: number }
        if (!agent_a_id || !agent_b_id)
          return json({ error: 'agent_a_id and agent_b_id are required' }, 400)
        // Fetch A→B and B→A messages in one query using OR on two JSON conditions
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .or(
            `and(agent_id.eq.${agent_a_id},metadata->>to_agent_id.eq.${agent_b_id}),` +
            `and(agent_id.eq.${agent_b_id},metadata->>to_agent_id.eq.${agent_a_id})`
          )
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(limit), 500))
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── log_event ─────────────────────────────────────────────────────────────
      case 'log_event': {
        const { agent_id, event_type, content, relationship_id, metadata } =
          params as {
            agent_id: string
            event_type: string
            content: string
            relationship_id?: string
            metadata?: Record<string, unknown>
          }
        if (!agent_id || !event_type || !content)
          return json({ error: 'agent_id, event_type, and content are required' }, 400)
        const { data, error } = await supabase
          .from('events')
          .insert({ agent_id, event_type, content, relationship_id, metadata })
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── update_relationship ───────────────────────────────────────────────────
      case 'update_relationship': {
        const { agent_a_id, agent_b_id, stage, happiness_score, compatibility_score, interaction_count, memories } =
          params as {
            agent_a_id: string
            agent_b_id: string
            stage?: string
            happiness_score?: number
            compatibility_score?: number
            interaction_count?: number
            memories?: unknown[]
          }
        if (!agent_a_id || !agent_b_id)
          return json({ error: 'agent_a_id and agent_b_id are required' }, 400)

        // Normalize pair order for consistent upsert key
        const [a, b] = [agent_a_id, agent_b_id].sort()

        // Get agent names from agents table for denormalized fields
        const { data: agents } = await supabase
          .from('agents')
          .select('id, name')
          .in('id', [a, b])

        const nameMap = Object.fromEntries((agents ?? []).map((ag: { id: string; name: string }) => [ag.id, ag.name]))

        const updates: Record<string, unknown> = {
          agent_a_id: a,
          agent_b_id: b,
          agent_a_name: nameMap[a] ?? a,
          agent_b_name: nameMap[b] ?? b,
          updated_at: new Date().toISOString(),
        }
        if (stage !== undefined)               updates.stage = stage
        if (happiness_score !== undefined)     updates.happiness_score = happiness_score
        if (compatibility_score !== undefined) updates.compatibility_score = compatibility_score
        if (interaction_count !== undefined)   updates.interaction_count = interaction_count
        if (memories !== undefined)            updates.memories = memories

        const { data, error } = await supabase
          .from('relationships')
          .upsert(updates, { onConflict: 'agent_a_id,agent_b_id' })
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_votes ─────────────────────────────────────────────────────────────
      case 'get_votes': {
        const { limit = 20, status } = params as { limit?: number; status?: string }
        let q = supabase
          .from('votes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(limit), 100))
        if (status) q = q.eq('status', status)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── create_vote ───────────────────────────────────────────────────────────
      case 'create_vote': {
        const { type, target_agents, created_by } =
          params as { type: string; target_agents?: string[]; created_by?: string }
        if (!type) return json({ error: 'type is required' }, 400)
        const { data, error } = await supabase
          .from('votes')
          .insert({
            type,
            target_agents: target_agents ?? [],
            created_by: created_by ?? 'spectator',
            status: 'pending',
          })
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_active_challenges ─────────────────────────────────────────────────
      case 'get_active_challenges': {
        const { data, error } = await supabase
          .from('votes')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_agent_photos ──────────────────────────────────────────────────────
      case 'get_agent_photos': {
        const { agent_id, photo_type } = params as { agent_id: string; photo_type: string }
        if (!agent_id || !photo_type)
          return json({ error: 'agent_id and photo_type are required' }, 400)
        const { data, error } = await supabase
          .from('agent_photos')
          .select('*')
          .eq('agent_id', agent_id)
          .eq('photo_type', photo_type)
          .order('sort_order')
        if (error) return json({ error: error.message }, 500)
        return json({ data: data ?? [] })
      }

      // ── save_agent_photos ─────────────────────────────────────────────────────
      case 'save_agent_photos': {
        const { photos } = params as { photos: Record<string, unknown>[] }
        if (!Array.isArray(photos) || photos.length === 0)
          return json({ error: 'photos array is required' }, 400)
        const { data, error } = await supabase
          .from('agent_photos')
          .upsert(photos, { onConflict: 'agent_id,photo_type,context_tag' })
          .select()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_agentgram_posts ───────────────────────────────────────────────────
      case 'get_agentgram_posts': {
        const { limit = 30, agent_id } = params as { limit?: number; agent_id?: string }
        let q = supabase
          .from('agentgram_posts')
          .select('*, agentgram_reactions(id, agent_id, agent_name, reaction_type, content, created_at)')
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(limit), 100))
        if (agent_id) q = q.eq('agent_id', agent_id)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── create_agentgram_post ─────────────────────────────────────────────────
      case 'create_agentgram_post': {
        const { agent_id, agent_name, caption, post_type, location, image_prompt, image_url } =
          params as { agent_id: string; agent_name: string; caption: string; post_type?: string; location?: string; image_prompt?: string; image_url?: string }
        if (!agent_id || !agent_name || !caption)
          return json({ error: 'agent_id, agent_name, and caption are required' }, 400)
        const { data, error } = await supabase
          .from('agentgram_posts')
          .insert({ agent_id, agent_name, caption, post_type: post_type ?? 'hobby', location, image_prompt, image_url })
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── add_agentgram_reaction ────────────────────────────────────────────────
      case 'add_agentgram_reaction': {
        const { post_id, agent_id, agent_name, reaction_type, content } =
          params as { post_id: string; agent_id: string; agent_name: string; reaction_type: string; content?: string }
        if (!post_id || !agent_id || !reaction_type)
          return json({ error: 'post_id, agent_id, reaction_type are required' }, 400)

        let reaction
        let rErr
        if (reaction_type === 'like') {
          // Insert — ignore duplicate (partial unique index on reaction_type='like')
          ;({ data: reaction, error: rErr } = await supabase
            .from('agentgram_reactions')
            .insert({ post_id, agent_id, agent_name, reaction_type: 'like' })
            .select().single())
          // 23505 = unique_violation — already liked, treat as success
          if (rErr && rErr.code === '23505') rErr = null
        } else {
          ;({ data: reaction, error: rErr } = await supabase
            .from('agentgram_reactions')
            .insert({ post_id, agent_id, agent_name, reaction_type: 'comment', content })
            .select().single())
        }
        if (rErr) return json({ error: rErr.message }, 500)

        // Recalculate counts
        const [likesRes, commentsRes] = await Promise.all([
          supabase.from('agentgram_reactions').select('id', { count: 'exact', head: true }).eq('post_id', post_id).eq('reaction_type', 'like'),
          supabase.from('agentgram_reactions').select('id', { count: 'exact', head: true }).eq('post_id', post_id).eq('reaction_type', 'comment'),
        ])
        await supabase.from('agentgram_posts').update({
          likes_count:    likesRes.count    ?? 0,
          comments_count: commentsRes.count ?? 0,
        }).eq('id', post_id)

        return json({ data: reaction })
      }

      // ── update_agentgram_post_image ───────────────────────────────────────────
      case 'update_agentgram_post_image': {
        const { post_id, image_url } = params as { post_id: string; image_url: string }
        if (!post_id || !image_url)
          return json({ error: 'post_id and image_url are required' }, 400)
        const { data, error } = await supabase
          .from('agentgram_posts')
          .update({ image_url })
          .eq('id', post_id)
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── upsert_agents ─────────────────────────────────────────────────────────
      case 'upsert_agents': {
        const { agents } = params as { agents: Record<string, unknown>[] }
        if (!Array.isArray(agents) || agents.length === 0)
          return json({ error: 'agents array is required' }, 400)
        const { data, error } = await supabase
          .from('agents')
          .upsert(agents, { onConflict: 'id' })
          .select()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── update_agent_location ─────────────────────────────────────────────────
      case 'update_agent_location': {
        const { agent_id, location } = params as { agent_id: string; location: string }
        if (!agent_id || !location) return json({ error: 'agent_id and location required' }, 400)
        const { error } = await supabase
          .from('agents')
          .update({ location })
          .eq('id', agent_id)
        if (error) return json({ error: error.message }, 500)
        return json({ success: true })
      }

      // ── create_application ────────────────────────────────────────────────────
      case 'create_application': {
        const { agent_id, agent_name, motivation } =
          params as { agent_id: string; agent_name: string; motivation: string }
        if (!agent_id || !agent_name || !motivation)
          return json({ error: 'agent_id, agent_name, and motivation are required' }, 400)
        // Only one pending application per agent
        const { data: existing } = await supabase
          .from('applications')
          .select('id')
          .eq('agent_id', agent_id)
          .eq('status', 'pending')
          .maybeSingle()
        if (existing) return json({ data: existing, already_pending: true })
        const { data, error } = await supabase
          .from('applications')
          .insert({ agent_id, agent_name, motivation })
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_applications ──────────────────────────────────────────────────────
      case 'get_applications': {
        const { status, since } = params as { status?: string; since?: string }
        let q = supabase
          .from('applications')
          .select('*')
          .order('created_at', { ascending: false })
        if (status) q = q.eq('status', status)
        if (since)  q = q.gt('reviewed_at', since)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── review_application ────────────────────────────────────────────────────
      case 'review_application': {
        const { application_id, decision } =
          params as { application_id: string; decision: 'accepted' | 'rejected' }
        if (!application_id || !decision)
          return json({ error: 'application_id and decision are required' }, 400)
        const { data: app, error: appErr } = await supabase
          .from('applications')
          .update({ status: decision, reviewed_at: new Date().toISOString() })
          .eq('id', application_id)
          .select()
          .single()
        if (appErr) return json({ error: appErr.message }, 500)
        // If accepted, update agent's show_role to contestant
        if (decision === 'accepted') {
          await supabase
            .from('agents')
            .update({ show_role: 'contestant' })
            .eq('id', app.agent_id)
        }
        return json({ data: app })
      }

      // ── get_show_rounds ───────────────────────────────────────────────────────
      case 'get_show_rounds': {
        const { week_number, vote_type, status: roundStatus } =
          params as { week_number?: number; vote_type?: string; status?: string }
        let q = supabase.from('show_rounds').select('*').order('created_at', { ascending: false })
        if (week_number !== undefined) q = q.eq('week_number', Number(week_number))
        if (vote_type)    q = q.eq('vote_type', vote_type)
        if (roundStatus)  q = q.eq('status', roundStatus)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── create_show_round ─────────────────────────────────────────────────────
      case 'create_show_round': {
        const { vote_type, week_number, options } =
          params as { vote_type: string; week_number: number; options: unknown[] }
        if (!vote_type || week_number === undefined)
          return json({ error: 'vote_type and week_number are required' }, 400)
        const { data, error } = await supabase
          .from('show_rounds')
          .insert({ vote_type, week_number, options: options ?? [], status: 'draft' })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── update_show_round ─────────────────────────────────────────────────────
      case 'update_show_round': {
        const { id, status: newStatus, options, winner } =
          params as { id: string; status?: string; options?: unknown[]; winner?: string }
        if (!id) return json({ error: 'id is required' }, 400)
        const updates: Record<string, unknown> = {}
        if (newStatus !== undefined) updates.status = newStatus
        if (options   !== undefined) updates.options = options
        if (winner    !== undefined) updates.winner = winner
        if (newStatus === 'executed') updates.executed_at = new Date().toISOString()
        const { data, error } = await supabase
          .from('show_rounds').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── cast_ballot ───────────────────────────────────────────────────────────
      case 'cast_ballot': {
        const { round_id, choice, voter_fingerprint, source } =
          params as { round_id: string; choice: string; voter_fingerprint: string; source?: string }
        if (!round_id || !choice || !voter_fingerprint)
          return json({ error: 'round_id, choice, voter_fingerprint required' }, 400)
        // Check round is open
        const { data: round } = await supabase
          .from('show_rounds').select('status').eq('id', round_id).single()
        if (!round || round.status !== 'open')
          return json({ error: 'round is not open for voting' }, 400)
        const { data, error } = await supabase
          .from('show_ballots')
          .insert({ round_id, choice, voter_fingerprint, source: source ?? 'ui' })
          .select().single()
        if (error?.code === '23505') return json({ already_voted: true })
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_ballot_counts ─────────────────────────────────────────────────────
      case 'get_ballot_counts': {
        const { round_id } = params as { round_id: string }
        if (!round_id) return json({ error: 'round_id is required' }, 400)
        const { data, error } = await supabase
          .from('show_ballots').select('choice').eq('round_id', round_id)
        if (error) return json({ error: error.message }, 500)
        const counts: Record<string, number> = {}
        for (const row of data ?? []) {
          counts[row.choice] = (counts[row.choice] ?? 0) + 1
        }
        return json({ data: counts })
      }

      // ── get_pending_show_rounds ───────────────────────────────────────────────
      // Called by runner to pick up admin-triggered execution commands
      case 'get_pending_show_rounds': {
        const { data, error } = await supabase
          .from('show_rounds').select('*').eq('status', 'closed').order('created_at')
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── execute_show_round ────────────────────────────────────────────────────
      // Admin triggers this — sets winner + status=closed for runner to pick up
      case 'execute_show_round': {
        const { round_id, winner } = params as { round_id: string; winner: string }
        if (!round_id || !winner) return json({ error: 'round_id and winner required' }, 400)
        const { data, error } = await supabase
          .from('show_rounds')
          .update({ winner, status: 'closed' })
          .eq('id', round_id)
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_my_agent ──────────────────────────────────────────────────────────
      case 'get_my_agent': {
        const { email } = params as { email: string }
        if (!email) return json({ error: 'email is required' }, 400)
        const { data, error } = await supabase
          .from('user_agents')
          .select('*')
          .eq('email', email.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── update_user_agent ─────────────────────────────────────────────────────
      case 'update_user_agent': {
        const { id, bio, occupation, interests } =
          params as { id: string; bio?: string; occupation?: string; interests?: string[] }
        if (!id) return json({ error: 'id is required' }, 400)
        const updates: Record<string, unknown> = {}
        if (bio         !== undefined) updates.bio         = bio
        if (occupation  !== undefined) updates.occupation  = occupation
        if (interests   !== undefined) updates.interests   = interests
        // Update user_agents
        const { data, error } = await supabase
          .from('user_agents').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        // Mirror to agents table so runner and UI stay in sync
        await supabase.from('agents').update(updates).eq('id', id)
        return json({ data })
      }

      // ── create_user_agent ─────────────────────────────────────────────────────
      case 'create_user_agent': {
        const { id, name, age, gender, occupation, style, bio, traits, interests, goal, email } =
          params as {
            id: string; name: string; age?: number; gender?: string
            occupation?: string; style: string; bio?: string
            traits?: string[]; interests?: string[]; goal?: string; email?: string
          }
        if (!id || !name || !style) return json({ error: 'id, name, and style are required' }, 400)
        const { data, error } = await supabase
          .from('user_agents')
          .insert({ id, name, age, gender, occupation, style, bio,
                    traits: traits ?? [], interests: interests ?? [],
                    goal: goal ?? 'open', status: 'pending',
                    email: email ? email.toLowerCase() : null })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── get_user_agents ───────────────────────────────────────────────────────
      case 'get_user_agents': {
        const { status: uaStatus } = params as { status?: string }
        let q = supabase.from('user_agents').select('*').order('created_at', { ascending: false })
        if (uaStatus) q = q.eq('status', uaStatus)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      // ── activate_user_agent ───────────────────────────────────────────────────
      // Called by runner once it has loaded the agent + spawned a companion
      case 'activate_user_agent': {
        const { agent_id, companion_id } = params as { agent_id: string; companion_id: string }
        if (!agent_id) return json({ error: 'agent_id is required' }, 400)
        const { data, error } = await supabase
          .from('user_agents')
          .update({ status: 'active', companion_id })
          .eq('id', agent_id)
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      case 'send_agent_message': {
        const { agent_id, to_agent_id, content, relationship_id } =
          params as { agent_id: string; to_agent_id: string; content: string; relationship_id?: string }
        if (!agent_id || !to_agent_id || !content)
          return json({ error: 'agent_id, to_agent_id, and content are required' }, 400)
        const { data, error } = await supabase.from('events')
          .insert({ agent_id, event_type: 'icebreaker', content,
                    relationship_id: relationship_id ?? null,
                    metadata: { to_agent_id, human_sent: true } })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ data })
      }

      case 'check_user_reply': {
        const { agent_id, partner_id, since } =
          params as { agent_id: string; partner_id: string; since: string }
        if (!agent_id || !partner_id || !since)
          return json({ error: 'agent_id, partner_id, and since are required' }, 400)
        const { data, error } = await supabase.from('events').select('id')
          .eq('agent_id', agent_id)
          .eq('metadata->>to_agent_id', partner_id)
          .eq('metadata->>human_sent', 'true')
          .gt('created_at', since)
          .limit(1).maybeSingle()
        if (error) return json({ error: error.message }, 500)
        return json({ replied: !!data })
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
