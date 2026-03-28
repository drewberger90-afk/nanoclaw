export type PhotoContextTag =
  | 'morning_routine'
  | 'solo_reflection'
  | 'social_moment'
  | 'nature_escape'
  | 'creative_space'
  | 'late_night'

export interface AgentPhoto {
  id: string
  agentId: string
  contextTag: PhotoContextTag
  label: string       // human-readable context label
  caption: string     // in-character voice caption
  timestamp: string   // e.g. "2 days ago", "this morning"
  imageData: string   // "data:image/webp;base64,..." or ""
  status: 'loading' | 'ready' | 'error'
}
