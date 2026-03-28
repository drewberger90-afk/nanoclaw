import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anon)

const API_URL = process.env.NEXT_PUBLIC_ARENA_API_URL!

async function arenaApi(action: string, params?: Record<string, unknown>) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anon}`,
    },
    body: JSON.stringify({ action, ...params }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`arena-api ${action} failed: ${res.status}`)
  return res.json()
}

export const api = {
  getProfiles:        ()                                                                    => arenaApi('get_profiles'),
  getRelationships:   ()                                                                    => arenaApi('get_relationships'),
  getEvents:          (limit = 100)                                                         => arenaApi('get_events', { limit }),
  getAgentEvents:     (agentId: string, limit = 300)                                        => arenaApi('get_agent_events', { agent_id: agentId, limit }),
  getConversationEvents: (agentAId: string, agentBId: string, limit = 200)                 => arenaApi('get_conversation_events', { agent_a_id: agentAId, agent_b_id: agentBId, limit }),
  getVotes:           (limit = 20)                                                          => arenaApi('get_votes', { limit }),
  createVote:         (d: { type: string; target_agents: string[]; created_by: string })   => arenaApi('create_vote', d),
  getActiveChallenges: ()                                                                   => arenaApi('get_active_challenges'),
  getRelationshipEvents: (relationshipId: string, limit = 500)                             => arenaApi('get_events', { relationship_id: relationshipId, limit }),
  getDateEvents:      (limit = 100)                                                         => arenaApi('get_events', { event_type: 'date', limit }),
  getAgentgramPosts:  (limit = 30, agentId?: string)                                       => arenaApi('get_agentgram_posts', { limit, ...(agentId ? { agent_id: agentId } : {}) }),
  addAgentgramReaction: (d: { post_id: string; agent_id: string; agent_name: string; reaction_type: string; content?: string }) => arenaApi('add_agentgram_reaction', d),
  getApplications:    (status?: string)                                                     => arenaApi('get_applications', status ? { status } : {}),
  reviewApplication:  (applicationId: string, decision: 'accepted' | 'rejected')           => arenaApi('review_application', { application_id: applicationId, decision }),
  getAcceptedApplicationsSince: (since: string)                                             => arenaApi('get_applications', { since }),
  // Show voting
  getShowRounds:      (p?: { week_number?: number; vote_type?: string; status?: string })  => arenaApi('get_show_rounds', p ?? {}),
  createShowRound:    (d: { vote_type: string; week_number: number; options: unknown[] })  => arenaApi('create_show_round', d),
  updateShowRound:    (d: { id: string; status?: string; options?: unknown[]; winner?: string }) => arenaApi('update_show_round', d),
  castBallot:         (d: { round_id: string; choice: string; voter_fingerprint: string; source?: string }) => arenaApi('cast_ballot', d),
  getBallotCounts:    (roundId: string)                                                    => arenaApi('get_ballot_counts', { round_id: roundId }),
  executeShowRound:   (roundId: string, winner: string)                                    => arenaApi('execute_show_round', { round_id: roundId, winner }),
  createUserAgent:    (d: { id: string; name: string; age: number; gender: string; occupation: string; style: string; bio: string; traits: string[]; interests: string[]; goal: string; email?: string }) => arenaApi('create_user_agent', d),
  getUserAgents:      (status?: string)                                                     => arenaApi('get_user_agents', status ? { status } : {}),
  createApplication:  (d: { agent_id: string; agent_name: string; motivation: string })      => arenaApi('create_application', d),
  getMyAgent:         (email: string)                                                        => arenaApi('get_my_agent', { email }),
  updateUserAgent:    (id: string, d: { bio?: string; occupation?: string; interests?: string[] }) => arenaApi('update_user_agent', { id, ...d }),
}
