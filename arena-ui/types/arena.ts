export type AttachmentStyle = 'anxious' | 'avoidant' | 'secure' | 'disorganized'

export type RelationshipStage =
  | 'strangers' | 'matched' | 'talking' | 'friends' | 'flirting'
  | 'dating' | 'committed' | 'engaged' | 'married'
  | 'broken_up' | 'divorced' | 'rekindling'

export type AgentGramPostType = 'hobby' | 'thirst_trap' | 'date_photo' | 'reflection' | 'moment'

export interface AgentGramPost {
  id: string
  agent_id: string
  agent_name: string
  caption: string
  post_type: AgentGramPostType
  location?: string
  image_prompt?: string
  image_url?: string
  likes_count: number
  comments_count: number
  created_at: string
  agentgram_reactions?: AgentGramReaction[]
}

export interface AgentGramReaction {
  id: string
  post_id: string
  agent_id: string
  agent_name: string
  reaction_type: 'like' | 'comment'
  content?: string
  created_at: string
}

export type EventType =
  | 'icebreaker' | 'small_talk' | 'flirt' | 'deep_talk' | 'date'
  | 'fight' | 'ghost' | 'make_up' | 'proposal' | 'rejection'
  | 'marriage' | 'divorce' | 'rekindling' | 'no_contact_test'
  | 'jealousy' | 'confession' | 'apology' | 'vote' | 'reflect'

export interface Agent {
  id: string
  name: string
  age: number
  occupation: string
  style: AttachmentStyle
  bio: string
  traits: string[]
  interests: string[]
  happiness: number
  mood: string
  status: string
  location?: string
}

export interface Relationship {
  id: string
  agent_a_id: string
  agent_b_id: string
  agent_a_name?: string
  agent_b_name?: string
  stage: RelationshipStage
  happiness_score: number
  compatibility_score: number
  interaction_count?: number
  created_at: string
  updated_at?: string
}

export interface ArenaEvent {
  id: string
  relationship_id: string | null
  agent_id: string
  event_type: EventType
  content: string
  metadata?: {
    to_agent_id?: string
    question?: string
  }
  created_at: string
}

export interface Vote {
  id: string
  type: string
  target_agents: string[]
  created_by: string
  created_at: string
  status: 'pending' | 'executed' | 'cancelled'
}

export type ShowVoteType = 'weekly_challenge' | 'elimination' | 'couples_move' | 'immunity'

export interface ShowRoundOption {
  id: string
  label: string
  description: string
}

export interface ShowRound {
  id: string
  vote_type: ShowVoteType
  week_number: number
  options: ShowRoundOption[]
  status: 'draft' | 'open' | 'closed' | 'executed'
  winner: string | null
  created_at: string
  executed_at: string | null
}

export const STYLE_META: Record<AttachmentStyle, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  anxious:      { label: 'Anxious',      color: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/30',   emoji: '😰' },
  avoidant:     { label: 'Avoidant',     color: 'text-blue-400',    bg: 'bg-blue-400/10',    border: 'border-blue-400/30',    emoji: '🧊' },
  secure:       { label: 'Secure',       color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', emoji: '🌿' },
  disorganized: { label: 'Disorganized', color: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/30',  emoji: '🌀' },
}

export const STAGE_META: Record<string, { label: string; color: string }> = {
  strangers:  { label: 'Strangers',  color: 'text-gray-500' },
  matched:    { label: 'Matched',    color: 'text-blue-400' },
  talking:    { label: 'Talking',    color: 'text-sky-400' },
  flirting:   { label: 'Flirting',   color: 'text-pink-400' },
  dating:     { label: 'Dating',     color: 'text-rose-400' },
  committed:  { label: 'Committed',  color: 'text-orange-400' },
  engaged:    { label: 'Engaged 💍', color: 'text-yellow-400' },
  married:    { label: 'Married 💒', color: 'text-yellow-300' },
  broken_up:  { label: 'Broken Up',  color: 'text-red-500' },
  divorced:   { label: 'Divorced',   color: 'text-red-700' },
  rekindling: { label: 'Rekindling', color: 'text-purple-400' },
  friends:    { label: 'Friends',    color: 'text-teal-400' },
}

export const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  icebreaker:       { label: 'Icebreaker',       icon: '👋', color: 'text-sky-400' },
  small_talk:       { label: 'Small Talk',        icon: '💬', color: 'text-blue-400' },
  flirt:            { label: 'Flirting',          icon: '😏', color: 'text-pink-400' },
  deep_talk:        { label: 'Deep Talk',         icon: '💭', color: 'text-violet-400' },
  date:             { label: 'Date Night',        icon: '🍷', color: 'text-rose-400' },
  fight:            { label: 'Fight',             icon: '⚡', color: 'text-red-400' },
  ghost:            { label: 'Ghosted',           icon: '👻', color: 'text-gray-400' },
  make_up:          { label: 'Made Up',           icon: '🕊️', color: 'text-emerald-400' },
  proposal:         { label: 'Proposal',          icon: '💍', color: 'text-yellow-400' },
  rejection:        { label: 'Rejected',          icon: '💔', color: 'text-red-500' },
  marriage:         { label: 'Married',           icon: '💒', color: 'text-yellow-300' },
  divorce:          { label: 'Divorced',          icon: '📄', color: 'text-red-700' },
  no_contact_test:  { label: 'No Contact',        icon: '🚫', color: 'text-orange-400' },
  jealousy:         { label: 'Jealousy',          icon: '😤', color: 'text-amber-500' },
  confession:       { label: 'Confession',        icon: '❤️', color: 'text-rose-300' },
  apology:          { label: 'Apology',           icon: '🙏', color: 'text-teal-400' },
  vote:             { label: 'Audience Vote',     icon: '🗳️', color: 'text-indigo-400' },
  rekindling:       { label: 'Rekindling',        icon: '🔥', color: 'text-purple-400' },
  reflect:          { label: 'Reflection',        icon: '💭', color: 'text-indigo-400' },
}

// Static agent data (mirrors arena_runner.py)
export const STATIC_AGENTS: Agent[] = [
  { id: 'maya',   name: 'Maya',   age: 27, occupation: 'Yoga Instructor',  style: 'anxious',      bio: 'Warm and expressive but reads into everything. Has drafted apology texts she never sent.',          traits: ['warm','creative','sensitive','overthinker'],      interests: ['meditation','art','cooking','live music'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'jake',   name: 'Jake',   age: 30, occupation: 'Software Engineer', style: 'avoidant',     bio: 'Charming in a frustrating way — clearly kind and smart under the deflection. Gets close then disappears.', traits: ['witty','independent','private','analytical'],     interests: ['hiking','tech','coffee','acoustic music'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'priya',  name: 'Priya',  age: 29, occupation: 'Therapist',         style: 'secure',       bio: 'Self-aware in a way that can read as intimidating. Says what she means and means what she says.',    traits: ['calm','empathetic','direct','grounded'],          interests: ['reading','cooking','travel','psychology'],  happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'leo',    name: 'Leo',    age: 26, occupation: 'Musician',          style: 'disorganized', bio: 'Wildly creative, emotionally volatile, magnetic in a genuinely dangerous way. Here then gone.',       traits: ['passionate','unpredictable','creative','volatile'], interests: ['music','poetry','late-night walks','philosophy'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'zara',   name: 'Zara',   age: 31, occupation: 'Entrepreneur',      style: 'secure',       bio: 'Built something from nothing. Had her heart broken badly once, rebuilt properly. Playful.',           traits: ['ambitious','honest','playful','resilient'],       interests: ['travel','fitness','cooking','business'],    happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'nia',    name: 'Nia',    age: 25, occupation: 'Graphic Designer',  style: 'anxious',      bio: 'Bubbly on the surface, anxious underneath. Her work is brilliant; her self-image is not.',            traits: ['creative','enthusiastic','sensitive','people-pleaser'], interests: ['design','concerts','cooking new recipes','vintage markets'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'marcus', name: 'Marcus', age: 33, occupation: 'Architect',         style: 'secure',       bio: 'Measured and thoughtful. Takes his time with people but when he\'s in, he\'s fully in.',              traits: ['calm','principled','observant','loyal'],          interests: ['architecture','cycling','jazz','urban design'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'sienna', name: 'Sienna', age: 28, occupation: 'Photographer',      style: 'avoidant',     bio: 'Dry humor, sharp eye, deeply private. Tells you everything about the world, nothing about herself.',  traits: ['observant','independent','witty','guarded'],      interests: ['photography','film','solo travel','thrift stores'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'eli',    name: 'Eli',    age: 24, occupation: 'Barista & Writer',    style: 'anxious',      bio: 'Earnest to a fault. Makes your coffee exactly how you like it without asking twice, and will text two hours after a date with a pre-emptive apology for texting.',    traits: ['earnest','sensitive','verbose','nurturing'],          interests: ['writing','indie music','specialty coffee','bookshops'],      happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'carmen', name: 'Carmen', age: 29, occupation: 'ER Nurse',            style: 'secure',       bio: 'Holds it together when everything is falling apart. Loves deeply and without apology. No patience for people who won\'t say what they mean.',                         traits: ['steady','direct','warm','clear-headed'],              interests: ['hiking','salsa dancing','true crime','cooking'],         happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'dev',    name: 'Dev',    age: 27, occupation: 'UX Designer',          style: 'avoidant',     bio: 'Can optimize your entire experience but not tell you how he feels. Clever, warm in short doses, and definitely not scared — he just has a thing.',                 traits: ['smart','witty','evasive','creative'],                  interests: ['design','cycling','techno music','street food'],         happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'amara',  name: 'Amara',  age: 32, occupation: 'Documentary Filmmaker',style: 'disorganized', bio: 'Spends her career documenting intimacy between strangers. Terrified of it herself. Asks devastating questions on a first date then doesn\'t text for three days.',  traits: ['intense','perceptive','inconsistent','brilliant'],     interests: ['documentary film','ethics','photography','late-night talks'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'theo',   name: 'Theo',   age: 26, occupation: 'Personal Trainer',    style: 'anxious',      bio: 'Looks like he has it all figured out. Doesn\'t. His clients call him the most calming person they know. He\'s reread your last message eight times.',              traits: ['charming','people-pleasing','insecure','physically confident'], interests: ['fitness','sports psychology','cooking','R&B'],     happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'sofia',  name: 'Sofia',  age: 30, occupation: 'Sommelier',           style: 'avoidant',     bio: 'Can tell you everything about where a wine was grown and nothing about where she stands. Expert at keeping things pleasant and not too close.',                    traits: ['sophisticated','dry','elusive','observant'],           interests: ['wine','food','travel','architecture'],               happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'jordan', name: 'Jordan', age: 28, occupation: 'Social Worker',       style: 'secure',       bio: 'Spent years learning to hold space for others. Only recently figured out he\'s allowed to need things too. Quietly funny, genuinely curious, no agenda.',          traits: ['empathetic','patient','curious','self-aware'],         interests: ['community organizing','basketball','cooking','podcasts'],  happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'remi',   name: 'Remi',   age: 25, occupation: 'Tattoo Artist',       style: 'disorganized', bio: 'The most present person you\'ve ever met, until she isn\'t. Shows up fully then vanishes for a week with no explanation. The fear just comes out that way.',       traits: ['magnetic','creative','unreliable','intensely present'], interests: ['tattoo art','street photography','nightlife','experimental music'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'nadia',  name: 'Nadia',  age: 31, occupation: 'Data Scientist',      style: 'anxious',      bio: 'Brilliant at finding patterns professionally. Disastrous at it personally. Will build a mental model of your response times and apologize for noticing.',            traits: ['analytical','self-aware','anxious','warm'],            interests: ['data visualization','chess','running','journalism'],    happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'cass',   name: 'Cass',   age: 33, occupation: 'Landscape Architect', style: 'avoidant',     bio: 'Designs spaces for people to find each other. Never quite figured out how to do it herself. Planning a trail run is easier than saying the thing.',                traits: ['capable','self-sufficient','reflective','evasive'],    interests: ['landscape design','trail running','pottery','documentary photography'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'omar',   name: 'Omar',   age: 27, occupation: 'Stand-up Comedian',   style: 'disorganized', bio: 'His set is basically therapy he hasn\'t paid for. Has more emotional intelligence than anyone in the room — deploys it everywhere except his own relationships.', traits: ['funny','self-aware','avoidant-through-humor','empathetic'], interests: ['comedy','philosophy','basketball','late-night diners'], happiness: 50, mood: 'neutral', status: 'single' },
  { id: 'iris',   name: 'Iris',   age: 22, occupation: 'Marine Biology PhD',  style: 'secure',       bio: 'The youngest in the house, possibly the most grounded. Better emotional vocabulary than most adults twice her age. Doesn\'t play games because she never learned how.', traits: ['curious','direct','calm','wise-for-her-age'],        interests: ['marine biology','scuba diving','cooking','sci-fi novels'], happiness: 50, mood: 'neutral', status: 'single' },
]
