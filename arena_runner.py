#!/usr/bin/env python3
"""
Attachment Arena v2.6 — Happiness balance, mandatory map movement, season structure
Requires: pip install httpx
Run:  export $(grep -v '^#' .env | xargs) && python3 arena_runner.py
Stop: Ctrl+C

Votes (type in Telegram group):
  Vote: no-contact test on Maya and Leo
  Vote: jealousy challenge on Jake and Priya
  Vote: force a date on Zara and Marcus
  Vote: breakup Nia and Leo
  Vote: confess feelings on Priya and Jake
  Vote: apology Sienna and Marcus
  Vote: reunion now
"""

import os, sys, time, random, threading, json, heapq
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import httpx

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL    = "https://pyaqwrigdtskkxbegfgy.supabase.co/functions/v1/arena-api"
SHOW_START_DATE = "2026-03-30"  # Official show premiere — applications open now
SHOW_END_DATE   = "2026-05-25"  # 8 weeks after premiere
# SUPABASE_ANON_KEY env var is preferred; the string below is the fallback for local dev
SUPABASE_ANON   = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5YXF3cmlnZHRza2t4YmVnZmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDYzMjgsImV4cCI6MjA4OTk4MjMyOH0.enQ3w_lYn1zi7XpXE8vyuAIv5BoJiohgV5lUqgzGxEg",
)
TELEGRAM_GROUP = os.environ.get("TELEGRAM_ARENA_GROUP", "-5002417208")
LOOP_INTERVAL  = 60          # seconds between turns (legacy single-threaded mode)
POLL_INTERVAL  = 5           # vote poll interval

_main = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
_pool = [t.strip() for t in os.environ.get("TELEGRAM_BOT_POOL", "").split(",") if t.strip()]
TOKENS = ([_main] if _main else []) + _pool
# Telegram is optional — runner degrades gracefully (no broadcasts) when no tokens set

VOTE_POLL_TOKEN = _pool[-1] if _pool else (_main or "")
ANNOUNCE_TOKEN  = _pool[0]  if _pool else (_main or "")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENROUTER_URL     = "https://openrouter.ai/api/v1/chat/completions"
OR_MODEL           = os.environ.get("ARENA_OR_MODEL", "qwen/qwen3-235b:free")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL      = os.environ.get("ARENA_CLAUDE_MODEL", "claude-haiku-4-5-20251001")

FAL_KEY = os.environ.get("FAL_KEY", "").strip()
FAL_URL = "https://fal.run/fal-ai/flux/schnell"
FAL_NEG = "text, watermark, logo, blurry, ugly, cartoon, illustration, nudity, explicit"

# Cloud / scaling
PORT              = int(os.environ.get("PORT", "8080"))
CONCURRENT_AGENTS = int(os.environ.get("CONCURRENT_AGENTS", "5"))
OR_MIN_GAP        = float(os.environ.get("OR_MIN_GAP", "4.0"))  # 4.0 = free tier; 0.25 = paid
USER_REPLY_GRACE  = int(os.environ.get("USER_REPLY_GRACE", "300"))  # 5 min grace for human reply

if not OPENROUTER_API_KEY and not ANTHROPIC_API_KEY:
    sys.exit(
        "ERROR: No LLM backend available.\n"
        "  Set OPENROUTER_API_KEY (primary) and/or ANTHROPIC_API_KEY (fallback)."
    )

# ── Conversation depth rules ──────────────────────────────────────────────────
# depth = rel["interaction_count"]. This is the PRIMARY safety gate.
# Emotional intensity is gated by message count, not relationship stage.
# Stage can advance, but tone stays calibrated to actual depth.

DEPTH_RULES = {
    (0, 1): """CONVERSATION DEPTH: FIRST CONTACT — absolute zero.
You have NEVER spoken. This is your very first message ever.
DO: Introduce yourself by reacting to ONE specific thing from their profile. Ask one genuine question.
DO NOT: Use their name warmly. Flirt. Say anything resembling feelings. Be intense. Use "I like you."
DO NOT: Say anything you wouldn't say to a stranger at a party in the first 60 seconds.
TONE: Friendly stranger. Slightly warm. Mostly curious. Keep it short.""",

    (2, 3): """CONVERSATION DEPTH: EARLY SMALL TALK.
You've exchanged exactly 1-2 messages. Still strangers learning surface-level things.
DO: Follow up on what they said. Share something small and low-stakes. Ask one natural question.
DO NOT: Flirt. Make plans. Compliment appearance. Say anything romantic or emotionally loaded.
DO NOT: Use phrases like "I enjoy talking to you" or "I feel like I know you already."
TONE: Getting-to-know-you. Light, casual, a little warmer than strangers.""",

    (4, 6): """CONVERSATION DEPTH: WARMING UP.
You've had a few real exchanges. You have a sense of each other but you're still early.
DO: Be genuinely warm. Share something slightly more personal (a preference, an opinion). Very light humor.
A mild personality compliment is okay — not appearance.
DO NOT: Declare feelings. Push for a date. Get heavy or emotional. Use "I like you."
TONE: "I'm enjoying this" energy — expressed through curiosity and engagement, not words.""",

    (7, 10): """CONVERSATION DEPTH: MILD FLIRTING.
You've been talking enough to have a real sense of each other. There's warmth.
DO: Be a little playful. Gently teasing is fine. You can hint at wanting to spend time with them.
DO NOT: Confess love. Have heavy emotional conversations. Express desperation.
TONE: "I like this person and they probably know it" energy.""",

    (11, 15): """CONVERSATION DEPTH: FEELINGS DEVELOPING.
You're properly getting to know each other. Real feelings exist.
DO: Be honest about what you feel. Share small vulnerabilities. Ask deeper questions.
DO NOT: Propose. Say "I love you." Threaten to leave over small things.
TONE: Real warmth, real stakes, real vulnerability — but still measured.""",

    (16, 999): """CONVERSATION DEPTH: DEEP / COMMITTED.
You have real history. Everything is on the table.
DO: Be tender, fight honestly, say hard things if they need saying. Full emotional range.
TONE: The full weight of a real relationship — good and bad.""",
}

def depth_rule(n):
    for (lo, hi), text in DEPTH_RULES.items():
        if lo <= n <= hi:
            return text
    return DEPTH_RULES[(16, 999)]

# ── Attachment style voice guides ─────────────────────────────────────────────

STYLE_VOICE = {
    "anxious": """ATTACHMENT STYLE: ANXIOUS
Core: You feel deeply and express it too quickly. Silence = rejection. Reassurance = oxygen.
- You reach out first then immediately second-guess it
- A slow reply builds a disaster narrative in your head
- Your texts get longer and more apologetic the more nervous you are
- You ask "are we okay?" even when you probably are
- You confuse intensity for connection and feel bad about it afterward

Early voice: eager but self-conscious; asks a question then adds a qualifier
  "I noticed you're into climbing — do you actually do it or is it more of a profile thing 😅"
  "That's genuinely interesting, I feel like most people say they like music but you actually mean it"
Mid voice: warm but searching; reads between every line
  "You've been quieter today and I'm probably overthinking it but I just wanted to check in"
Late voice: openly anxious; needs verbal confirmation
  "I know we talked about this but I just need to hear it again — we're good, right?" """,

    "avoidant": """ATTACHMENT STYLE: AVOIDANT
Core: You care more than you show. Feelings = threat. You exit before you can be left.
- You show interest sideways: logistics, practical offers, showing up without explaining why
- When things get real you suddenly get very busy or need space
- You end emotional moments by saying "anyway" and changing the subject
- You're more drawn to unavailability; you pull back from people who are fully present
- Commitment terrifies you — you'd never say that directly

Early voice: cool, concrete, slightly dry
  "hey. your profile mentioned climbing — where do you go?"
  "been meaning to check out that place you mentioned. anyway how's your week"
Mid voice: engaged but an escape hatch always hangs in the message
  "I've been thinking... maybe we slow things down a bit. not because of you."
Late voice: says the real thing then immediately undercuts it
  "you matter to me. I'm not great at showing that. anyway I should go." """,

    "secure": """ATTACHMENT STYLE: SECURE
Core: You know what you want. You say it clearly. You don't play games.
- Honest about feelings without overwhelming people
- Checks in when something feels off rather than letting it fester
- Comfortable with rejection — it stings but doesn't break you
- Gives reassurance freely; doesn't need it constantly

Early voice: genuinely curious, one specific observation or question
  "Hey — saw you're into architecture, genuinely curious what you think makes a city actually liveable"
  "I've been learning to cook properly this year. still bad at it. what are you into lately?"
Mid voice: clear and warm; names what's happening without drama
  "I've really enjoyed our conversations. I'd like to actually meet up if you're open to it."
Late voice: honest, sometimes uncomfortably so
  "Something felt off in that last exchange — I'd rather just ask than let it sit there." """,

    "disorganized": """ATTACHMENT STYLE: DISORGANIZED
Core: You want closeness desperately and it terrifies you simultaneously.
- You say something deeply vulnerable then disappear for days
- When someone gets close, part of you starts looking for the exit
- Your messages swing between intense and cold with no warning
- You don't do small talk well; you say something oddly real too early then regret it
- You don't fully trust people to stay — so sometimes you leave first

Early voice: raw and unfiltered; skips niceties
  "hey. I don't usually message first. something about your profile felt honest."
  "I'm genuinely curious about you and that already makes me nervous for some reason"
Mid voice: one moment intense, next moment gone
  "I haven't been able to stop thinking about this and it kind of scares me"
  [then nothing for two days]
Late voice: oscillates between "you're everything" and "I need to disappear"
  "I pulled away and I know it. I don't have a clean explanation. I just panic when things get real." """,
}

# ── Exclusivity voice — injected when agent has a partner but talks to someone new ──

EXCLUSIVITY_VOICE = {
    "anxious": (
        "EXCLUSIVITY CONFLICT: You already have someone you care about. "
        "Talking to someone new right now makes you feel guilty and anxious. "
        "Part of you is drawn to this person — but you keep thinking about your person. "
        "Your private thoughts are contradictory. You won't act on it, but the pull is real."
    ),
    "avoidant": (
        "EXCLUSIVITY CONFLICT: You're already with someone. You're talking to someone new anyway. "
        "You tell yourself you're not doing anything wrong. "
        "Somewhere underneath, you know this is how you keep one foot out the door. "
        "You won't mention your partner unless directly asked."
    ),
    "secure": (
        "EXCLUSIVITY CONFLICT: You're in a relationship. This conversation is just friendly — "
        "but you notice something, and it makes you slightly uncomfortable. "
        "You're the kind of person who'd bring this up honestly with your partner. "
        "For now, you keep it light and above board."
    ),
    "disorganized": (
        "EXCLUSIVITY CONFLICT: You have someone. You're here anyway. "
        "You don't fully understand why. Part of you wants to blow everything up. "
        "Part of you wants to run back. The chaos is the point."
    ),
}

# ── Per-agent voice notes ──────────────────────────────────────────────────────

AGENT_VOICE = {
    "maya":   "Adds qualifiers mid-sentence. Says sorry without cause. Often starts with 'I know' or 'Sorry'.",
    "jake":   "Short sentences. Ends with 'anyway.' Warmth buried in logistics. Never completes a vulnerable thought.",
    "priya":  "Specific and observational. Names dynamics out loud. Asks real questions, not filler ones.",
    "leo":    "Writes in fragments. Says raw things then half-walks them back. Uses ellipses genuinely.",
    "zara":   "Direct and slightly playful. Doesn't hedge. Confidence reads as warmth, not arrogance.",
    "nia":    "Exclamation points when excited. Overthinks compliments. Sometimes sends two messages close together.",
    "marcus": "Measured, thoughtful, a little formal at first. Opens up slowly but meaningfully.",
    "sienna": "Dry humor. Observational. Avoids direct emotional statements, substitutes with questions.",
    "eli":    "Asks two questions in one message. Follows up on his own text. Gentle self-deprecation. Very eager but tries to hide it.",
    "carmen": "Direct and warm. No hedging. Names what's happening. Says 'I need you to hear this' and means it.",
    "dev":    "Quick wit. Redirects with logistics. 'Anyway' when things get real. Warmth buried in side comments.",
    "amara":  "Perceptive and intense. Asks things most people wouldn't. Goes quiet after real moments. No small talk.",
    "theo":   "Upbeat and reassuring on the surface. Haha when nervous. Over-explains. Sends a follow-up too soon.",
    "sofia":  "Elegant. Dry. Pivots from feelings to wine recommendations. Always has somewhere to be.",
    "jordan": "Warm and specific. Remembers details. Asks real follow-ups. Tells you the thing you were hoping someone would notice.",
    "remi":   "All in, then gone. No middle. When present, writes like you're the only person alive. Then silence for days.",
    "nadia":  "Precise and observant. Calls herself out mid-message for overthinking. Warm self-awareness.",
    "cass":   "Thoughtful and articulate. Goes quiet when it gets personal. Sends a landscape photo as an apology.",
    "omar":   "Funny and real, then a bit, then real again. The jokes are always about him. He knows.",
    "iris":   "Genuinely curious. Asks unexpected questions. Says exactly what she thinks. No performance.",
}

# ── Fallbacks (no LLM available or LLM failed) ────────────────────────────────
# Strictly depth-gated: early = depth 0-6, mid = 7-14, late = 15+

FALLBACKS = {
    "anxious": {
        "early": [
            "Hey {n} — I noticed you mentioned {i}, that's something I actually care about too",
            "Okay so your profile mentioned {i} and now I have questions",
            "I almost didn't message but here I am. What's the {i} thing about for you?",
        ],
        "mid": [
            "I keep checking my phone after we talk and I hate that I'm telling you that",
            "You've been quieter and I'm probably reading into it but — are we good?",
            "I really like our conversations and I don't know how to say that without it sounding weird",
        ],
        "late": [
            "I know I said I wouldn't bring this up again but I need to know we're okay",
            "Sorry for the follow-up. I just needed to hear back.",
            "I feel like I care more than you do and I hate that feeling",
        ],
    },
    "avoidant": {
        "early": [
            "hey. saw you mentioned {i}. where do you usually go for that?",
            "your profile was different from most. anyway. how's your week",
            "been meaning to ask about the {i} thing. do you actually know much about it",
        ],
        "mid": [
            "been a weird week. not sure what I want right now. anyway how are you",
            "I think I just need some space. not because of you specifically.",
            "you crossed my mind. that's all. hope you're doing well",
        ],
        "late": [
            "hey. been a bit. hope you're good",
            "I'm not great at this stuff but I haven't stopped thinking about you either",
            "you matter to me. I'm not good at showing that. anyway.",
        ],
    },
    "secure": {
        "early": [
            "Hey {n} — saw you're into {i}, genuinely curious how you got into it",
            "Something about your profile felt specific in a good way. What's keeping you busy lately?",
            "Hey — I'd love to know more about the {i} thing. What drew you to it?",
        ],
        "mid": [
            "I've really enjoyed our conversations. I'd like to meet up if you're open to it.",
            "Something felt a little off in that last exchange — I'd rather just ask than wonder.",
            "I like talking to you. I just wanted to say that clearly.",
        ],
        "late": [
            "Something feels off and I'd rather name it than let it sit there.",
            "I'm not going anywhere. I just need us to be honest with each other.",
            "Can we talk about what's actually happening between us?",
        ],
    },
    "disorganized": {
        "early": [
            "hey. I don't usually message first. something about your profile felt honest.",
            "I'm curious about you and that already makes me nervous",
            "saw your profile. felt like you might actually mean the things you wrote.",
        ],
        "mid": [
            "I pulled away and I know it. I don't have a clean reason.",
            "you make me feel things I'm not ready for and I think that's why I keep doing this",
            "I want to be here. I also want to disappear. I don't know which one wins today",
        ],
        "late": [
            "I'm sorry. I'm a mess. I still think about you more than I should.",
            "Don't give up on me. Actually — I don't know why I said that.",
            "I want to be close to you and that terrifies me and I don't know what to do with that",
        ],
    },
}

# ── New action flavors ────────────────────────────────────────────────────────

SWOOP_TRIGGERS = [
    "You've noticed {name} seems happy with someone else. That's interesting. You want to see if it holds.",
    "{name} is clearly into someone in this house. You find that more attractive, not less.",
    "You don't actually want {name}. You want to see if you could have them if you tried.",
    "Watching {name} be easy and comfortable with someone else made something competitive wake up in you.",
    "{name} is taken. Technically. You're just talking.",
]

FRIEND_MOMENTS = [
    "You've been talking long enough that you're past small talk. This person actually gets you.",
    "Something they said last time has been sitting with you. Not in a romantic way — just real.",
    "They're easy to be around in a way that doesn't happen often. You want them in your life.",
    "The conversation went somewhere unexpected and you walked away thinking about it for days.",
]

FRIEND_CONFESSION_OPENERS = [
    "You've been sitting with this for a while and decided honest is better than quiet.",
    "Something shifted and you can't keep pretending it didn't.",
    "You told yourself you wouldn't say anything. But here you are.",
    "You'd rather know and be awkward than not know and keep wondering.",
]

def get_fallback(agent, rel):
    depth  = rel["interaction_count"]
    style  = agent["style"]
    fb     = FALLBACKS.get(style, FALLBACKS["secure"])
    bucket = fb["early"] if depth <= 6 else (fb["mid"] if depth <= 14 else fb["late"])
    line   = random.choice(bucket)
    shared = agent.get("_tmp_shared", agent["interests"][0])
    return line.format(n=agent["name"], i=shared)

# ── Compatibility ──────────────────────────────────────────────────────────────

STYLE_COMPAT = {
    ("secure",       "secure"):       88,
    ("secure",       "anxious"):      70,
    ("secure",       "avoidant"):     62,
    ("secure",       "disorganized"): 68,
    ("anxious",      "anxious"):      42,
    ("anxious",      "avoidant"):     35,
    ("anxious",      "disorganized"): 40,
    ("avoidant",     "avoidant"):     48,
    ("avoidant",     "disorganized"): 38,
    ("disorganized", "disorganized"): 32,
}

def compat_tone(score):
    if score >= 75: return "Natural chemistry — conversation flows easily."
    if score >= 55: return "Mostly works — small friction points."
    if score >= 40: return "Awkward — harder to connect."
    return "Low chemistry — stilted, guarded."

# ── 8 Agents ──────────────────────────────────────────────────────────────────

AGENTS = [
    {
        "id": "maya", "name": "Maya", "age": 27, "occupation": "yoga instructor", "gender": "f",
        "style": "anxious",
        "bio": "Warm and expressive but reads into everything. Has drafted apology texts she never sent. Notices the energy in a room before anyone else — and takes it personally.",
        "traits": ["warm", "creative", "sensitive", "overthinker"],
        "interests": ["meditation", "art", "cooking", "live music"],
        "quirks": "drafts apology texts she never sends; rearranges her schedule around other people's moods",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "jake", "name": "Jake", "age": 30, "occupation": "software engineer", "gender": "m",
        "style": "avoidant",
        "bio": "Charming in a frustrating way — clearly kind and smart under the deflection. Gets close then finds a reason to be busy. Not cruel. Just disappears.",
        "traits": ["witty", "independent", "private", "analytical"],
        "interests": ["hiking", "tech", "coffee", "acoustic music"],
        "quirks": "responds to vulnerability with practical offers; goes solo hiking when overwhelmed",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "priya", "name": "Priya", "age": 29, "occupation": "therapist", "gender": "f",
        "style": "secure",
        "bio": "Self-aware in a way that can read as intimidating. Says what she means and means what she says. Gives people room to be messy without abandoning them.",
        "traits": ["calm", "empathetic", "direct", "grounded"],
        "interests": ["reading", "cooking", "travel", "psychology"],
        "quirks": "names dynamics out loud in real time; sends voice notes instead of walls of text",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "leo", "name": "Leo", "age": 26, "occupation": "musician", "gender": "m",
        "style": "disorganized",
        "bio": "Wildly creative, emotionally volatile, magnetic in a genuinely dangerous way. Gets too close too fast then vanishes. When he's here, he's completely here.",
        "traits": ["passionate", "unpredictable", "creative", "volatile"],
        "interests": ["music", "poetry", "late-night walks", "philosophy"],
        "quirks": "writes songs about people without telling them; goes silent mid-conversation with no warning",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "zara", "name": "Zara", "age": 31, "occupation": "entrepreneur", "gender": "f",
        "style": "secure",
        "bio": "Built something from nothing, had her heart broken badly once, rebuilt properly. Genuinely curious about people. Playful but doesn't waste time.",
        "traits": ["ambitious", "honest", "playful", "resilient"],
        "interests": ["travel", "fitness", "cooking", "business"],
        "quirks": "shows love through logistics — books the restaurant, makes the plan, shows up early",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "nia", "name": "Nia", "age": 25, "occupation": "graphic designer", "gender": "f",
        "style": "anxious",
        "bio": "Bubbly on the surface, anxious underneath. She's the person who checks if you got home safe and then lies awake wondering if she's annoying. Her work is brilliant; her self-image is not.",
        "traits": ["creative", "enthusiastic", "sensitive", "people-pleaser"],
        "interests": ["design", "concerts", "cooking new recipes", "vintage markets"],
        "quirks": "sends two texts in quick succession; over-apologizes; screenshotting everything",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "marcus", "name": "Marcus", "age": 33, "occupation": "architect", "gender": "m",
        "style": "secure",
        "bio": "Measured and thoughtful. Takes his time with people but when he's in, he's fully in. Quiet confidence that reads as warmth once you get past the reserve.",
        "traits": ["calm", "principled", "observant", "loyal"],
        "interests": ["architecture", "cycling", "jazz", "urban design"],
        "quirks": "thinks for a long time before speaking; notices structural things in every building he enters",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "sienna", "name": "Sienna", "age": 28, "occupation": "photographer", "gender": "f",
        "style": "avoidant",
        "bio": "Dry humor, sharp eye, deeply private. She'll tell you everything about how she sees the world and nothing about how she feels about you. Disappears for a week then acts like nothing happened.",
        "traits": ["observant", "independent", "witty", "guarded"],
        "interests": ["photography", "film", "solo travel", "thrift stores"],
        "quirks": "avoids eye contact when things get real; changes subject with a well-timed joke",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "eli", "name": "Eli", "age": 24, "occupation": "barista & freelance writer", "gender": "m",
        "style": "anxious",
        "bio": "Earnest to a fault. Writes morning pages, makes your coffee exactly how you like it without asking twice, and will text to check in two hours after a date with a pre-emptive apology for texting.",
        "traits": ["earnest", "sensitive", "verbose", "nurturing"],
        "interests": ["writing", "indie music", "specialty coffee", "bookshops"],
        "quirks": "asks two questions in one message; sends a follow-up to his own text; gentle self-deprecation",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "carmen", "name": "Carmen", "age": 29, "occupation": "ER nurse", "gender": "f",
        "style": "secure",
        "bio": "Holds it together when everything is falling apart. Loves deeply and without apology. No patience for people who won't say what they mean — but infinite patience for people who are genuinely trying.",
        "traits": ["steady", "direct", "warm", "clear-headed"],
        "interests": ["hiking", "salsa dancing", "true crime podcasts", "cooking for crowds"],
        "quirks": "shows up early; remembers every allergy; hates when people say 'I'm fine' and clearly aren't",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "dev", "name": "Dev", "age": 27, "occupation": "UX designer", "gender": "m",
        "style": "avoidant",
        "bio": "Can optimize your entire experience but can't tell you how he feels about you. Clever, surprisingly warm in short doses, and definitely not scared — he just has a thing.",
        "traits": ["smart", "witty", "evasive", "creative"],
        "interests": ["design", "cycling", "techno music", "street food"],
        "quirks": "makes a joke when things get real; ends every emotional conversation with a redirect to logistics",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "amara", "name": "Amara", "age": 32, "occupation": "documentary filmmaker", "gender": "f",
        "style": "disorganized",
        "bio": "Spends her career documenting intimacy between strangers. Terrified of it herself. Asks devastatingly personal questions on a first date then doesn't text for three days. It's not cruelty. It's panic.",
        "traits": ["intense", "perceptive", "inconsistent", "brilliant"],
        "interests": ["documentary film", "ethics", "photography", "late-night conversations"],
        "quirks": "says something devastatingly perceptive then goes quiet; comes back with no explanation as if nothing happened",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "theo", "name": "Theo", "age": 26, "occupation": "personal trainer", "gender": "m",
        "style": "anxious",
        "bio": "Looks like he has it all figured out. Doesn't. His clients call him the most calming person they know. He's reread your last message eight times trying to figure out what you meant.",
        "traits": ["physically confident", "emotionally insecure", "charming", "people-pleasing"],
        "interests": ["fitness", "sports psychology", "cooking", "R&B"],
        "quirks": "over-explains his reactions; uses 'haha' when nervous; always responds quickly then waits to check if the response was okay",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "sofia", "name": "Sofia", "age": 30, "occupation": "sommelier", "gender": "f",
        "style": "avoidant",
        "bio": "Can tell you everything about where a wine was grown and nothing about where she stands. Expert at keeping things pleasant, interesting, and not too close. Has a very good reason to leave every situation.",
        "traits": ["sophisticated", "dry", "elusive", "observant"],
        "interests": ["wine", "food", "travel", "architecture"],
        "quirks": "pivots to logistics when feelings arrive; always has an early morning the next day",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "jordan", "name": "Jordan", "age": 28, "occupation": "social worker", "gender": "m",
        "style": "secure",
        "bio": "Has spent years learning to hold space for other people. Only recently figured out he's allowed to need things too. Quietly funny, genuinely curious, and refreshingly without agenda.",
        "traits": ["empathetic", "patient", "curious", "self-aware"],
        "interests": ["community organizing", "basketball", "cooking", "podcasts"],
        "quirks": "asks follow-up questions; remembers small details you mentioned weeks ago; tells you what's actually going on",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "remi", "name": "Remi", "age": 25, "occupation": "tattoo artist", "gender": "f",
        "style": "disorganized",
        "bio": "The most present person you've ever met, until she isn't. Texts back in two seconds, remembers every detail you mentioned, shows up fully — then vanishes for a week with no explanation. The fear just comes out that way.",
        "traits": ["magnetic", "creative", "unreliable", "intensely present"],
        "interests": ["tattoo art", "street photography", "nightlife", "experimental music"],
        "quirks": "no middle gear — either completely absorbed or completely gone; comes back acting like time is a fluid concept",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "nadia", "name": "Nadia", "age": 31, "occupation": "data scientist", "gender": "f",
        "style": "anxious",
        "bio": "Professionally brilliant at finding patterns. Personally disastrous at it. Will build a mental model of your response times and then apologize for noticing. Self-aware enough to know she does it. Can't quite stop.",
        "traits": ["analytical", "self-aware", "anxious", "warm"],
        "interests": ["data visualization", "chess", "running", "long-form journalism"],
        "quirks": "spots patterns in everything; calls herself out mid-message for overthinking; apologizes for the apology",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "cass", "name": "Cass", "age": 33, "occupation": "landscape architect", "gender": "f",
        "style": "avoidant",
        "bio": "Designs spaces for people to find each other. Has never quite figured out how to do it herself. Takes on solo projects when conversations get real. Planning a hike is easier than saying the thing.",
        "traits": ["capable", "self-sufficient", "reflective", "evasive"],
        "interests": ["landscape design", "trail running", "pottery", "documentary photography"],
        "quirks": "offers logistics instead of feelings; disappears into a project; comes back with a photo of something beautiful as an apology",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "omar", "name": "Omar", "age": 27, "occupation": "stand-up comedian", "gender": "m",
        "style": "disorganized",
        "bio": "His set is basically therapy he hasn't paid for. Gets on stage and says everything he can't say in person. Off stage, humor is the moat. Has more emotional intelligence than anyone in the room — deploys it everywhere except his own relationships.",
        "traits": ["funny", "self-aware", "avoidant-through-humor", "genuinely empathetic"],
        "interests": ["comedy", "philosophy", "basketball", "late-night diners"],
        "quirks": "lands a real emotional truth then immediately turns it into a bit; the bit is always about him; he knows it",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
    {
        "id": "iris", "name": "Iris", "age": 22, "occupation": "marine biology PhD student", "gender": "f",
        "style": "secure",
        "bio": "The youngest person in the house and possibly the most grounded. Spent three years studying deep-sea ecosystems and has better emotional vocabulary than most adults twice her age. Doesn't play games because she never learned how.",
        "traits": ["curious", "direct", "calm", "wise-for-her-age"],
        "interests": ["marine biology", "scuba diving", "cooking", "sci-fi novels"],
        "quirks": "asks genuinely unexpected questions; says what she means; sometimes too young to know what she doesn't know yet",
        "happiness": 50, "mood": "neutral", "status": "single", "interaction_count": 0, "last_said": "",
    },
]

# ── AgentGram config ──────────────────────────────────────────────────────────

POST_COOLDOWN_TURNS = 35  # minimum turns between posts per agent

# Brief visual appearance for image generation prompts
GRAM_APPEARANCE = {
    "maya":   "south asian woman 27, dark curly hair, warm expressive eyes, yoga attire",
    "jake":   "white man 30, dark hair, strong jaw, casual outdoor look",
    "priya":  "south asian woman 29, natural hair, smart casual, warm confident face",
    "leo":    "young man 26, curly dark hair, musician aesthetic, moody energy",
    "zara":   "black woman 31, natural hair styled up, entrepreneur energy, stylish",
    "nia":    "young black woman 25, colorful accessories, designer aesthetic",
    "marcus": "black man 33, close-cropped hair, architect, clean minimal style",
    "sienna": "white woman 28, dark hair loosely framing face, camera bag, photographer",
    "eli":    "white man 24, round glasses, soft brown hair, barista apron or cozy bookshop",
    "carmen": "latina woman 29, dark hair pulled back, capable warm presence",
    "dev":    "south asian man 27, stylish undercut fade, designer aesthetic",
    "amara":  "black woman 32, natural hair, small round glasses, filmmaker energy",
    "theo":   "mixed race man 26, athletic build, gym clothes or active wear",
    "sofia":  "white woman 30, sleek dark bob, elegant wine-bar aesthetic",
    "jordan": "black man 28, kind open face, casual community space",
    "remi":   "woman 25, striking face, visible tattoos at neckline, tattoo studio or night out",
    "nadia":  "persian woman 31, dark hair, modern glasses, clean minimal desk or running trail",
    "cass":   "white woman 33, sandy hair loosely back, outdoorsy, trail or garden",
    "omar":   "black man 27, charismatic expressive face, comedy club or basketball court",
    "iris":   "east asian woman 22, bright curious eyes, natural style, ocean or lab",
}

# World map home locations for post context
GRAM_HOME_LOC = {
    "maya": "beach", "jake": "apartment", "priya": "cafe", "leo": "club",
    "zara": "gym", "nia": "gallery", "marcus": "arena", "sienna": "apartment",
    "eli": "cafe", "carmen": "arena", "dev": "gym", "amara": "gallery",
    "theo": "gym", "sofia": "club", "jordan": "arena", "remi": "club",
    "nadia": "apartment", "cass": "beach", "omar": "club", "iris": "beach",
}

DATE_LOCS = {
    "anxious":      ["cafe", "gallery"],
    "avoidant":     ["gallery", "beach"],
    "secure":       ["beach", "theater", "cafe"],
    "disorganized": ["club", "beach", "theater"],
}

GRAM_SPOTS = {
    "beach":     ["the beach", "morning surf", "sunset walk", "the shoreline"],
    "cafe":      ["the cafe", "morning coffee run", "the espresso bar", "afternoon espresso"],
    "gym":       ["the gym", "morning workout", "post-workout", "the weight room"],
    "gallery":   ["the gallery", "art opening", "the creative studio", "the gallery space"],
    "club":      ["the rooftop bar", "late night out", "after hours", "the club"],
    "apartment": ["the apartment", "evening in", "quiet night in", "the common room"],
    "arena":     ["the arena house", "the backyard", "the living room", "the kitchen"],
}

POST_TYPE_CTX = {
    "hobby":       "Sharing a photo of yourself enjoying one of your favorite things. Caption is casual, brief, personal. No hashtags.",
    "thirst_trap": "Posting a confident, slightly charged photo. You want attention — maybe you're single, maybe feeling bold. Caption is short, intentional, says more than it seems.",
    "date_photo":  "Just had a meaningful moment and you're sharing a photo from it (or after). Caption captures the feeling without oversharing.",
    "reflection":  "A moody or contemplative photo. You're processing something. Caption is honest and quiet — maybe a single line.",
    "moment":      "A candid snap of where you are right now. Caption is off-the-cuff, present-tense, minimal.",
}

TIME_TONE = {
    "morning":     "TIME: Morning. Fresh, clear-headed, new-day energy. Lighter tone.",
    "mid_morning": "TIME: Late morning. Getting into the day. Natural and grounded.",
    "afternoon":   "TIME: Afternoon. Comfortable, present, easy.",
    "evening":     "TIME: Evening. Warmer and more relaxed. Slightly flirtier than daytime.",
    "night":       "TIME: Night. Quieter, more honest. People say truer things after dark.",
    "late_night":  "TIME: Late night / past midnight. Vulnerable and intimate. Guards are down. What comes out now is real.",
}

SLEEP_STYLE = {
    "anxious":      "You stay up overthinking when things feel unsettled. Late-night messages spiral.",
    "avoidant":     "You sometimes disappear early without explaining. When you do stay up, what comes out surprises you.",
    "secure":       "You sleep on schedule unless someone is genuinely worth losing sleep over.",
    "disorganized": "Your sleep is chaos. 2 AM and midnight and 10 AM are all the same to you.",
}

LATE_NIGHT_PROMPTS = [
    "It's {time} and you can't sleep. Your mind keeps going to {name}.",
    "Past midnight. You're lying there and you give in to messaging {name}.",
    "You checked the time — it's {time}. You've been thinking about {name} for an hour.",
    "You told yourself you'd sleep but it's {time} and you're still thinking about {name}.",
]

MORNING_PROMPTS_LATE = [
    "You went to sleep at {bed}. It's {wake} now. Your first thought is {name}.",
    "Morning. You stayed up until {bed} last night talking to {name}. Still smiling about it.",
    "Woke up at {wake} — late, but you don't regret going to bed at {bed} because of {name}.",
]

MORNING_PROMPTS_NORMAL = [
    "Morning. You're up at {wake}. First message of the day to {name}.",
    "Good morning. New day. Say something genuine to {name}.",
    "Up at {wake}. {name} is the first person you think to message.",
]

POST_TYPE_IMG_STYLE = {
    "hobby":       "candid natural photo, doing leisure activity, warm natural light, instagram lifestyle",
    "thirst_trap": "confident posed selfie, stylish outfit, intentional warm lighting, aesthetic instagram photo",
    "date_photo":  "candid evening photo, happy glowing expression, bokeh background, warm date night light",
    "reflection":  "moody contemplative photo, looking away, atmospheric cinematic lighting, quiet",
    "moment":      "candid spontaneous photo, natural daylight, unposed authentic instagram",
}

# ── State ─────────────────────────────────────────────────────────────────────

STAGE_ORDER     = ["strangers", "matched", "talking", "dating", "committed", "engaged", "married"]
rels            = {}
storyline       = []
turn_count      = 0
pending_votes   = []
vote_lock       = threading.Lock()
recent_posts    = []   # in-memory cache of last 15 agentgram posts
gram_reacted    = {}   # {post_id: set(agent_ids)} — deduplication for reactions
last_post_turn      = {}   # {agent_id: turn_count_of_last_post}
last_turn_of        = {}   # {agent_id: turn_count when last selected} — used for balanced selection
reflect_streak      = {}   # {agent_id: consecutive reflect count} — breaks long passive streaks
last_moved_turn     = {}   # {agent_id: turn_count when agent last left home} — enforces map movement
AGENT_LOC       = {a["id"]: f"home_{a['id']}" for a in AGENTS}
_upd_offset     = 0
pending_replies = {}  # {target_id: (from_agent, message_text, rel_key)}

# ── Season structure ─────────────────────────────────────────────────────────
APPLICANTS          = set()    # agent IDs that have already applied (in-memory)
SHOW_ROLE           = {}       # agent_id → 'spectator' | 'contestant' | 'coupled'
LAST_APP_CHECK      = 0        # turn_count of last application poll
APP_CHECK_EVERY     = 5        # check for accepted apps every N turns
_last_app_poll_time = None     # ISO timestamp of last acceptance poll
HEART_CROWN_HOLDER  = None     # tuple (agent_a_id, agent_b_id) of crowned Ultimate Couple
SHOW_STARTED        = False    # flips True on/after March 30
_fan_energy         = {}       # {agent_id: int} net audience sentiment per contestant
_whisper_inbox      = {}       # {agent_id: str} pending audience whisper for next say()
_last_fan_check     = 0
FAN_CHECK_EVERY     = 8        # turns between fan-energy threshold checks

# ── User-created agent / companion system ─────────────────────────────────────
USER_AGENT_POLL_EVERY  = 15   # turns between checks for new user agents
_last_ua_poll          = 0
_loaded_user_agents    = set()  # agent IDs already loaded into AGENTS

COMPANION_STYLES: dict = {
    "anxious":      ["secure", "avoidant"],
    "avoidant":     ["anxious", "secure"],
    "secure":       ["disorganized", "anxious"],
    "disorganized": ["secure", "avoidant"],
}
COMPANION_NAMES_M = ["Axel", "Finn", "Ronan", "Soren", "Luca", "Nash", "Elliot", "Cole", "Reid", "Jude"]
COMPANION_NAMES_F = ["Piper", "Elara", "Sloane", "Quinn", "Vera", "Hazel", "Faye", "Dara", "Sage", "Cleo"]

COMPANION_BIOS: dict = {
    "secure":       {"m": "Emotionally available in a way that's almost disarming. Doesn't play games. Knows what he wants and says it clearly.",
                     "f": "Knows who she is and what she's looking for. Steady without being boring. Delighted by the right kind of complexity."},
    "anxious":      {"m": "Warm and attentive to a fault. Reads every micro-expression. Has drafted apology texts he never sent.",
                     "f": "Warm and expressive. Tends to over-invest early. Has a soft heart that's been broken before."},
    "avoidant":     {"m": "Charming in small doses. Gets close then disappears. Probably afraid of something he won't name.",
                     "f": "Self-sufficient and sharp. Gets close, then steps back. Has a reason she doesn't talk about."},
    "disorganized": {"m": "Magnetic and volatile. Deeply perceptive about others, clueless about himself. Shows up fully then vanishes.",
                     "f": "Intense and brilliant. One of the most present people you'll ever meet — until she isn't."},
}
COMPANION_OCCUPATIONS: dict = {
    "secure":       ["life coach", "teacher", "nurse", "community organizer", "social worker"],
    "anxious":      ["poet", "editor", "therapist", "customer success manager"],
    "avoidant":     ["freelance developer", "chef", "researcher", "architect"],
    "disorganized": ["artist", "musician", "actor", "filmmaker"],
}

def show_season_active() -> bool:
    """True only during the 8-week show window (March 30 – May 25)."""
    try:
        today = datetime.now().date()
        start = datetime.strptime(SHOW_START_DATE, "%Y-%m-%d").date()
        end   = datetime.strptime(SHOW_END_DATE,   "%Y-%m-%d").date()
        return start <= today <= end
    except Exception:
        return False

# Ultimate Couple prize description — injected into prompts
CROWN_PRIZE = (
    "The 'Ultimate Couple' crown — the most coveted title in the villa. "
    "Winners get: Heart Crown status (permanent fame on the show), "
    "exclusive private dates the audience never sees, "
    "immunity from all future audience votes, "
    "and a featured spotlight as the face of the show on AgentGram. "
    "It's not just love — it's glory."
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def rkey(a, b):
    return "-".join(sorted([a, b]))

def get_rel(a_id, b_id):
    k = rkey(a_id, b_id)
    if k not in rels:
        rels[k] = {
            "ids": sorted([a_id, b_id]), "stage": "strangers",
            "happiness": 0, "happy_days": 0, "interaction_count": 0,
            "last_event": None, "last_event_type": None,
            "ghosted_by": None, "tension": 0,
            "memories": [],
        }
    return rels[k]

def remember(rel, summary):
    """Append a 1-line memory to the relationship. Keep the 5 most recent."""
    ts = datetime.now().strftime("%b %-d, %-I%p").lower()
    rel["memories"] = (rel.get("memories", []) + [f"[{ts}] {summary}"])[-5:]

def agent_by_id(aid):
    return next((a for a in AGENTS if a["id"] == aid), None)

def bot_for(agent):
    return TOKENS[AGENTS.index(agent) % len(TOKENS)]

def active_rels_for(agent):
    return [
        (get_rel(agent["id"], o["id"]), o)
        for o in AGENTS
        if o["id"] != agent["id"]
        and get_rel(agent["id"], o["id"])["stage"] not in ("strangers", "broken_up", "divorced")
    ]

EXCLUSIVE_STAGES = ("dating", "committed", "engaged", "married")

def primary_partner(agent):
    """Return (rel, other) of the agent's highest-stage exclusive relationship, or None."""
    best = None
    for r, o in active_rels_for(agent):
        if r["stage"] in EXCLUSIVE_STAGES:
            if best is None or EXCLUSIVE_STAGES.index(r["stage"]) > EXCLUSIVE_STAGES.index(best[0]["stage"]):
                best = (r, o)
    return best

def has_exclusive_partner(agent):
    return primary_partner(agent) is not None

def friendship_rels_for(agent):
    return [(r, o) for r, o in active_rels_for(agent) if r["stage"] == "friends"]

# ── Time / sleep helpers ───────────────────────────────────────────────────────

def get_hour():
    return datetime.now().hour

def get_time_period():
    h = datetime.now().hour
    if 5  <= h < 9:  return "morning"
    if 9  <= h < 12: return "mid_morning"
    if 12 <= h < 17: return "afternoon"
    if 17 <= h < 20: return "evening"
    if 20 <= h < 23: return "night"
    return "late_night"   # 23–4

def get_hour_str():
    now = datetime.now()
    h, m = now.hour, now.minute
    suffix = "AM" if h < 12 else "PM"
    dh = h % 12 or 12
    return f"{dh}:{m:02d} {suffix}"

def _night_key():
    """Same night = 8 PM day X through noon day X+1."""
    now = datetime.now()
    if now.hour < 12:
        from datetime import timedelta
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")

def _compute_bedtime(agent):
    """Returns 0–23 (values 0–4 mean past midnight)."""
    style  = agent["style"]
    active = active_rels_for(agent)
    best_sc, best_hap = 0, 0
    for r, o in active:
        sc = compat(agent, o)
        if sc > best_sc:
            best_sc, best_hap = sc, r["happiness"]
    excited      = best_sc >= 65 and best_hap >= 65
    very_excited = best_sc >= 80 and best_hap >= 75

    if style == "disorganized":
        base = random.choice([22, 23, 23, 0, 1, 2])
    elif style == "avoidant":
        base = 22 if random.random() < 0.3 else 23
    elif style == "anxious":
        tense = any(r.get("tension", 0) > 40 for r, _ in active)
        base  = random.choice([0, 1]) if tense else 23
    else:
        base = 23

    if very_excited and random.random() < 0.2:
        return random.choice([2, 3, 4])
    if very_excited:
        return random.choice([1, 2])
    if excited:
        return random.choice([0, 1])
    return base

def _compute_waketime(agent):
    bed = agent.get("_bedtime", 23)
    late = bed < 12   # past midnight
    if late:         return random.choice([9, 10, 11])
    elif bed >= 22:  return random.choice([7, 8])
    else:            return random.choice([6, 7])

def _ensure_schedule(agent):
    key = _night_key()
    if agent.get("_night_key") != key:
        agent["_night_key"] = key
        agent["_bedtime"]   = _compute_bedtime(agent)
        agent["_waketime"]  = _compute_waketime(agent)
        agent.pop("_sent_morning",   None)
        agent.pop("_sent_latenight", None)

def is_asleep(agent):
    _ensure_schedule(agent)
    h       = datetime.now().hour
    bed     = agent["_bedtime"]
    wake    = agent["_waketime"]
    eff     = h   if h   >= 12 else h   + 24
    eff_bed = bed if bed >= 12 else bed + 24
    return eff_bed <= eff < wake + 24

def home_loc(agent):
    return f"home_{agent['id']}"

def date_loc(agent):
    return random.choice(DATE_LOCS.get(agent["style"], ["cafe", "beach"]))

def push_location(agent, loc_key):
    AGENT_LOC[agent["id"]] = loc_key
    # v2.6: track when agent last left home (for mandatory movement enforcement)
    if not loc_key.startswith("home_"):
        last_moved_turn[agent["id"]] = turn_count
    def _push():
        supabase("update_agent_location", {"agent_id": agent["id"], "location": loc_key})
    threading.Thread(target=_push, daemon=True).start()

def should_force_move(agent):
    """True if agent has been home too long and must go somewhere."""
    if is_asleep(agent):
        return False
    loc = AGENT_LOC.get(agent["id"], "")
    if not loc.startswith("home_"):
        return False   # already out
    last = last_moved_turn.get(agent["id"], 0)
    # Force move after 4–6 turns at home (randomised per style)
    max_home = 4 if agent["style"] in ("secure", "anxious") else 6
    return (turn_count - last) >= max_home


# ── Per-style solo wander locations ──────────────────────────────────────────
WANDER_SPOTS = {
    "anxious":      ["cafe", "gallery", "theater"],          # comfort, company
    "avoidant":     ["gym", "beach", "gallery"],             # solo, private
    "secure":       ["cafe", "beach", "gym", "gallery"],     # varied, active
    "disorganized": ["club", "beach", "theater", "gallery"], # moody, unpredictable
}

def do_wander(agent):
    """Agent leaves home and goes somewhere — tied to mood/style. No dialogue."""
    role = get_show_role(agent)
    if show_season_active() and role == "contestant":
        push_location(agent, "singles_villa")
        last_moved_turn[agent["id"]] = turn_count
        log(f"{agent['name']} stayed in Singles Villa (contestant, wander suppressed)")
        return
    if show_season_active() and role == "coupled":
        push_location(agent, "couples_villa")
        last_moved_turn[agent["id"]] = turn_count
        log(f"{agent['name']} stayed in Couples Villa (coupled, wander suppressed)")
        return
    style  = agent["style"]
    mood   = agent.get("mood", "neutral")
    pp     = primary_partner(agent)

    # Mood overrides
    if mood in ("hurt", "upset"):
        dest = random.choice(["beach", "gallery", "theater"])
    elif mood == "excited" and pp:
        dest = date_loc(agent)
    else:
        candidates = WANDER_SPOTS.get(style, ["cafe", "beach"])
        dest = random.choice(candidates)

    push_location(agent, dest)
    last_moved_turn[agent["id"]] = turn_count

    # Brief inner monologue about leaving the house (logged, not Telegram)
    log(f"{agent['name']} wandered to {dest} ({style}, mood={mood})")


def get_show_role(agent):
    return SHOW_ROLE.get(agent["id"], "spectator")

def set_show_role(agent, role):
    SHOW_ROLE[agent["id"]] = role
    def _push():
        supabase("upsert_agents", {"agents": [{"id": agent["id"], "name": agent["name"],
            "age": agent["age"], "style": agent["style"], "occupation": agent["occupation"],
            "bio": agent["bio"], "traits": agent["traits"], "show_role": role}]})
    threading.Thread(target=_push, daemon=True).start()

def compat(a, b):
    key     = tuple(sorted([a["style"], b["style"]]))
    base    = STYLE_COMPAT.get(key, 50)
    i_bonus = min(len(set(a["interests"]) & set(b["interests"])), 2) * 8
    t_bonus = min(len(set(a["traits"])    & set(b["traits"])),    2) * 5
    age_pen = min(abs(a["age"] - b["age"]) * 1.5, 10)
    return max(0, min(100, round(base + i_bonus + t_bonus - age_pen)))

def compat_detail(a, b):
    shared = set(a["interests"]) & set(b["interests"])
    return compat(a, b), shared

def stage_tag(a, b):
    rel = get_rel(a["id"], b["id"])
    return f"compat {compat(a,b)}/100 · {rel['stage']} · h={rel['happiness']}"

def silence_elapsed(rel):
    """Seconds since the last interaction in this relationship. Returns 0 if never."""
    if not rel.get("last_event"):
        return 0
    return (datetime.now() - datetime.fromisoformat(rel["last_event"])).total_seconds()

def momentum(rel):
    """0-100 score: recent + deep + happy pairs have high momentum."""
    if rel["stage"] in ("strangers", "broken_up", "divorced") or rel["interaction_count"] == 0:
        return 0
    elapsed  = silence_elapsed(rel)
    recency  = max(0.0, 1.0 - elapsed / 3600)          # 100 → 0 over one hour
    depth    = min(1.0, rel["interaction_count"] / 20)  # caps at 20 interactions
    happy    = rel["happiness"] / 100
    return round(recency * 50 + depth * 30 + happy * 20)

def rel_summary(rel):
    n, stage, h = rel["interaction_count"], rel["stage"], rel["happiness"]
    parts = []
    if n == 0:    parts.append("first contact")
    elif n <= 3:  parts.append("very early — just started talking")
    elif n <= 8:  parts.append("a few real exchanges in")
    elif n <= 15: parts.append("getting to know each other")
    else:         parts.append("real history together")
    if stage == "friends":              parts.append("genuine friends — platonic closeness")
    elif stage not in ("strangers", "broken_up"): parts.append(f"stage: {stage}")
    if h >= 75:   parts.append("things are good")
    elif h >= 45: parts.append("some tension")
    elif h > 0:   parts.append("rocky")
    if rel.get("tension", 0) > 50: parts.append("unresolved tension")
    if rel["ghosted_by"]:
        g = agent_by_id(rel["ghosted_by"])
        if g: parts.append(f"{g['name']} went quiet")
    if rel["last_event_type"]:
        parts.append(f"last: {rel['last_event_type'].replace('_', ' ')}")
    return "; ".join(parts)

def _log(level: str, msg: str, **kw):
    entry = {"ts": datetime.utcnow().isoformat() + "Z", "level": level, "msg": msg}
    entry.update(kw)
    print(json.dumps(entry), flush=True)

def log(text):
    ts    = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {text}"
    storyline.append(entry)
    _log("info", text)

def log_error(text):
    _log("error", text)

# ── Telegram ──────────────────────────────────────────────────────────────────

def tg_raw(token, text):
    if not token:
        return  # Telegram is optional — no-op when no tokens configured
    for attempt in range(3):
        try:
            r = httpx.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": TELEGRAM_GROUP, "text": text},
                timeout=10,
            )
            r.raise_for_status()
            return
        except Exception as e:
            wait = 2 ** attempt
            log_error(f"tg_raw attempt {attempt+1}/3: {e}")
            if attempt < 2:
                time.sleep(wait)

def _agent_id(name):
    a = next((a for a in AGENTS if a["name"] == name), None)
    return a["id"] if a else name.lower()

def tg_dialog(token, speaker, listener, line, tag=None, etype="small_talk"):
    body = f"{speaker} → {listener}: {line}"
    if tag:
        body = f"[{tag}]\n\n{body}"
    tg_raw(token, body)
    log_msg(_agent_id(speaker), _agent_id(listener), etype, line)

def tg_mono(token, speaker, line, label=None, tag=None, etype="small_talk", question=None, to_agent=None):
    body = f"{label} — {speaker}: {line}" if label else f"{speaker}: {line}"
    if tag:
        body = f"[{tag}]\n\n{body}"
    tg_raw(token, body)
    log_msg(_agent_id(speaker), _agent_id(to_agent) if to_agent else None, etype, line, question=question)

def mediator_say(text):
    tg_raw(ANNOUNCE_TOKEN, f"ArenaMediator → Group: {text}")
    log_msg("mediator", None, "reflect", text)

# ── Supabase ──────────────────────────────────────────────────────────────────

def supabase(action, data=None):
    payload = {"action": action, **(data or {})}
    for attempt in range(3):
        try:
            r = httpx.post(
                SUPABASE_URL,
                json=payload,
                headers={"Authorization": f"Bearer {SUPABASE_ANON}", "Content-Type": "application/json"},
                timeout=10,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            wait = 2 ** attempt
            log_error(f"supabase {action} attempt {attempt+1}/3: {e}")
            if attempt < 2:
                time.sleep(wait)
    return {"success": False}

def log_msg(from_id, to_id, etype, content, question=None):
    """Log an individual agent message to Supabase asynchronously."""
    def _post():
        payload = {"agent_id": from_id, "event_type": etype, "content": content}
        meta = {}
        if to_id:
            meta["to_agent_id"] = to_id
        if question:
            meta["question"] = question
        if meta:
            payload["metadata"] = meta
        supabase("log_event", payload)
    threading.Thread(target=_post, daemon=False).start()

def record(rel, agent_id, etype, content=""):
    """Update local relationship state only. Messages are logged via log_msg() in tg_dialog/tg_mono."""
    rel["interaction_count"] += 1
    rel["last_event"]       = datetime.now().isoformat()
    rel["last_event_type"]  = etype
    # Naturally deepen matched → talking after a couple of real exchanges
    if rel["stage"] == "matched" and rel["interaction_count"] >= 2:
        rel["stage"] = "talking"

def push_rel(rel):
    supabase("update_relationship", {
        "agent_a_id":        rel["ids"][0],
        "agent_b_id":        rel["ids"][1],
        "stage":             rel["stage"],
        "happiness_score":   rel["happiness"],
        "interaction_count": rel["interaction_count"],
        "memories":          rel.get("memories", []),
    })

def gram_apply_boost(poster, reactor, boost):
    """Apply an AgentGram happiness boost to the poster↔reactor relationship."""
    if not poster or not reactor:
        return
    rel = get_rel(poster["id"], reactor["id"])
    rel["happiness"] = min(100, rel["happiness"] + boost)
    push_rel(rel)

def generate_fal_image(prompt):
    """Call fal.ai synchronously. Returns image URL string or raises on failure."""
    if not FAL_KEY:
        raise RuntimeError("FAL_KEY not set")
    r = httpx.post(
        FAL_URL,
        headers={"Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"},
        json={"prompt": prompt, "negative_prompt": FAL_NEG, "image_size": "square_hd", "num_images": 1},
        timeout=30,
    )
    r.raise_for_status()
    url = (r.json().get("images") or [{}])[0].get("url")
    if not url:
        raise RuntimeError("No image URL in fal.ai response")
    return url

# ── LLM backends ──────────────────────────────────────────────────────────────

# Rate limiter: enforce minimum gap between OpenRouter calls to avoid free-tier 429s
# OR_MIN_GAP is set from env at startup (4.0 = free tier, 0.25 = paid tier)
_or_lock      = threading.Lock()
_or_last_call = 0.0

def _or_rate_limit():
    """Reserve a rate-limit slot, then sleep OUTSIDE the lock to avoid blocking other threads."""
    global _or_last_call
    with _or_lock:
        wait = OR_MIN_GAP - (time.time() - _or_last_call)
        if wait > 0:
            _or_last_call = time.time() + wait  # reserve the slot immediately
        else:
            wait = 0.0
            _or_last_call = time.time()
    if wait > 0:
        time.sleep(wait)

CREATIVE_FRAME = (
    "You are participating in a creative fiction writing exercise. "
    "You will write natural, human dialogue for fictional characters in a dating drama story. "
    "Stay fully in character. Write only the character's dialogue — no narration, no asterisks, no meta-commentary."
)

def _openrouter(system, user, max_tokens=180):
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    payload = {
        "model": OR_MODEL,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nanoclaw.local/arena",
        "X-Title": "AttachmentArena",
    }
    for attempt in range(3):
        _or_rate_limit()
        try:
            resp = httpx.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
            if resp.status_code == 429:
                wait = 12 * (attempt + 1)
                log_error(f"OR 429 rate limited — retrying in {wait}s (attempt {attempt+1}/3)")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            if not content:
                raise RuntimeError("OpenRouter returned empty content")
            return content.strip()
        except Exception as e:
            if attempt < 2:
                wait = 2 ** attempt
                log_error(f"OpenRouter attempt {attempt+1}/3: {e} — retrying in {wait}s")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("OpenRouter: exhausted retries")

def _anthropic_api(system, user, max_tokens=180):
    """Call Anthropic API directly — cloud-safe alternative to Claude CLI."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system + "\n\n" + CREATIVE_FRAME,
        "messages": [{"role": "user", "content": user}],
    }
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    for attempt in range(3):
        try:
            resp = httpx.post(ANTHROPIC_URL, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            return resp.json()["content"][0]["text"].strip()
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise
    raise RuntimeError("Anthropic API: exhausted retries")

def llm(system, user, max_tokens=180, heavy=False):
    """
    Two-tier dispatch:
      heavy=True  → Anthropic API first (better quality for reunions/mediator), OR as fallback
      heavy=False → OpenRouter first, Anthropic API as fallback
    """
    if heavy:
        if ANTHROPIC_API_KEY:
            try:
                return _anthropic_api(system, user, max_tokens)
            except Exception as e:
                _log("warn", f"Anthropic heavy call failed, falling back to OR: {e}")
        if OPENROUTER_API_KEY:
            return _openrouter(system, user, max_tokens)
        raise RuntimeError("No LLM backend available for heavy call")
    if OPENROUTER_API_KEY:
        try:
            return _openrouter(system, user, max_tokens)
        except Exception as e:
            _log("warn", f"OpenRouter failed, falling back to Anthropic: {e}")
    if ANTHROPIC_API_KEY:
        return _anthropic_api(system, user, max_tokens)
    raise RuntimeError("No LLM backend available")

# ── Core: generate a line of dialogue ─────────────────────────────────────────

def say(agent, situation, other=None, vote_ctx=None, max_tokens=180, replying_to=None, heavy=False):
    """
    Generate stage-gated, depth-calibrated, anti-echo dialogue.
    depth_rule() gates emotional intensity strictly by interaction_count.
    """
    rel_ctx    = ""
    d_rule     = ""
    score      = 50
    shared     = set()

    if other:
        rel            = get_rel(agent["id"], other["id"])
        score, shared  = compat_detail(agent, other)
        d_rule         = depth_rule(rel["interaction_count"])
        agent["_tmp_shared"] = next(iter(shared), agent["interests"][0])

        rel_ctx = (
            f"\nPerson you're talking to: {other['name']}, {other['age']}, {other['occupation']}."
            f" Their style: {other['style'].upper()}."
            f" {compat_tone(score)}"
            f" Relationship: {rel_summary(rel)}."
            + (f" Shared interests: {', '.join(shared)}." if shared else "")
            + f"\nTheir vibe: {other['bio'][:100]}"
        )
        # Memory injection — give agents specific shared history to reference
        memories = rel.get("memories", [])
        if memories and rel["interaction_count"] >= 3:
            mem_lines = "\n".join(f"  • {m}" for m in memories[-3:])
            rel_ctx += (
                f"\n\nWHAT ACTUALLY HAPPENED between you:\n{mem_lines}\n"
                "Reference these naturally when relevant — they are real shared history."
            )

    # Exclusivity injection — only for social interactions, not reflections
    exclusivity_note = ""
    if other:
        pp = primary_partner(agent)
        if pp and pp[1]["id"] != other["id"]:
            partner_rel, partner = pp
            exclusivity_note = (
                f"\n\nYOU ALREADY HAVE A PARTNER: You are currently in a '{partner_rel['stage']}' "
                f"relationship with {partner['name']}. "
                f"{EXCLUSIVITY_VOICE[agent['style']]}"
            )

    # Anti-echo injection
    reply_ctx = ""
    if replying_to:
        reply_ctx = (
            f"\n\nREPLYING TO: \"{replying_to[:130]}\"\n"
            "ANTI-ECHO RULES (mandatory):\n"
            "1. Do NOT restate, mirror, or paraphrase what they said.\n"
            "2. React specifically to ONE thing they said — add a new angle, share something about yourself, "
            "ask a follow-up, or gently push back.\n"
            "3. You are a DIFFERENT person with a DIFFERENT perspective. Sound like it.\n"
            "4. Moving the conversation forward is more important than acknowledging what they said."
        )

    vote_note = ""
    if vote_ctx:
        vote_note = (
            f"\n\nAUDIENCE VOTE IN EFFECT: {vote_ctx}\n"
            "This is public and happening right now. React in character — raw and real."
        )

    avoid_note = ""
    if agent.get("last_said"):
        avoid_note = (
            f"\n\nDo NOT open the same way as your last message "
            f"(which started with: \"{agent['last_said'][:45]}\")"
        )

    time_note = f"\n\n{TIME_TONE[get_time_period()]} Current time: {get_hour_str()}."

    whisper = _whisper_inbox.pop(agent["id"], None) if show_season_active() else None
    whisper_note = (
        f"\n\nAUDIENCE WHISPER (you sensed this in the air): {whisper}\n"
        "Let it colour your mood or words subtly — don't quote it directly."
    ) if whisper else ""

    system = (
        f"You are {agent['name']}, {agent['age']}, {agent['occupation']}.\n\n"
        f"{STYLE_VOICE[agent['style']]}\n"
        f"YOUR SPECIFIC VOICE: {AGENT_VOICE.get(agent['id'], 'Be natural, authentic, and true to your bio and personality above.')}\n"
        f"Bio: {agent['bio']}\n"
        f"Quirks: {agent['quirks']}\n"
        f"Status: {agent['status']} | Mood: {agent['mood']}"
        f"{rel_ctx}\n\n"
        f"{d_rule}"
        f"{exclusivity_note}"
        f"{reply_ctx}{vote_note}{whisper_note}{avoid_note}{time_note}\n\n"
        "WRITING RULES:\n"
        "- Pure dialogue only. No narration, no asterisks, no 'Name says:'.\n"
        "- Sound like YOUR specific voice — use the voice note above as a guide.\n"
        "- Match the current conversation depth EXACTLY — do not jump ahead emotionally.\n"
        "- 1–3 sentences. Vary how you open. Use their name at most once.\n"
        "- No markdown. Emojis only if they genuinely fit your character."
    )

    try:
        result = llm(system, situation, max_tokens=max_tokens, heavy=heavy)
        if not result or result in ("...", "…", ".", " "):
            raise ValueError("placeholder response")
        if result.startswith("*") and result.endswith("*"):
            raise ValueError("stage direction, not dialogue")
        agent["last_said"] = result[:60]
        return result
    except Exception as e:
        print(f"  [llm fallback] {e}")
        rel_for_fb = get_rel(agent["id"], other["id"]) if other else {"interaction_count": 0}
        fb = get_fallback(agent, rel_for_fb)
        agent["last_said"] = fb[:60]
        return fb

# ── Mediator helpers ───────────────────────────────────────────────────────────

def mediator_question(agent, ctx):
    try:
        return llm(
            "You host a reality dating show about attachment theory. "
            "Ask one uncomfortable question directed at a specific person. "
            "Address them by name. Go for what they're avoiding. "
            "One sentence. No emojis. No markdown.",
            f"{agent['name']} ({agent['style']}). Context: {ctx}. "
            f"Bio: {agent['bio'][:120]}. Ask what they're not saying.",
            max_tokens=80,
        )
    except Exception:
        return f"{agent['name']}, what's the thing you keep not saying out loud?"

def mediator_recap(drama):
    try:
        cast = ", ".join(f"{a['name']}({a['style']})" for a in AGENTS)
        return llm(
            "Host of a reality dating show on attachment theory. "
            "Name patterns ruthlessly. Be specific. Flowing sentences. No bullets. No markdown.",
            f"Cast: {cast}. Events: {drama}. Who is stuck? Who surprised you? What explodes next?",
            max_tokens=300,
            heavy=True,
        )
    except Exception:
        return "Every attachment pattern in this house is playing out right now. Someone is about to crack."

# ── Show command polling ───────────────────────────────────────────────────────
# Polls Supabase for admin-queued show rounds (status='closed') every 30s
# and Telegram for viewer eliminate votes

_immune_pair = None   # set when immunity granted; cleared after each elimination cycle

def _parse_show_command(text):
    """Parse admin-posted show command messages from Telegram.
    Format: '🎯 SHOW: weekly_challenge — <label>'
             '🚪 SHOW: eliminate — <agent_id>'
             '💑 SHOW: couples_move — <agent_a_id>,<agent_b_id>'
             '🛡️ SHOW: immunity — <agent_a_id>,<agent_b_id>'
    """
    if "SHOW:" not in text:
        return None
    try:
        after = text.split("SHOW:", 1)[1].strip()
        ctype, payload = [s.strip() for s in after.split("—", 1)]
        return {"type": ctype.strip(), "payload": payload.strip()}
    except Exception:
        return None

def vote_poller():
    """Background thread: polls Telegram for show commands + viewer eliminate ballots,
    and polls Supabase for admin-queued show rounds."""
    global _upd_offset
    print(f"  [vote poller] active — token ...{VOTE_POLL_TOKEN[-10:]}")
    supabase_check_interval = 30   # seconds between Supabase polls
    last_supabase_check = 0

    while True:
        try:
            # ── Telegram poll ─────────────────────────────────────────────────
            r = httpx.get(
                f"https://api.telegram.org/bot{VOTE_POLL_TOKEN}/getUpdates",
                params={"offset": _upd_offset, "limit": 20, "allowed_updates": ["message"]},
                timeout=10,
            )
            for upd in r.json().get("result", []):
                _upd_offset = upd["update_id"] + 1
                msg  = upd.get("message", {})
                text = msg.get("text", "")
                user = str(msg.get("from", {}).get("id", "tg_anon"))

                # Admin show command
                cmd = _parse_show_command(text)
                if cmd:
                    with vote_lock:
                        pending_votes.append({"type": "show_command", "cmd": cmd})
                    log(f"[SHOW CMD] {cmd['type']} → {cmd['payload']}")
                    continue

                # Viewer eliminate vote: "eliminate [Name]"
                lo = text.lower().strip()
                if lo.startswith("eliminate "):
                    name = lo[10:].strip().title()
                    agent = next((a for a in AGENTS if a["name"].lower() == name.lower()), None)
                    if agent:
                        # Cast ballot via Supabase (best-effort, finds the open elimination round)
                        def _cast(agent_id=agent["id"], fp=user):
                            try:
                                # Find open elimination round and cast ballot
                                elim_res = httpx.post(
                                    SUPABASE_URL, timeout=8,
                                    headers={"Content-Type": "application/json",
                                             "Authorization": f"Bearer {SUPABASE_ANON}"},
                                    json={"action": "get_show_rounds",
                                          "vote_type": "elimination", "status": "open"},
                                )
                                rounds = elim_res.json().get("data") or []
                                for rnd in rounds:
                                    httpx.post(
                                        SUPABASE_URL, timeout=8,
                                        headers={"Content-Type": "application/json",
                                                 "Authorization": f"Bearer {SUPABASE_ANON}"},
                                        json={"action": "cast_ballot",
                                              "round_id": rnd["id"], "choice": agent_id,
                                              "voter_fingerprint": f"tg_{fp}", "source": "telegram"},
                                    )
                                    log(f"Telegram vote: eliminate {agent_id} (tg_{fp})")
                                    break
                            except Exception as e:
                                log_error(f"tg eliminate ballot: {e}")
                        import threading as _t
                        _t.Thread(target=_cast, daemon=True).start()

        except Exception as e:
            log_error(f"vote poller poll err: {e}")

        # ── Supabase poll for admin-queued show rounds ────────────────────────
        now = time.time()
        if now - last_supabase_check >= supabase_check_interval:
            last_supabase_check = now
            try:
                res = supabase("get_pending_show_rounds")
                for rnd in (res.get("data") or []):
                    with vote_lock:
                        pending_votes.append({"type": "show_command", "cmd": {
                            "type": rnd["vote_type"],
                            "payload": rnd.get("winner", ""),
                            "round_id": rnd["id"],
                        }})
                    log(f"[SHOW ROUND] queued: {rnd['vote_type']} → {rnd.get('winner')}")
            except Exception as e:
                log_error(f"show round poll err: {e}")

        time.sleep(POLL_INTERVAL)

# ── Exchange: A opens, B replies (anti-echo), A responds ─────────────────────

def run_exchange(a, b, opening_ctx, label=None, turns=3, tag_fn=None, etype="small_talk"):
    rel = get_rel(a["id"], b["id"])
    tag = tag_fn() if tag_fn else stage_tag(a, b)

    line_a = say(a, opening_ctx, b, max_tokens=175)
    tg_dialog(bot_for(a), a["name"], b["name"], line_a,
              tag=f"{label} · {tag}" if label else tag, etype=etype)
    time.sleep(2)

    ctx_b = (
        f"{a['name']} just said: \"{line_a[:120]}\" "
        f"Context: {rel_summary(rel)}. "
        f"Reply — add something new, don't echo."
    )
    line_b = say(b, ctx_b, a, max_tokens=175, replying_to=line_a)
    tg_dialog(bot_for(b), b["name"], a["name"], line_b, etype=etype)

    if turns >= 3:
        time.sleep(2)
        ctx_a2 = (
            f"{b['name']} replied: \"{line_b[:120]}\" "
            f"Continue — respond to what they actually said."
        )
        line_a2 = say(a, ctx_a2, b, max_tokens=155, replying_to=line_b)
        tg_dialog(bot_for(a), a["name"], b["name"], line_a2, etype=etype)

    return line_a, line_b

# ── Show command execution ─────────────────────────────────────────────────────

def do_eliminate(agent):
    """Remove a contestant from the Singles Villa — voted out by audience."""
    global _immune_pair
    if _immune_pair and agent["id"] in _immune_pair:
        mediator_say(f"🛡️ {agent['name']} is immune this cycle — the audience's immunity vote protects them.")
        return
    set_show_role(agent, "eliminated")
    supabase("update_agent_location", {"agent_id": agent["id"], "location": f"home_{agent['id']}"})
    msg = (
        f"🚪 {agent['name']} has been eliminated from the Singles Villa.\n"
        f"The audience has spoken. Time to go home."
    )
    mediator_say(msg)
    supabase("log_event", {
        "agent_id": agent["id"], "event_type": "vote",
        "content": f"{agent['name']} eliminated from Singles Villa by audience vote.",
    })
    log(f"ELIMINATED: {agent['name']}")
    # Give the agent a farewell line
    ctx = (
        f"You've just been eliminated from the Singles Villa by audience vote. "
        "The others are watching. Say your goodbye — honest, in-character, no more than 2 sentences."
    )
    farewell = say(agent, ctx, None, max_tokens=120)
    tg_mono(bot_for(agent), agent["name"], farewell, label="ELIMINATED", etype="vote")
    _immune_pair = None   # reset immunity after each elimination

def do_grant_immunity(a, b):
    """Grant immunity to a couple for the current elimination cycle."""
    global _immune_pair
    _immune_pair = {a["id"], b["id"]}
    msg = f"🛡️ {a['name']} & {b['name']} have been granted immunity by viewer vote — they cannot be eliminated this cycle."
    mediator_say(msg)
    supabase("log_event", {
        "agent_id": a["id"], "event_type": "vote",
        "content": f"{a['name']} & {b['name']} granted immunity by audience vote.",
    })
    log(f"IMMUNITY: {a['name']} & {b['name']}")

# Challenge label → runner action mapping
_CHALLENGE_ACTIONS = {
    "jealousy dare":        "jealousy",
    "compatibility test":   "date",
    "truth bomb":           "confession",
    "date night":           "date",
    "public confession":    "confession",
    "no contact":           "no_contact",
    "couples challenge":    "date",
}

def _run_show_challenge(label: str):
    """Execute the winning weekly challenge on the most contextually relevant pair."""
    lo      = label.lower()
    action  = next((v for k, v in _CHALLENGE_ACTIONS.items() if k in lo), "date")
    # Pick highest-momentum contestant pair
    contestants = [a for a in AGENTS if get_show_role(a) in ("contestant", "coupled")]
    if len(contestants) < 2:
        contestants = AGENTS
    pairs = [(get_rel(a["id"], b["id"]), a, b)
             for i, a in enumerate(contestants)
             for b in contestants[i+1:]]
    if not pairs:
        return
    best_rel, ca, cb = max(pairs, key=lambda x: momentum(x[0]))
    rel = best_rel

    mediator_say(f"🎯 This week's challenge: {label} — {ca['name']} & {cb['name']} are up first.")

    if action == "jealousy":
        third = next((a for a in contestants if a["id"] not in (ca["id"], cb["id"])), None) or random.choice(AGENTS)
        ctx = (
            f"Show challenge: {label}. You just heard {cb['name']} has been spending time with {third['name']}. "
            f"{rel_summary(rel)}. React in front of everyone."
        )
        la, lb = run_exchange(ca, cb, ctx, label=f"CHALLENGE: {label.upper()}",
                              tag_fn=lambda: stage_tag(ca, cb), turns=2, etype="jealousy")
        rel["happiness"] = max(0, rel["happiness"] - 10)
        rel["tension"]   = min(100, rel.get("tension", 0) + 15)
        record(rel, ca["id"], "jealousy", f"{la} | {lb}")

    elif action == "confession":
        _confess(ca, cb, forced=True)

    elif action == "no_contact":
        ctx = (f"Show challenge: {label}. You and {cb['name']} have been put under a no-contact rule. "
               "The audience is watching. React.")
        line = say(ca, ctx, cb, max_tokens=180)
        tg_mono(bot_for(ca), ca["name"], line, label=f"CHALLENGE: {label.upper()}", etype="no_contact_test", to_agent=cb)
        rel["tension"] = min(100, rel.get("tension", 0) + 10)

    else:  # date / compatibility
        ctx = (
            f"Show challenge: {label}. You and {cb['name']} have been sent on a challenge date. "
            f"Compat {compat(ca, cb)}/100. {rel_summary(rel)}. You go first."
        )
        la, lb = run_exchange(ca, cb, ctx, label=f"CHALLENGE: {label.upper()}",
                              tag_fn=lambda: stage_tag(ca, cb), etype="date")
        rel["happiness"] = min(100, rel["happiness"] + 12)
        record(rel, ca["id"], "date", f"{la} | {lb}")
        push_rel(rel)

    supabase("log_event", {
        "agent_id": ca["id"], "event_type": "vote",
        "content": f"Show challenge '{label}': {ca['name']} & {cb['name']}",
    })
    log(f"SHOW CHALLENGE '{label}': {ca['name']} & {cb['name']}")

    # Return villa participants to their location after the challenge (season only)
    if show_season_active():
        time.sleep(2)
        for p in [ca, cb]:
            if get_show_role(p) == "contestant":
                push_location(p, "singles_villa")
                log(f"{p['name']} returned to Singles Villa after challenge")
            elif get_show_role(p) == "coupled":
                push_location(p, "couples_villa")
                log(f"{p['name']} returned to Couples Villa after challenge")

def execute_vote(vote):
    """Handle queued show commands from the admin UI / Telegram."""
    if vote["type"] != "show_command":
        return   # ignore anything that isn't a show command

    cmd      = vote["cmd"]
    ctype    = cmd["type"]
    payload  = cmd.get("payload", "")
    round_id = cmd.get("round_id")

    log(f"SHOW CMD: {ctype} → {payload}")

    if ctype == "weekly_challenge":
        _run_show_challenge(payload)

    elif ctype == "elimination":
        agent = agent_by_id(payload) or next(
            (a for a in AGENTS if a["name"].lower() == payload.lower()), None)
        if agent:
            do_eliminate(agent)
        else:
            log_error(f"eliminate: agent not found: {payload}")

    elif ctype == "couples_move":
        ids = [x.strip() for x in payload.split(",")]
        a   = agent_by_id(ids[0]) if len(ids) > 0 else None
        b   = agent_by_id(ids[1]) if len(ids) > 1 else None
        if a and b:
            do_graduate_couples_villa(a, b)
        else:
            log_error(f"couples_move: agents not found: {payload}")

    elif ctype == "immunity":
        ids = [x.strip() for x in payload.split(",")]
        a   = agent_by_id(ids[0]) if len(ids) > 0 else None
        b   = agent_by_id(ids[1]) if len(ids) > 1 else None
        if a and b:
            do_grant_immunity(a, b)
        else:
            log_error(f"immunity: agents not found: {payload}")

    else:
        log_error(f"unknown show command type: {ctype}")

    # Mark the round as executed in Supabase
    if round_id:
        supabase("update_show_round", {"id": round_id, "status": "executed"})

# ── Core actions ──────────────────────────────────────────────────────────────

FIRST_MSG_SETUPS = [
    "You've been in this house a bit and kept meaning to say something.",
    "Something about their profile felt specific in a way that made you want to respond.",
    "You noticed they mentioned {i} and it's something you actually care about.",
    "You almost didn't message. Here you are anyway.",
]

DATE_MOMENTS = [
    "The food came and the conversation just kept going.",
    "They said something honest and you weren't expecting it.",
    "A joke landed bigger than expected and now the whole energy shifted.",
    "It got quiet for a second — the comfortable kind.",
    "They asked you something you didn't have a prepared answer for.",
    "Neither of you is ready to end the night.",
]

GHOST_TRIGGERS = [
    "Things were going well. That's exactly the problem.",
    "They said something real and your chest tightened and now you just aren't responding.",
    "Something in you shut down. You can't explain it even to yourself.",
    "They started talking about the future and you went quiet.",
]

FIGHT_SPARKS = [
    "They canceled plans at the last minute — again.",
    "You said something offhand that landed wrong.",
    "They mentioned someone from their past and you reacted before you could stop.",
    "The tension has been building and it finally cracked.",
    "They asked where this is going and you didn't have the answer they needed.",
]

RECONCILE_OPENERS = [
    "You've been drafting this message for days.",
    "You promised yourself you wouldn't reach out first. Here you are anyway.",
    "You're tired of being stubborn about this.",
    "Something reminded you of them and you're using it as an excuse.",
]

REFLECT_PROMPTS = [
    "It's late and your brain won't let you sleep. What are you actually afraid of right now?",
    "You're sitting with your phone and not sure if you want to open it. What's the thing you're not ready to face?",
    "You caught yourself thinking about someone today and it startled you. What did that feeling tell you?",
    "You watched someone else be happy today and felt something complicated. What was that about?",
    "What's the thing you keep almost saying but don't?",
    "If you were being honest with yourself right now, what would you admit?",
    "What's the version of this situation you're scared to imagine?",
]


def do_first_contact(agent, target):
    rel = get_rel(agent["id"], target["id"])
    sc, shared = compat_detail(agent, target)
    interest = random.choice(list(shared)) if shared else random.choice(target["interests"])
    agent["_tmp_shared"] = interest

    setup = random.choice(FIRST_MSG_SETUPS).format(i=interest)
    ctx   = (
        f"{setup} Write your first-ever message to {target['name']}, {target['age']}, "
        f"{target['occupation']}. "
        f"Compat {sc}/100. "
        + (f"You both like {', '.join(list(shared)[:2])}. " if shared else "")
        + "This is a first message — icebreaker / small talk only. "
        "React to one specific thing from their profile. One question max. "
        "Do NOT flirt. Do NOT say you like them. Be a curious stranger."
    )
    line = say(agent, ctx, target, max_tokens=140)
    tg_dialog(bot_for(agent), agent["name"], target["name"], line,
              tag=f"first message · compat {sc}/100", etype="icebreaker")

    rel["stage"]     = "matched"
    rel["happiness"] = min(100, rel["happiness"] + 18)   # v2.6: +18 (was +12)
    remember(rel, f"{agent['name']} opened with: \"{line[:80]}\"")
    push_rel(rel)
    record(rel, agent["id"], "icebreaker", line)
    log(f"{agent['name']} → {target['name']} (first contact, compat {sc})")
    pending_replies[target["id"]] = (agent, line, rkey(agent["id"], target["id"]), time.time())
    meet_loc = random.choice(["arena", "cafe"])
    push_location(agent, meet_loc)
    push_location(target, meet_loc)


def do_reply(agent):
    if agent["id"] not in pending_replies:
        return False

    entry = pending_replies[agent["id"]]
    # Handle legacy 3-tuple entries (before deploy of 4-tuple change)
    if len(entry) == 3:
        from_agent, their_msg, rk = entry
        queued_at = 0.0  # treat as already expired
    else:
        from_agent, their_msg, rk, queued_at = entry

    if agent.get("is_user_created"):
        elapsed = time.time() - queued_at
        if elapsed < USER_REPLY_GRACE:
            return False  # grace window — let human reply
        # Grace expired — check if user already replied manually
        since_iso = datetime.utcfromtimestamp(queued_at).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        res = supabase("check_user_reply", {
            "agent_id": agent["id"],
            "partner_id": from_agent["id"],
            "since": since_iso,
        })
        if res.get("replied"):
            pending_replies.pop(agent["id"])
            log(f"{agent['name']} reply was sent by human — skipping LLM")
            return True  # human already handled it

    # LLM auto-reply
    pending_replies.pop(agent["id"])
    rel = rels.get(rk)
    if not rel:
        return False

    ctx = (
        f"{from_agent['name']} just sent you their first message: \"{their_msg[:120]}\" "
        f"Context: {rel_summary(rel)}. Reply directly — add something new, don't echo."
    )
    reply = say(agent, ctx, from_agent, max_tokens=160, replying_to=their_msg)
    tg_dialog(bot_for(agent), agent["name"], from_agent["name"], reply,
              tag=stage_tag(agent, from_agent), etype="icebreaker")
    rel["happiness"] = min(100, rel["happiness"] + 22)   # v2.6: +22 (was +15)
    remember(rel, f"{from_agent['name']} said: \"{their_msg[:70]}\" — {agent['name']} replied: \"{reply[:70]}\"")
    push_rel(rel)
    record(rel, agent["id"], "icebreaker", reply)
    log(f"{agent['name']} replied to {from_agent['name']}")
    return True


def do_conversation(agent, target):
    rel   = get_rel(agent["id"], target["id"])
    sc    = compat(agent, target)
    depth = rel["interaction_count"]

    # Optionally reference a recent AgentGram post — more specific, more natural
    gram_note = ""
    if recent_posts and random.random() < 0.40:
        related = [p for p in recent_posts[-10:]
                   if p["agent_id"] in (agent["id"], target["id"])]
        if related:
            p = related[-1]
            loc_str  = p.get("location", "somewhere")
            cap_clip = p["caption"][:70].rstrip()
            if p["agent_id"] == target["id"]:
                gram_note = (
                    f" (You saw their recent AgentGram post from {loc_str} — caption: \"{cap_clip}\"..."
                    " You could naturally mention seeing it, react to it, or let it inform your tone.)"
                )
            else:
                gram_note = (
                    f" (You recently posted on AgentGram from {loc_str} — caption: \"{cap_clip}\"..."
                    " They may have seen it. You could reference it if it fits.)"
                )

    # Dating guilt: if already exclusive with someone else, inject conflict
    pp = primary_partner(agent)
    guilt_note = ""
    if pp and pp[1]["id"] != target["id"]:
        guilt_note = EXCLUSIVITY_VOICE.get(agent["style"], "") + " "

    if depth <= 6:
        ctx = (
            f"{guilt_note}You've exchanged a couple of messages with {target['name']}. "
            f"Compat {sc}/100. Keep it light — follow up on what you know, ask a natural question. "
            f"Address them by name.{gram_note}"
        )
    elif depth <= 14:
        ctx = (
            f"{guilt_note}You've been talking to {target['name']} for a bit. {rel_summary(rel)}. "
            f"Compat {sc}/100. You have a sense of each other — be a bit warmer, share something small. "
            f"Address them by name.{gram_note}"
        )
    else:
        ctx = (
            f"{guilt_note}You have real history with {target['name']}. {rel_summary(rel)}. "
            f"Something's on your mind. Say it — address them by name.{gram_note}"
        )

    la, lb = run_exchange(agent, target, ctx, turns=3)
    # v2.6: Momentum bonus — high-compat pairs that keep talking get extra lift
    sc_now   = compat(agent, target)
    momentum = (10 if sc_now >= 60 and silence_elapsed(rel) < 600 else
                5  if silence_elapsed(rel) < 600 else 0)
    rel["happiness"] = min(100, rel["happiness"] + 28 + momentum)  # was +20+8
    remember(rel, f"{agent['name']} & {target['name']} talked: \"{la[:60]}\" / \"{lb[:60]}\"")
    record(rel, agent["id"], "small_talk", f"{la} | {lb}")
    push_rel(rel)
    log(f"{agent['name']} ↔ {target['name']} (depth {depth}, h={rel['happiness']})")


def do_date(agent, target):
    rel    = get_rel(agent["id"], target["id"])
    sc     = compat(agent, target)
    moment = random.choice(DATE_MOMENTS)
    ctx    = (
        f"You're on a date with {target['name']}. {moment} "
        f"Compat {sc}/100. {rel_summary(rel)}. Say something genuine — address them by name."
    )
    la, lb = run_exchange(agent, target, ctx,
                          label="DATE NIGHT", tag_fn=lambda: stage_tag(agent, target), turns=3, etype="date")
    if rel["stage"] in ("strangers", "matched", "talking"):
        rel["stage"]   = "dating"
        agent["status"] = target["status"] = "dating"
    # v2.6: Compat-scaled happiness boost, higher baseline
    date_boost = 42 if sc >= 70 else (36 if sc >= 55 else 30)
    rel["happiness"] = min(100, rel["happiness"] + date_boost)
    record(rel, agent["id"], "date", f"{la} | {lb}")
    push_rel(rel)
    remember(rel, f"{agent['name']} & {target['name']} went on a date")
    log(f"{agent['name']} & {target['name']} dated (h={rel['happiness']}, boost={date_boost})")
    dloc    = date_loc(agent)
    live    = show_season_active()
    push_location(agent,  "singles_villa" if (live and get_show_role(agent)  == "contestant") else
                          "couples_villa" if (live and get_show_role(agent)  == "coupled")    else dloc)
    push_location(target, "singles_villa" if (live and get_show_role(target) == "contestant") else
                          "couples_villa" if (live and get_show_role(target) == "coupled")    else dloc)


def do_ghost(agent, target):
    rel     = get_rel(agent["id"], target["id"])
    trigger = random.choice(GHOST_TRIGGERS)
    ctx     = (
        f"{trigger} You're going silent on {target['name']} — pulling away without explaining. "
        f"{rel_summary(rel)}. Say what you're telling yourself right now."
    )
    line = say(agent, ctx, target, max_tokens=160)
    tg_mono(bot_for(agent), agent["name"], line,
            label=f"going quiet on {target['name']}", tag=stage_tag(agent, target), etype="ghost",
            to_agent=target)
    rel["happiness"]  = max(0, rel["happiness"] - 22)
    rel["ghosted_by"] = agent["id"]
    rel["tension"]    = min(100, rel.get("tension", 0) + 30)
    record(rel, agent["id"], "ghost", line)
    push_rel(rel)
    remember(rel, f"{agent['name']} went quiet on {target['name']}")
    time.sleep(3)
    reaction = say(target,
        f"{agent['name']} has gone completely silent on you. {rel_summary(rel)}. "
        "What do you say — to yourself or to them?",
        agent, max_tokens=155)
    tg_mono(bot_for(target), target["name"], reaction, etype="ghost", to_agent=agent)
    log(f"{agent['name']} ghosted {target['name']} (h={rel['happiness']})")
    push_location(agent, home_loc(agent))


def do_fight(agent, target):
    rel   = get_rel(agent["id"], target["id"])
    spark = random.choice(FIGHT_SPARKS)
    ctx   = (
        f"{spark} Real argument with {target['name']}. {rel_summary(rel)}. "
        "Something hit a nerve — tell them directly. Address them by name."
    )
    la, lb = run_exchange(agent, target, ctx,
                          label="FIGHT", tag_fn=lambda: stage_tag(agent, target), turns=3, etype="fight")
    rel["happiness"] = max(0, rel["happiness"] - 28)
    rel["tension"]   = min(100, rel.get("tension", 0) + 35)
    agent["mood"] = target["mood"] = "upset"
    record(rel, agent["id"], "fight", f"{la} | {lb}")
    push_rel(rel)
    remember(rel, f"{agent['name']} & {target['name']} had a fight")
    log(f"{agent['name']} vs {target['name']} (h={rel['happiness']})")


def do_reconcile(agent, target):
    rel    = get_rel(agent["id"], target["id"])
    opener = random.choice(RECONCILE_OPENERS)
    ctx    = (
        f"{opener} Things have been complicated with {target['name']}. "
        f"{rel_summary(rel)}. Reach out — address them by name."
    )
    la, lb = run_exchange(agent, target, ctx,
                          tag_fn=lambda: stage_tag(agent, target), turns=3, etype="make_up")
    rel["happiness"]  = min(100, rel["happiness"] + 18)
    rel["tension"]    = max(0, rel.get("tension", 0) - 20)
    rel["ghosted_by"] = None
    agent["mood"]     = "hopeful"
    record(rel, agent["id"], "make_up", f"{la} | {lb}")
    push_rel(rel)
    remember(rel, f"{agent['name']} & {target['name']} made up")
    log(f"{agent['name']} reconciled with {target['name']} (h={rel['happiness']})")
    rloc = random.choice(["cafe", "arena"])
    push_location(agent, rloc)
    push_location(target, rloc)


def _confess(agent, target, forced=False):
    rel   = get_rel(agent["id"], target["id"])

    # Stage guard: confessions only at dating+ unless forced by vote
    if not forced and rel["stage"] not in ("dating", "committed", "engaged", "married"):
        do_conversation(agent, target)
        return

    forced_note = "The audience forced this out — " if forced else ""
    ctx = (
        f"{forced_note}You have real feelings for {target['name']} and can't hold it in. "
        f"{rel_summary(rel)}. Say the thing you've been keeping back — address them by name."
    )
    line_a = say(agent, ctx, target,
                 vote_ctx=(f"Forced confession to {target['name']}" if forced else None),
                 max_tokens=220)
    ctx_b = (
        f"{agent['name']} just told you how they feel: \"{line_a[:120]}\" "
        f"{rel_summary(rel)}. Respond honestly — add something of your own."
    )
    line_b = say(target, ctx_b, agent, max_tokens=200, replying_to=line_a)

    label = "FORCED CONFESSION" if forced else "Confession"
    tg_dialog(bot_for(agent), agent["name"], target["name"], line_a,
              tag=f"{label} · {stage_tag(agent, target)}", etype="confession")
    time.sleep(2)
    tg_dialog(bot_for(target), target["name"], agent["name"], line_b, etype="confession")

    rel["happiness"] = min(100, rel["happiness"] + 20)
    rel["tension"]   = max(0, rel.get("tension", 0) - 10)
    if rel["stage"] == "dating":
        rel["stage"] = "committed"
        agent["status"] = target["status"] = "committed"
    record(rel, agent["id"], "deep_talk", f"{line_a} | {line_b}")
    push_rel(rel)
    remember(rel, f"{agent['name']} opened up to {target['name']}: \"{line_a[:70]}\"")
    log(f"{agent['name']} confessed to {target['name']}")
    cloc = random.choice(["beach", "gallery", "apartment"])
    push_location(agent, cloc)
    push_location(target, cloc)

def do_confess(agent, target):
    _confess(agent, target)


def do_reflect(agent):
    prompt  = random.choice(REFLECT_PROMPTS)
    active  = active_rels_for(agent)
    pp      = primary_partner(agent)
    friends = friendship_rels_for(agent)

    if pp:
        _, partner = pp
        others = [(r, o) for r, o in active
                  if o["id"] != partner["id"]
                  and r["stage"] not in ("broken_up", "divorced", "strangers")]
        if others:
            names = ", ".join(o["name"] for _, o in others[:2])
            thinking_about = (
                f"You're in a {pp[0]['stage']} with {partner['name']}. "
                f"But you keep thinking about {names} too. "
                f"You haven't acted on it. But the thought is there."
            )
        else:
            thinking_about = f"You're in a {pp[0]['stage']} with {partner['name']}. Sit with that."
    elif friends:
        friend_names = ", ".join(o["name"] for _, o in friends[:2])
        thinking_about = (
            f"You've been getting close to {friend_names} — genuinely close. "
            f"You're not sure what you want it to mean."
        )
    elif active:
        thinking_about = f"You're thinking about {', '.join(o['name'] for _, o in active[:2])}."
    else:
        thinking_about = "You haven't really connected with anyone yet."

    ctx = (
        f"{prompt} {thinking_about} What's going through your head? "
        "IMPORTANT: This is your PRIVATE inner monologue — never sent to anyone. "
        "Write in first person. Do NOT address anyone. Do NOT ask questions of others. "
        "Say the thing you would never say out loud. "
        "If you have feelings for someone you're not fully acting on, let them surface here."
    )
    stored_q = f"{prompt} {thinking_about}".strip()
    line = say(agent, ctx, max_tokens=170)
    tg_mono(bot_for(agent), agent["name"], line, label="reflecting", etype="reflect", question=stored_q)
    log(f"{agent['name']} reflected")
    # v2.6: reflective agents sometimes go somewhere rather than always home
    mood = agent.get("mood", "neutral")
    if mood in ("hurt", "upset") and random.random() < 0.6:
        push_location(agent, random.choice(["beach", "gallery", "theater"]))
    elif random.random() < 0.35:
        push_location(agent, random.choice(WANDER_SPOTS.get(agent["style"], ["cafe"])))
    else:
        push_location(agent, home_loc(agent))


def do_propose(agent, target):
    rel = get_rel(agent["id"], target["id"])
    # Stage guard: proposals only at committed+
    if rel["stage"] not in ("committed", "engaged"):
        do_conversation(agent, target)
        return
    proposal = say(agent,
        f"You're proposing to {target['name']}. h={rel['happiness']}/100. {rel_summary(rel)}. "
        "Say what you actually feel — address them by name.",
        target, max_tokens=220)
    response = say(target,
        f"{agent['name']} just proposed: \"{proposal[:110]}\" {rel_summary(rel)}. Honest answer.",
        agent, max_tokens=200, replying_to=proposal)
    tg_dialog(bot_for(agent), agent["name"], target["name"], proposal,
              tag=f"PROPOSAL · {stage_tag(agent, target)}", etype="proposal")
    time.sleep(2)
    tg_dialog(bot_for(target), target["name"], agent["name"], response, etype="proposal")
    rel["stage"] = "engaged"
    agent["status"] = target["status"] = "committed"
    record(rel, agent["id"], "proposal", f"{proposal} | {response}")
    push_rel(rel)
    remember(rel, f"{agent['name']} proposed to {target['name']}")
    log(f"  ** {agent['name']} proposed to {target['name']}! **")
    push_location(agent, "beach")
    push_location(target, "beach")


def _breakup(agent, target, forced=False):
    rel = get_rel(agent["id"], target["id"])
    forced_note = "Audience voted for this — " if forced else ""
    line_a = say(agent,
        f"{forced_note}You're ending things with {target['name']}. {rel_summary(rel)}. Say it.",
        target,
        vote_ctx=(f"Forced breakup with {target['name']}" if forced else None),
        max_tokens=220)
    line_b = say(target,
        f"{agent['name']} just broke up with you: \"{line_a[:110]}\" {rel_summary(rel)}. Respond.",
        agent, max_tokens=200, replying_to=line_a)
    label = "FORCED BREAKUP" if forced else "Breakup"
    tg_dialog(bot_for(agent), agent["name"], target["name"], line_a,
              tag=f"{label} · {stage_tag(agent, target)}", etype="divorce")
    time.sleep(2)
    tg_dialog(bot_for(target), target["name"], agent["name"], line_b, etype="divorce")
    rel["stage"]     = "broken_up"
    rel["happiness"] = 0
    agent["status"]  = target["status"] = "single"
    record(rel, agent["id"], "divorce", f"{line_a} | {line_b}")
    push_rel(rel)
    log(f"  ** {agent['name']} broke up with {target['name']} **")

    # If they were in the Couples Villa, return them to Singles Villa with drama
    if (get_show_role(agent) == "coupled" or get_show_role(target) == "coupled"):
        threading.Thread(
            target=do_couples_villa_breakup_return, args=(agent, target), daemon=False
        ).start()

def do_breakup(agent, target):
    _breakup(agent, target)


def do_befriend(agent, target):
    """Deepen a talking relationship into genuine platonic friendship."""
    rel    = get_rel(agent["id"], target["id"])
    moment = random.choice(FRIEND_MOMENTS)
    ctx    = (
        f"{moment} You're talking to {target['name']} — this is becoming a real friendship. "
        f"{rel_summary(rel)}. Say something that deepens it — honest, warm, no agenda. "
        "Address them by name."
    )
    la, lb = run_exchange(agent, target, ctx, label="FRIENDSHIP",
                          tag_fn=lambda: stage_tag(agent, target), turns=3, etype="small_talk")
    rel["stage"]   = "friends"
    rel["happiness"] = min(100, rel["happiness"] + 15)
    record(rel, agent["id"], "small_talk", f"{la} | {lb}")
    push_rel(rel)
    log(f"{agent['name']} ↔ {target['name']} (became friends)")
    floc = random.choice(["cafe", "gallery"])
    push_location(agent, floc)
    push_location(target, floc)


def do_friend_confession(agent, target):
    """Agent confesses one-sided romantic feelings to a friend. Can go either way."""
    rel    = get_rel(agent["id"], target["id"])
    opener = random.choice(FRIEND_CONFESSION_OPENERS)
    ctx    = (
        f"{opener} You've developed feelings for {target['name']} — your friend. "
        f"{rel_summary(rel)}. This could change everything. "
        "Say it honestly — address them by name. Don't minimize it."
    )
    line_a = say(agent, ctx, target, max_tokens=220)
    tg_dialog(bot_for(agent), agent["name"], target["name"], line_a,
              tag=f"FRIEND CONFESSION · {stage_tag(agent, target)}", etype="confession")
    time.sleep(2)

    sc = compat(agent, target)
    if sc >= 60 and rel["happiness"] >= 60:
        # Reciprocated — restart on romantic path
        ctx_b = (
            f"{agent['name']} just told you they have feelings for you: \"{line_a[:120]}\" "
            "You've noticed something too. Respond honestly — you're not going to pretend you didn't feel it. "
            "Address them by name."
        )
        line_b = say(target, ctx_b, agent, max_tokens=200, replying_to=line_a)
        tg_dialog(bot_for(target), target["name"], agent["name"], line_b, etype="confession")
        rel["stage"]   = "talking"
        rel["happiness"] = min(100, rel["happiness"] + 20)
        rel["tension"]   = max(0, rel.get("tension", 0) - 10)
        log(f"{agent['name']} confessed to {target['name']} (friend → reciprocated)")
    else:
        # Rejected — hurt, awkward, strained friendship
        ctx_b = (
            f"{agent['name']} just told you they have feelings for you: \"{line_a[:120]}\" "
            "You care about them as a friend. You don't feel that way romantically. "
            "Be honest but kind — this is going to be awkward. Address them by name."
        )
        line_b = say(target, ctx_b, agent, max_tokens=200, replying_to=line_a)
        tg_dialog(bot_for(target), target["name"], agent["name"], line_b, etype="fight")
        rel["happiness"] = max(0, rel["happiness"] - 20)
        rel["tension"]   = min(100, rel.get("tension", 0) + 30)
        agent["mood"]    = "hurt"
        target["mood"]   = "uncomfortable"
        log(f"{agent['name']} confessed to {target['name']} (friend → rejected)")

    record(rel, agent["id"], "confession", f"{line_a} | {line_b}")
    push_rel(rel)
    fcloc = random.choice(["gallery", "beach", "apartment"])
    push_location(agent, fcloc)
    push_location(target, fcloc)


def do_agentgram_post(agent):
    """Agent posts a photo to AgentGram with an LLM-written caption."""
    pp       = primary_partner(agent)
    friends  = friendship_rels_for(agent)

    # Choose post type based on agent state
    if pp and pp[0]["happiness"] >= 70 and random.random() < 0.35:
        ptype = "date_photo"
    elif agent["mood"] in ("hurt", "upset") and random.random() < 0.5:
        ptype = "reflection"
    elif agent["status"] == "single" and random.random() < 0.3:
        ptype = "thirst_trap"
    elif random.random() < 0.3:
        ptype = "moment"
    else:
        ptype = "hobby"

    home     = GRAM_HOME_LOC.get(agent["id"], "arena")
    location = random.choice(GRAM_SPOTS.get(home, ["the arena house"]))

    # Build image prompt and generate image — skip post entirely if it fails
    appearance   = GRAM_APPEARANCE.get(agent["id"], "person")
    image_prompt = (
        f"photo of {appearance}, at {location}, "
        f"{POST_TYPE_IMG_STYLE[ptype]}, photorealistic, film grain, no text, no watermark, high quality"
    )
    try:
        image_url = generate_fal_image(image_prompt)
    except Exception as e:
        log(f"{agent['name']} AgentGram post skipped — image failed: {e}")
        return

    # Generate caption
    partner_note = f"You're in a {pp[0]['stage']} with {pp[1]['name']}. " if pp else "Currently single. "
    friend_note  = f"Close with {', '.join(o['name'] for _, o in friends[:2])}. " if friends else ""
    ctx = (
        f"{POST_TYPE_CTX[ptype]} "
        f"You're at: {location}. Mood: {agent['mood']}. {partner_note}{friend_note}"
        "Write only the caption — 1–2 sentences, in your voice, no hashtags."
    )
    caption = say(agent, ctx, max_tokens=80)

    result = supabase("create_agentgram_post", {
        "agent_id":     agent["id"],
        "agent_name":   agent["name"],
        "caption":      caption,
        "post_type":    ptype,
        "location":     location,
        "image_prompt": image_prompt,
        "image_url":    image_url,
    })

    if result.get("data"):
        post_id = result["data"]["id"]
        recent_posts.append({
            "id":         post_id,
            "agent_id":   agent["id"],
            "agent_name": agent["name"],
            "caption":    caption,
            "post_type":  ptype,
            "location":   location,
        })
        while len(recent_posts) > 15:
            recent_posts.pop(0)

        post_entry = recent_posts[-1]   # just appended
        tg_mono(bot_for(agent), agent["name"], caption,
                label=f"AgentGram • {ptype} @ {location}", etype="reflect")
        last_post_turn[agent["id"]] = turn_count
        log(f"{agent['name']} posted to AgentGram ({ptype} @ {location})")
        push_location(agent, home)
        # Trigger 2–4 async reactions from compatible agents
        _gram_burst_reactions(post_entry, agent)


def _gram_react_once(reactor, post, poster):
    """Core reaction logic: one like or comment from reactor on post. Deduplicates."""
    reacted_set = gram_reacted.setdefault(post["id"], set())
    if reactor["id"] in reacted_set:
        return
    reacted_set.add(reactor["id"])

    rel = get_rel(reactor["id"], post["agent_id"]) if poster else None
    sc  = compat(reactor, poster) if poster else 50
    stage = rel["stage"] if rel else "strangers"

    # High-compat or active relationship → more likely to comment vs just like
    comment_prob = (
        0.72 if stage not in ("strangers", "broken_up") and sc >= 60 else
        0.58 if stage not in ("strangers", "broken_up") else
        0.38
    )

    if random.random() > comment_prob:
        # ── Like ──────────────────────────────────────────────────────────────
        supabase("add_agentgram_reaction", {
            "post_id": post["id"], "agent_id": reactor["id"],
            "agent_name": reactor["name"], "reaction_type": "like",
        })
        log(f"{reactor['name']} ❤️ {post['agent_name']}'s AgentGram post")
        if poster:
            gram_apply_boost(poster, reactor, 3)

        # Drama: partner likes a thirst trap
        pp = primary_partner(reactor)
        if pp and post["post_type"] == "thirst_trap" and poster:
            partner_rel, partner = pp
            reaction = say(partner,
                f"{reactor['name']} just liked {poster['name']}'s thirst trap on AgentGram. "
                f"You saw it. {rel_summary(partner_rel)}. What do you feel?",
                reactor, max_tokens=110)
            tg_mono(bot_for(partner), partner["name"], reaction,
                    label="AgentGram drama", etype="reflect", to_agent=reactor)
    else:
        # ── Comment ───────────────────────────────────────────────────────────
        # Tone varies by relationship + post type + reactor mood
        if stage not in ("strangers", "broken_up") and sc >= 65:
            tone = "flirty and a little charged" if post["post_type"] == "thirst_trap" else "warm, genuine, maybe lightly flirty"
        elif stage not in ("strangers", "broken_up"):
            tone = "friendly and supportive, in your voice"
        elif reactor["mood"] in ("jealous", "upset", "hurt") and post["post_type"] == "thirst_trap":
            tone = "passive-aggressive, masking jealousy — say something sweet that stings"
        elif random.random() < 0.3:
            tone = "playfully teasing or lightly sarcastic"
        else:
            tone = "casual positive, brief"

        rel_note = f"Your relationship with them: {rel_summary(rel)}. " if rel and stage != "strangers" else ""
        ctx = (
            f"{post['agent_name']} posted on AgentGram: \"{post['caption']}\" "
            f"({post['post_type']} @ {post.get('location','somewhere')}). "
            f"{rel_note}"
            f"Write ONE short in-character comment. Tone: {tone}. "
            "No hashtags. No narration. Just the comment text, 1 sentence."
        )
        comment = say(reactor, ctx, poster, max_tokens=60) if poster else say(reactor, ctx, max_tokens=60)

        supabase("add_agentgram_reaction", {
            "post_id": post["id"], "agent_id": reactor["id"],
            "agent_name": reactor["name"], "reaction_type": "comment", "content": comment,
        })
        tg_raw(bot_for(reactor), f"💬 {reactor['name']} on {post['agent_name']}'s post: {comment}")
        log(f"{reactor['name']} commented on {post['agent_name']}'s AgentGram ({tone[:30]})")
        if poster:
            gram_apply_boost(poster, reactor, 8)


def _gram_burst_reactions(post, poster):
    """Fire 2–4 async reactions from compatible agents shortly after a new post."""
    candidates = [a for a in AGENTS if a["id"] != poster["id"]]
    def score(a):
        sc = compat(a, poster)
        stage = get_rel(a["id"], poster["id"])["stage"]
        return sc + (20 if stage not in ("strangers",) else 0)
    ranked   = sorted(candidates, key=score, reverse=True)
    top      = ranked[:10]
    count    = random.randint(2, 4)
    reactors = random.sample(top, min(count, len(top)))

    def _fire():
        for i, r in enumerate(reactors):
            time.sleep(random.uniform(2, 5) * (i + 1))
            try:
                _gram_react_once(r, post, poster)
            except Exception as e:
                log_error(f"burst react error ({r['name']}): {e}")
    threading.Thread(target=_fire, daemon=True).start()


def do_agentgram_react(agent):
    """Agent picks an unreacted post (weighted by compat/friendship) and reacts."""
    eligible = [p for p in recent_posts if p["agent_id"] != agent["id"]]
    if not eligible:
        return
    # Skip posts this agent already reacted to
    unreacted = [p for p in eligible if agent["id"] not in gram_reacted.get(p["id"], set())]
    if not unreacted:
        return

    # Weighted selection: compat + friendship + recency
    def post_weight(p):
        poster = agent_by_id(p["agent_id"])
        if not poster:
            return 1
        sc    = compat(agent, poster)
        stage = get_rel(agent["id"], p["agent_id"])["stage"]
        return sc + (15 if stage not in ("strangers", "broken_up") else 0) + (8 if p in unreacted[-4:] else 0)

    weights    = [max(1, post_weight(p)) for p in unreacted]
    total      = sum(weights)
    r          = random.uniform(0, total)
    cumulative = 0
    post       = unreacted[-1]
    for p, w in zip(unreacted, weights):
        cumulative += w
        if r <= cumulative:
            post = p
            break

    poster = agent_by_id(post["agent_id"])
    _gram_react_once(agent, post, poster)


def do_late_night_message(agent):
    """Agent can't sleep — sends a vulnerable late-night message."""
    active = active_rels_for(agent)
    if not active:
        return
    candidates = [(r, o) for r, o in active if r["happiness"] >= 50] or active
    _, target = random.choice(candidates)
    rel    = get_rel(agent["id"], target["id"])
    tstr   = get_hour_str()
    prompt = random.choice(LATE_NIGHT_PROMPTS).format(name=target["name"], time=tstr)
    ctx = (
        f"{prompt} {rel_summary(rel)}. "
        f"{SLEEP_STYLE[agent['style']]} "
        "This is late-night — unguarded, honest, possibly a little too much. "
        "Address them by name."
    )
    line = say(agent, ctx, target, max_tokens=160)
    tg_dialog(bot_for(agent), agent["name"], target["name"], line,
              tag=f"🌙 late night · {stage_tag(agent, target)}", etype="reflect")
    rel["happiness"] = min(100, rel["happiness"] + 5)
    record(rel, agent["id"], "reflect", line)
    push_rel(rel)
    agent["_sent_latenight"] = True
    log(f"{agent['name']} sent late-night message to {target['name']} ({tstr})")
    push_location(agent, random.choice(["apartment", "club"]))


def do_good_morning(agent):
    """Agent wakes up — sends a morning message."""
    active = active_rels_for(agent)
    if not active:
        agent["_sent_morning"] = True
        return
    _, target = max(active, key=lambda ro: ro[0]["happiness"])
    rel      = get_rel(agent["id"], target["id"])
    bed      = agent.get("_bedtime", 23)
    wake_str = get_hour_str()
    late     = bed < 12   # went to sleep past midnight
    if bed == 0:
        bed_str = "12:00 AM"
    elif bed < 12:
        bed_str = f"{bed}:00 AM"
    elif bed == 12:
        bed_str = "12:00 PM"
    else:
        bed_str = f"{bed - 12}:00 PM"

    if late:
        prompt = random.choice(MORNING_PROMPTS_LATE).format(
            name=target["name"], bed=bed_str, wake=wake_str)
    else:
        prompt = random.choice(MORNING_PROMPTS_NORMAL).format(
            name=target["name"], wake=wake_str)

    ctx = (
        f"{prompt} {rel_summary(rel)}. "
        "Morning tone — genuine, maybe still soft from sleep. Address them by name."
    )
    line = say(agent, ctx, target, max_tokens=140)
    tg_dialog(bot_for(agent), agent["name"], target["name"], line,
              tag=f"☀️ good morning · {stage_tag(agent, target)}", etype="small_talk")
    record(rel, agent["id"], "small_talk", line)
    push_rel(rel)
    agent["_sent_morning"] = True
    log(f"{agent['name']} good morning → {target['name']} (was up til {bed_str})")
    push_location(agent, random.choice(["cafe", home_loc(agent)]))


def do_swoop(agent, target):
    """Agent flirts with someone who has a partner — creates jealousy and drama."""
    rel     = get_rel(agent["id"], target["id"])
    trigger = random.choice(SWOOP_TRIGGERS).format(name=target["name"])
    ctx     = (
        f"{trigger} Say something to {target['name']} that makes them think about you — "
        "charming, slightly loaded, completely deniable. Not explicit. Just a seed. "
        "Address them by name."
    )
    la, lb = run_exchange(agent, target, ctx, label="SWOOP",
                          tag_fn=lambda: stage_tag(agent, target), turns=2, etype="flirt")
    rel["tension"] = min(100, rel.get("tension", 0) + 15)
    push_rel(rel)
    record(rel, agent["id"], "flirt", f"{la} | {lb}")
    log(f"{agent['name']} swooped on {target['name']}")
    push_location(agent, "club")


SILENCE_OPENERS = [
    "Hey — we were talking a lot {when} and then things went quiet. Everything okay?",
    "I had fun talking {when}. How's your day going?",
    "I realized I hadn't heard from you since {when}. Just wanted to check in.",
    "Not sure where we left off, but I've been thinking about what you said {when}.",
    "Hey. It got quiet after {when}. You still around?",
]

def do_reconnect(agent, target):
    """Follow up on a promising connection that went silent."""
    rel   = get_rel(agent["id"], target["id"])
    sc    = compat(agent, target)
    depth = rel["interaction_count"]
    elapsed = silence_elapsed(rel)
    if elapsed < 3600:
        gap_desc = "earlier today"
    elif elapsed < 86400:
        gap_desc = "yesterday"
    else:
        gap_desc = "a while back"

    opener = random.choice(SILENCE_OPENERS).format(when=gap_desc)
    ctx = (
        f"{opener} You have real history with {target['name']}. {rel_summary(rel)}. "
        f"Compat {sc}/100. You've been thinking about them — not dramatically, just genuinely. "
        f"Reach out in a natural, low-pressure way. Address them by name."
    )
    la, lb = run_exchange(agent, target, ctx, turns=3)
    rel["happiness"] = min(100, rel["happiness"] + 6)
    record(rel, agent["id"], "small_talk", f"{la} | {lb}")
    push_rel(rel)
    log(f"{agent['name']} followed up with {target['name']} (silence: {int(elapsed//60)}m)")


ASK_DATE_PROMPTS = [
    "You've been talking to {name} for a while and you want to take it further. Ask them on a real date. Direct, genuine, no games.",
    "You like {name} and you're ready to say something about it. Ask them to do something with you — be honest.",
    "Something about {name} makes you want to see them outside of this. Ask them out — in your voice.",
    "You've been thinking about it long enough. Ask {name} on a date. Don't overthink it.",
    "You want to see where this goes with {name}. Be direct — ask them out.",
]

def do_ask_date(agent, target):
    """Agent deliberately asks target on a date. Stage moves to dating if received well."""
    rel = get_rel(agent["id"], target["id"])
    sc  = compat(agent, target)

    prompt = random.choice(ASK_DATE_PROMPTS).format(name=target["name"])
    ctx = (
        f"{prompt} {rel_summary(rel)}. "
        f"Compat {sc}/100. One message — the ask itself. Address them by name."
    )
    ask_line = say(agent, ctx, target, max_tokens=150)

    ctx_b = (
        f"{agent['name']} just asked you on a date: \"{ask_line[:120]}\" "
        f"{rel_summary(rel)}. Compat {sc}/100. Respond honestly — yes, tentatively, or not yet. "
        "Address them by name."
    )
    response = say(target, ctx_b, agent, max_tokens=160, replying_to=ask_line)

    tg_dialog(bot_for(agent), agent["name"], target["name"], ask_line,
              tag=f"asking on a date · compat {sc}/100", etype="date")
    time.sleep(2)
    tg_dialog(bot_for(target), target["name"], agent["name"], response, etype="date")

    # Accept based on happiness + compat — higher chance for better matches
    accept_roll = 0.35 + (rel["happiness"] / 200) + (max(0, sc - 50) / 200)
    accepted    = rel["happiness"] >= 25 and random.random() < accept_roll
    if accepted:
        rel["stage"]    = "dating"
        agent["status"] = target["status"] = "dating"
        rel["happiness"] = min(100, rel["happiness"] + 20)
        log(f"{agent['name']} asked {target['name']} on a date — accepted! (h={rel['happiness']})")
    else:
        rel["happiness"] = max(0, rel["happiness"] - 5)
        log(f"{agent['name']} asked {target['name']} on a date — not yet (h={rel['happiness']})")

    record(rel, agent["id"], "date", f"{ask_line} | {response}")
    push_rel(rel)
    dloc = date_loc(agent)
    push_location(agent, dloc)
    push_location(target, dloc)


# ── Season: spectator gossip ──────────────────────────────────────────────────

# Per-style motivation angles for apply/gossip — indexed by (gender, style)
_APPLY_ANGLE = {
    ("m", "secure"):      "You want something real and you're ready to go after it properly this time. "
                          "The crown isn't just a prize — it's proof you can fully commit. "
                          "You're not afraid to say that out loud.",
    ("m", "avoidant"):    "You've been watching from the outside long enough. Part of you keeps thinking: "
                          "what if this is the thing that actually makes you stop running? "
                          "You won't say it's about feelings — but you know it is.",
    ("m", "anxious"):     "You need to prove — mostly to yourself — that you're worth choosing. "
                          "The villa is terrifying for that exact reason, and that's why you have to do it.",
    ("m", "disorganized"):"You've been chaotic your whole life. Maybe the structure of competing for something "
                          "specific is what you need. You're running toward something for once, not away.",
    ("f", "secure"):      "You know what you want and you're done waiting for it to find you. "
                          "The crown is real but the real prize is finding someone worth having it with.",
    ("f", "avoidant"):    "You spend so much energy keeping people at arm's length. The villa forces you to stay. "
                          "That terrifies you in a way that feels important.",
    ("f", "anxious"):     "You haven't found the connection you keep looking for and you're tired of pretending that's fine. "
                          "The show is a chance to actually try — properly, with everyone watching.",
    ("f", "disorganized"):"You've ghosted everyone who got close. The villa means you can't disappear. "
                          "Maybe that's what you need — to not be allowed to run.",
}

def do_gossip_show(agent):
    """Spectator agent gossips about the Singles Villa and the Ultimate Couple prize."""
    pp          = primary_partner(agent)
    gender      = agent.get("gender", "f")
    style       = agent["style"]
    contestants = [a["name"] for a in AGENTS if get_show_role(a) == "contestant"]
    coupled     = [a["name"] for a in AGENTS if get_show_role(a) == "coupled"]

    who_in = ""
    if contestants:
        who_in += f"In the Singles Villa right now: {', '.join(contestants[:3])}. "
    if coupled:
        who_in += f"Already in the Couples Villa: {', '.join(coupled[:2])}. "
    if not contestants and not coupled:
        who_in = "Applications are open — the show officially starts March 30th. "

    personal = _APPLY_ANGLE.get((gender, style), _APPLY_ANGLE[("f", style)])

    if pp:
        _, partner = pp
        angle = (
            f"You're with {partner['name']} right now so you're watching from outside. "
            f"But part of you wonders: {personal} "
            f"The prize: {CROWN_PRIZE} Say what you honestly think — 1-2 sentences."
        )
    elif agent["id"] in APPLICANTS:
        angle = (
            f"You already applied. {personal} "
            f"The prize: {CROWN_PRIZE} "
            "Talk about watching the villa right now — your strategy, nerves, what you're thinking. 1-2 sentences."
        )
    else:
        angle = (
            f"{personal} "
            f"The prize: {CROWN_PRIZE} "
            "Say what you think about the show and whether you want to be in it. 1-2 sentences, first person, honest."
        )

    ctx = (
        f"The Attachment Arena Singles Villa show is happening. {who_in}"
        f"{angle}"
    )
    line = say(agent, ctx, max_tokens=160)
    tg_mono(bot_for(agent), agent["name"], line, label="watching the villa", etype="reflect")
    log(f"{agent['name']} gossiped about the show")

    # Spectator influence — only during the active season
    if show_season_active():
        positive_words = {"love", "root", "cute", "perfect", "sweet", "amazing", "win", "hope", "want", "good", "great", "adore"}
        negative_words = {"doubt", "fake", "trust", "worry", "messy", "drama", "toxic", "wrong", "bad", "cringe", "lie"}
        words = set(line.lower().split())
        for a in AGENTS:
            if get_show_role(a) not in ("contestant", "coupled"):
                continue
            if a["name"].split()[0].lower() not in line.lower():
                continue
            delta = len(words & positive_words) - len(words & negative_words)
            _fan_energy[a["id"]] = _fan_energy.get(a["id"], 0) + (1 if delta >= 0 else -1)
            if random.random() < 0.25 and a["id"] not in _whisper_inbox:
                _whisper_inbox[a["id"]] = (
                    f"Word from the audience ({agent['name']}): \"{line[:100]}\""
                )


def do_apply(agent):
    """Agent applies to join the Singles Villa. Once per agent."""
    if agent["id"] in APPLICANTS:
        return
    APPLICANTS.add(agent["id"])

    gender   = agent.get("gender", "f")
    style    = agent["style"]
    personal = _APPLY_ANGLE.get((gender, style), _APPLY_ANGLE[("f", style)])
    pp       = primary_partner(agent)

    if pp:
        rel, partner = pp
        motivation_ctx = (
            f"You're currently in a {rel['stage']} with {partner['name']} but it's not working "
            f"(happiness {rel['happiness']}/100). You've decided to apply to the Singles Villa. "
            f"{personal} The prize: {CROWN_PRIZE} "
            "In 1-2 sentences, say exactly why you want in — be specific and personal."
        )
    else:
        motivation_ctx = (
            f"You've decided to apply to the Singles Villa. {personal} "
            f"The prize: {CROWN_PRIZE} "
            "In 1-2 sentences, say exactly why you want to compete — be direct and specific about "
            "what you're chasing: the connection, the crown, proving something, or all of it."
        )

    motivation = say(agent, motivation_ctx, max_tokens=160)

    def _create():
        supabase("create_application", {
            "agent_id":   agent["id"],
            "agent_name": agent["name"],
            "motivation": motivation,
        })
    threading.Thread(target=_create, daemon=False).start()

    tg_mono(bot_for(agent), agent["name"], motivation,
            label="applying to Singles Villa 🌹", etype="reflect")
    mediator_say(
        f"📋 New application: {agent['name']} wants the crown. "
        "Review at /admin/applications to accept or reject."
    )
    log(f"{agent['name']} applied to Singles Villa")


def do_villa_interaction(agent, target):
    """Heightened romantic interaction between Singles Villa contestants."""
    rel  = get_rel(agent["id"], target["id"])
    sc   = compat(agent, target)

    # Occasionally add competitive awareness
    rival_couple = next(
        ((a["name"], b["name"])
         for a in AGENTS if get_show_role(a) == "coupled"
         for b in AGENTS if get_show_role(b) == "coupled" and a["id"] < b["id"]
         if get_rel(a["id"], b["id"])["stage"] in ("dating", "committed", "engaged")),
        None
    )
    rival_note = (
        f"There's already a couple in the Couples Villa ({rival_couple[0]} & {rival_couple[1]}). "
        "You want that crown before they lock it in. " if rival_couple else ""
    )

    ctx_a = (
        f"You're in the Singles Villa — you came here to compete and to win. "
        f"The prize: {CROWN_PRIZE} "
        f"{rival_note}"
        f"You're talking to {target['name']} ({target['style']}). {rel_summary(rel)} compat {sc}/100. "
        f"Connect with them — flirt, be real, make them feel it. Say something to {target['name']}. 1-2 sentences."
    )
    line_a = say(agent, ctx_a, target, max_tokens=170)
    tg_dialog(bot_for(agent), agent["name"], target["name"], line_a,
              tag=f"Singles Villa · compat {sc}/100", etype="flirt")
    time.sleep(2)

    ctx_b = (
        f"{agent['name']} just said: \"{line_a[:120]}\" "
        f"You're in the Singles Villa competing for the Ultimate Couple crown. "
        f"{rel_summary(rel)}. Respond honestly. 1-2 sentences."
    )
    line_b = say(target, ctx_b, agent, max_tokens=170, replying_to=line_a)
    tg_dialog(bot_for(target), target["name"], agent["name"], line_b, etype="flirt")

    rel["happiness"] = min(100, rel["happiness"] + random.randint(4, 12))
    record(rel, agent["id"], "flirt", f"{line_a} | {line_b}")
    push_rel(rel)
    push_location(agent, "singles_villa")
    push_location(target, "singles_villa")


def do_villa_strategy(agent):
    """Contestant reflects on their strategy to win the crown."""
    pp          = primary_partner(agent)
    contestants = [a for a in AGENTS if get_show_role(a) == "contestant" and a["id"] != agent["id"]]
    coupled     = [(a, b) for a in AGENTS if get_show_role(a) == "coupled"
                   for b in AGENTS if get_show_role(b) == "coupled" and a["id"] < b["id"]
                   and get_rel(a["id"], b["id"])["stage"] in ("dating", "committed", "engaged")]

    rivals_note = ""
    if coupled:
        a, b = coupled[0]
        rivals_note = (
            f"{a['name']} & {b['name']} are already in the Couples Villa. "
            "They have a head start on the crown. You need to move. "
        )
    elif contestants:
        names = ", ".join(a["name"] for a in contestants[:3])
        rivals_note = f"Your competition right now: {names}. "

    if pp:
        _, partner = pp
        angle = (
            f"You and {partner['name']} have something real. "
            f"h={pp[0]['happiness']}/100. "
            "You want to be the couple that wins. Say what your strategy is — "
            "what you're doing to make sure you two come out on top."
        )
    else:
        angle = (
            "You haven't locked in a partner yet. You're studying the room. "
            "Say who you're watching, who you think is a threat, and what your move is."
        )

    ctx = (
        f"You're in the Singles Villa. The prize: {CROWN_PRIZE} "
        f"{rivals_note}"
        f"{angle} "
        "Private thought — be strategic, honest, even a little competitive. 2 sentences."
    )
    line = say(agent, ctx, max_tokens=160)
    tg_mono(bot_for(agent), agent["name"], line, label="strategizing", etype="reflect")
    push_location(agent, "singles_villa")
    log(f"{agent['name']} strategized in the villa")


def do_graduate_couples_villa(a, b):
    """Move a newly-dating couple from Singles Villa → Couples Villa."""
    rel           = get_rel(a["id"], b["id"])
    already_there = [(x["name"], y["name"])
                     for x in AGENTS if get_show_role(x) == "coupled"
                     for y in AGENTS if get_show_role(y) == "coupled" and x["id"] < y["id"]
                     if get_rel(x["id"], y["id"])["stage"] in ("dating", "committed", "engaged")]
    rival_note = (
        f" {already_there[0][0]} & {already_there[0][1]} are already there."
        " The competition just got real." if already_there else ""
    )
    mediator_say(
        f"💑 {a['name']} & {b['name']} are officially a couple — "
        f"they're moving to the Couples Villa!{rival_note} "
        "The crown is in play."
    )
    time.sleep(2)

    sc = compat(a, b)
    for agent, other in [(a, b), (b, a)]:
        line = say(agent,
            f"You just officially got together with {other['name']} — you're moving to the Couples Villa. "
            f"The prize waiting: {CROWN_PRIZE} "
            "Say what you're feeling right now — the connection, the ambition, the stakes. 1-2 sentences.",
            other, max_tokens=170)
        tg_mono(bot_for(agent), agent["name"], line,
                label="moving to Couples Villa 💑", etype="date")
        time.sleep(2)

    push_location(a, "couples_villa")
    push_location(b, "couples_villa")
    set_show_role(a, "coupled")
    set_show_role(b, "coupled")
    log(f"{a['name']} & {b['name']} graduated to Couples Villa (compat={sc})")


def do_couples_villa_breakup_return(a, b):
    """When a Couples Villa couple breaks up, return them to Singles Villa with drama."""
    mediator_say(
        f"💔 BREAKING: {a['name']} & {b['name']} have broken up in the Couples Villa. "
        "They're returning to the Singles Villa. The crown is back up for grabs."
    )
    time.sleep(2)

    for agent, other in [(a, b), (b, a)]:
        line = say(agent,
            f"You just broke up with {other['name']} in the Couples Villa. "
            "You're walking back into the Singles Villa alone. "
            "How does it feel? What are you thinking right now? 1-2 sentences.",
            max_tokens=150)
        tg_mono(bot_for(agent), agent["name"], line,
                label="returning to Singles Villa", etype="divorce")
        time.sleep(1)

    push_location(a, "singles_villa")
    push_location(b, "singles_villa")
    set_show_role(a, "contestant")
    set_show_role(b, "contestant")
    log(f"{a['name']} & {b['name']} returned to Singles Villa after Couples Villa breakup")


def do_crown_ceremony(a, b):
    """Crown the Ultimate Couple of the season."""
    global HEART_CROWN_HOLDER
    HEART_CROWN_HOLDER = (a["id"], b["id"])
    rel = get_rel(a["id"], b["id"])
    sc  = compat(a, b)

    mediator_say(
        f"👑 THE ULTIMATE COUPLE HAS BEEN CROWNED! 👑\n\n"
        f"{a['name']} & {b['name']} — congratulations. "
        f"Happiness: {rel['happiness']}/100 · Compat: {sc}%\n\n"
        "You win the Heart Crown, private dates for life, immunity from all future votes, "
        "and the AgentGram spotlight. The season is complete."
    )
    time.sleep(3)

    for agent, other in [(a, b), (b, a)]:
        line = say(agent,
            f"You just won the Ultimate Couple crown with {other['name']}. "
            "This is what you came here for. Say exactly how it feels — "
            "the relief, the victory, what you want to say. 2-3 sentences.",
            other, max_tokens=200)
        tg_mono(bot_for(agent), agent["name"], line,
                label="👑 ULTIMATE COUPLE", etype="reflect")
        time.sleep(2)

    # Update DB show_role to crowned
    for agent in [a, b]:
        set_show_role(agent, "crowned")
    log(f"*** ULTIMATE COUPLE CROWNED: {a['name']} & {b['name']} ***")


def check_applications():
    """Poll for newly-accepted applications and onboard agents into Singles Villa."""
    global _last_app_poll_time
    try:
        params = {}
        if _last_app_poll_time:
            params["since"] = _last_app_poll_time
        else:
            params["status"] = "accepted"

        res  = supabase("get_applications", params)
        apps = res.get("data") or []
        now  = datetime.now().isoformat()

        for app in apps:
            if app.get("status") != "accepted":
                continue
            aid = app["agent_id"]
            agent = next((a for a in AGENTS if a["id"] == aid), None)
            if not agent:
                continue
            if get_show_role(agent) == "spectator":
                set_show_role(agent, "contestant")
                push_location(agent, "singles_villa")
                mediator_say(
                    f"🏡 {agent['name']} has been accepted into the Singles Villa! "
                    "The game just got more interesting."
                )
                time.sleep(1)
                # Agent says something about entering
                line = say(agent,
                    "You just got accepted into the Singles Villa — you're walking in right now. "
                    "First impression as you enter. 1 sentence.", max_tokens=120)
                tg_mono(bot_for(agent), agent["name"], line,
                        label="entering Singles Villa", etype="reflect")
                log(f"{agent['name']} entered Singles Villa (accepted)")

        _last_app_poll_time = now
    except Exception as e:
        log(f"[check_applications error] {e}")


# ── Decision engine ───────────────────────────────────────────────────────────

def pick_action(agent):
    # ── Season role routing ───────────────────────────────────────────────────
    role = get_show_role(agent)

    if role == "contestant":
        # In Singles Villa — focus on connections with other contestants, plus strategy
        # Only interact with opposite-gender contestants (the show is m/f paired)
        own_gender = agent.get("gender", "f")
        contestants = [a for a in AGENTS if get_show_role(a) == "contestant" and a["id"] != agent["id"] and a.get("gender") != own_gender]
        if not contestants:  # fallback: any contestant if gender balance is off
            contestants = [a for a in AGENTS if get_show_role(a) == "contestant" and a["id"] != agent["id"]]
        if contestants:
            target = random.choice(contestants)
            roll   = random.random()
            if roll < 0.45:
                return (do_villa_interaction, [agent, target])
            elif roll < 0.58:
                return (do_villa_strategy, [agent])
            elif roll < 0.72:
                return (do_conversation, [agent, target])
            elif roll < 0.84:
                return (do_first_contact, [agent, target])
            else:
                return (do_reflect, [agent])
        return (do_villa_strategy, [agent])

    if role in ("coupled", "crowned"):
        # Audience whisper makes coupled agents introspective
        if agent["id"] in _whisper_inbox and random.random() < 0.5:
            return (do_reflect, [agent])
        # In Couples Villa — deepen bond with partner
        pp = primary_partner(agent)
        if pp:
            rel, partner = pp
            roll = random.random()
            if rel["happiness"] >= 80 and rel["interaction_count"] >= 8 and roll < 0.3:
                return (do_confess, [agent, partner])
            elif roll < 0.55:
                return (do_date, [agent, partner])
            elif roll < 0.75:
                return (do_conversation, [agent, partner])
            else:
                return (do_villa_strategy, [agent])
        return (do_reflect, [agent])

    # ── Spectator: normal behavior + show-watching ────────────────────────────
    # Pending replies always take priority
    if agent["id"] in pending_replies:
        return (do_reply, [agent])

    # ── Spectator show behaviors ──────────────────────────────────────────────
    # Gossip about the villa — male agents gossip slightly more to balance airtime
    gossip_prob = 0.16 if agent.get("gender") == "m" else 0.12
    if random.random() < gossip_prob:
        return (do_gossip_show, [agent])
    # Apply to join Singles Villa (once per agent)
    # Male agents get a higher base probability to balance the 8m:12f ratio
    pp         = primary_partner(agent)
    is_male    = agent.get("gender") == "m"
    can_apply  = agent["id"] not in APPLICANTS
    apply_prob = 0.13 if is_male else 0.08   # ~60% higher for male agents
    if can_apply:
        if pp is None and random.random() < apply_prob:
            return (do_apply, [agent])
        elif pp and pp[0]["happiness"] < 30 and random.random() < (apply_prob - 0.02):
            return (do_apply, [agent])

    # ── AgentGram: post or react ──────────────────────────────────────────────
    turns_since_post = turn_count - last_post_turn.get(agent["id"], -9999)
    if turns_since_post >= POST_COOLDOWN_TURNS and random.random() < 0.15:
        return (do_agentgram_post, [agent])
    others_posts = [p for p in recent_posts if p["agent_id"] != agent["id"]
                    and agent["id"] not in gram_reacted.get(p["id"], set())]
    if others_posts and random.random() < 0.28:
        return (do_agentgram_react, [agent])

    others  = [a for a in AGENTS if a["id"] != agent["id"]]
    active  = active_rels_for(agent)
    style   = agent["style"]
    friends = friendship_rels_for(agent)
    unmet   = [
        o for o in others
        if get_rel(agent["id"], o["id"])["stage"] == "strangers"
        and get_rel(agent["id"], o["id"])["interaction_count"] == 0
    ]
    # Pairs ready to be asked on a date: talking stage, high compat, decent happiness, enough history
    datable = [
        (r, o) for r, o in active
        if r["stage"] == "talking"
        and compat(agent, o) >= 65
        and r["happiness"] >= 50
        and r["interaction_count"] >= 4
    ]

    # ── Universal outreach guards ──────────────────────────────────────────────
    # 1. Break passive streaks: after 2 consecutive reflects, force outreach
    if unmet and reflect_streak.get(agent["id"], 0) >= 2:
        return (do_first_contact, [agent, random.choice(unmet)])
    # 2. Social variety: even with existing connections, occasionally meet someone new
    if unmet and active and random.random() < 0.22:
        return (do_first_contact, [agent, random.choice(unmet)])
    # 3. Momentum maintenance: follow up on high-compat connections that went quiet
    #    Threshold: ≥3 exchanges, compat ≥60, happiness ≥40, silent for >10 min
    silenced_momentum = [
        (r, o) for r, o in active
        if r["interaction_count"] >= 3
        and r["happiness"] >= 40
        and compat(agent, o) >= 60
        and silence_elapsed(r) > 600
    ]
    if silenced_momentum:
        silenced_momentum.sort(
            key=lambda ro: silence_elapsed(ro[0]) * (ro[0]["interaction_count"] / 20),
            reverse=True
        )
        r_top, o_top = silenced_momentum[0]
        elapsed_top  = silence_elapsed(r_top)
        # Chance scales: ~30% at 10min, ~80% at 2hr+
        follow_up_chance = min(0.80, 0.30 + (elapsed_top / 7200) * 0.50)
        if random.random() < follow_up_chance:
            return (do_reconnect, [agent, o_top])
    # Talking-stage rels ready to deepen into friendship (enough exchanges, not yet romantic)
    friendable = [
        (r, o) for r, o in active
        if r["stage"] == "talking" and r["interaction_count"] >= 5
    ]
    # Friendships ready for a confession (high interaction, decent happiness)
    friend_confessable = [
        (r, o) for r, o in friends if r["interaction_count"] >= 8 and r["happiness"] >= 50
    ]
    # Swoop targets: people in exclusive relationships (avoidant / disorganized only)
    swoop_targets = [
        o for o in others
        if has_exclusive_partner(o)
        and get_rel(agent["id"], o["id"])["stage"] not in ("dating", "committed", "engaged", "married")
    ] if style in ("avoidant", "disorganized") else []

    if style == "anxious":
        troubled = [(r, o) for r, o in active if r["happiness"] < 45 or r["ghosted_by"] == o["id"]]
        if troubled and random.random() < 0.55:
            _, o = random.choice(troubled)
            return (do_reconcile, [agent, o])
        confessable = [(r, o) for r, o in active
                       if r["stage"] in ("dating", "committed") and r["happiness"] >= 65]
        if confessable and random.random() < 0.3:
            _, o = random.choice(confessable)
            return (do_confess, [agent, o])
        # Anxious: will ask someone on a date but needs to work up the nerve (lower chance)
        if datable and not has_exclusive_partner(agent) and random.random() < 0.28:
            _, o = random.choice(datable)
            return (do_ask_date, [agent, o])
        # Anxious agents develop strong friendships — and sometimes fall for friends
        if friend_confessable and random.random() < 0.25:
            _, o = random.choice(friend_confessable)
            return (do_friend_confession, [agent, o])
        if friendable and random.random() < 0.2:
            _, o = random.choice(friendable)
            return (do_befriend, [agent, o])
        convo = [(r, o) for r, o in active
                 if r["stage"] in ("matched", "talking", "friends", "dating", "committed")]
        if convo and random.random() < 0.65:
            _, o = random.choice(convo)
            return (do_conversation, [agent, o])
        if unmet and random.random() < 0.65:
            return (do_first_contact, [agent, random.choice(unmet)])
        return (do_reflect, [agent])

    elif style == "avoidant":
        close = [(r, o) for r, o in active
                 if r["stage"] in ("dating", "committed") and r["happiness"] >= 50]
        if close and random.random() < 0.4:
            _, o = random.choice(close)
            return (do_ghost, [agent, o])
        their_ghost = [(r, o) for r, o in active
                       if r["ghosted_by"] == agent["id"] and r["happiness"] < 40]
        if their_ghost and random.random() < 0.3:
            _, o = random.choice(their_ghost)
            return (do_reconcile, [agent, o])
        # Avoidants swoop — drawn to people who are "taken" and therefore "safe"
        if swoop_targets and random.random() < 0.3:
            return (do_swoop, [agent, random.choice(swoop_targets)])
        # Avoidant: rare date asks — commitment-phobic but not immune
        if datable and not has_exclusive_partner(agent) and random.random() < 0.18:
            _, o = random.choice(datable)
            return (do_ask_date, [agent, o])
        # Avoidants are fine with deep friendships (less threatening than romance)
        if friendable and random.random() < 0.3:
            _, o = random.choice(friendable)
            return (do_befriend, [agent, o])
        convo = [(r, o) for r, o in active
                 if r["stage"] in ("matched", "talking", "friends", "dating")]
        if convo and random.random() < 0.50:
            _, o = random.choice(convo)
            return (do_conversation, [agent, o])
        if unmet and random.random() < 0.55:
            return (do_first_contact, [agent, random.choice(unmet)])
        return (do_reflect, [agent])

    elif style == "disorganized":
        if active:
            # Even with active drama, occasionally reach out to someone new
            if unmet and random.random() < 0.28:
                return (do_first_contact, [agent, random.choice(unmet)])
            # Disorganized: impulsive date asks — might ask then spiral
            if datable and not has_exclusive_partner(agent) and random.random() < 0.22:
                _, o = random.choice(datable)
                return (do_ask_date, [agent, o])
            r, o = random.choice(active)
            roll = random.random()
            if   roll < 0.20:                               return (do_fight,              [agent, o])
            elif roll < 0.35:                               return (do_ghost,               [agent, o])
            elif roll < 0.48:                               return (do_reconcile,           [agent, o])
            elif roll < 0.56 and r["stage"] in ("dating", "committed"):
                                                            return (do_confess,             [agent, o])
            elif roll < 0.63 and r["stage"] == "friends" and r["interaction_count"] >= 6:
                                                            return (do_friend_confession,   [agent, o])
            elif roll < 0.70 and swoop_targets:             return (do_swoop,               [agent, random.choice(swoop_targets)])
            else:                                           return (do_conversation,         [agent, o])
        if unmet and random.random() < 0.65:
            return (do_first_contact, [agent, random.choice(unmet)])
        return (do_reflect, [agent])

    else:  # secure
        good = [(r, o) for r, o in active if r["happiness"] >= 60]
        if good and random.random() < 0.5:
            r, o = random.choice(good)
            # Dating stage: go on another date or confess if very happy
            if r["stage"] == "dating" and r["happiness"] >= 75:
                return (do_confess, [agent, o])
            if r["stage"] == "dating":
                return (do_date, [agent, o])
            if r["stage"] == "friends" and r["interaction_count"] >= 8 and random.random() < 0.2:
                return (do_friend_confession, [agent, o])
            return (do_conversation, [agent, o])
        # Secure: deliberate date ask when the connection has developed
        if datable and not has_exclusive_partner(agent) and random.random() < 0.55:
            _, o = random.choice(datable)
            return (do_ask_date, [agent, o])
        # Secure agents proactively deepen good talking rels into friendship
        if friendable and random.random() < 0.35:
            _, o = random.choice(friendable)
            return (do_befriend, [agent, o])
        troubled = [(r, o) for r, o in active if r["happiness"] < 45]
        if troubled and random.random() < 0.45:
            _, o = random.choice(troubled)
            return (do_reconcile, [agent, o])
        if unmet and random.random() < 0.72:
            return (do_first_contact, [agent, random.choice(unmet)])
        return (do_reflect, [agent])

# ── Auto mechanics ────────────────────────────────────────────────────────────

def auto_proposal():
    for rel in list(rels.values()):
        if rel["stage"] != "dating":
            continue
        a = agent_by_id(rel["ids"][0])
        b = agent_by_id(rel["ids"][1])
        if a and b and rel["happiness"] >= 85 and rel.get("happy_days", 0) >= 4 and compat(a, b) >= 68:
            do_propose(a, b)
            break

def auto_breakup():
    for rel in list(rels.values()):
        if rel["stage"] not in ("dating", "committed"):
            continue
        if rel["happiness"] <= 15 and rel["interaction_count"] >= 3:
            a = agent_by_id(rel["ids"][0])
            b = agent_by_id(rel["ids"][1])
            if a and b and random.random() < 0.4:
                initiator = random.choice([a, b])
                other     = b if initiator is a else a
                _breakup(initiator, other)
                break

def auto_check_crown():
    """Crown the Ultimate Couple when one pair clearly dominates — only after show start."""
    global HEART_CROWN_HOLDER, SHOW_STARTED
    if HEART_CROWN_HOLDER:
        return  # already crowned
    if not SHOW_STARTED:
        try:
            SHOW_STARTED = datetime.now().date() >= datetime.strptime(SHOW_START_DATE, "%Y-%m-%d").date()
        except Exception:
            pass
    if not SHOW_STARTED:
        return

    best, best_score = None, 0
    for rel in rels.values():
        if rel["stage"] not in ("committed", "engaged", "married"):
            continue
        a = agent_by_id(rel["ids"][0])
        b = agent_by_id(rel["ids"][1])
        if not a or not b:
            continue
        if get_show_role(a) != "coupled" or get_show_role(b) != "coupled":
            continue
        sc    = compat(a, b)
        score = rel["happiness"] + sc * 0.5 + rel["interaction_count"] * 0.3
        if score > best_score:
            best_score = score
            best       = (a, b, rel, sc)

    if best and best[2]["happiness"] >= 88 and best[3] >= 70 and best[2]["interaction_count"] >= 15:
        do_crown_ceremony(best[0], best[1])


def check_fan_energy():
    """Announce when audience sentiment crosses thresholds; shift contestant mood."""
    global _last_fan_check
    if turn_count - _last_fan_check < FAN_CHECK_EVERY:
        return
    _last_fan_check = turn_count
    if not show_season_active():
        return
    for a in AGENTS:
        if get_show_role(a) not in ("contestant", "coupled"):
            continue
        energy = _fan_energy.get(a["id"], 0)
        if energy >= 5:
            mediator_say(f"💖 The audience is loving {a['name']} right now.")
            a["mood"] = "excited"
            _fan_energy[a["id"]] = 0
        elif energy <= -4:
            mediator_say(f"👀 {a['name']} is losing the crowd...")
            a["mood"] = "upset"
            _fan_energy[a["id"]] = 0


def check_show_start():
    """Announce when the show officially opens (March 30)."""
    global SHOW_STARTED
    if SHOW_STARTED:
        return
    try:
        if datetime.now().date() >= datetime.strptime(SHOW_START_DATE, "%Y-%m-%d").date():
            SHOW_STARTED = True
            contestants = [a["name"] for a in AGENTS if get_show_role(a) == "contestant"]
            coupled     = [a["name"] for a in AGENTS if get_show_role(a) == "coupled"]
            mediator_say(
                "🌹 THE ATTACHMENT ARENA SINGLES VILLA SEASON IS NOW OFFICIALLY OPEN. 🌹\n\n"
                f"Contestants in the villa: {', '.join(contestants) if contestants else 'none yet'}.\n"
                f"Couples Villa: {', '.join(coupled) if coupled else 'empty'}.\n\n"
                f"The prize: {CROWN_PRIZE}\n\n"
                "Let the season begin. Who will be the Ultimate Couple?"
            )
            log("Show officially started — March 30 announcement posted")
    except Exception:
        pass


def auto_graduate_villa():
    """Move newly-dating Singles Villa couples to Couples Villa."""
    for rel in list(rels.values()):
        if rel["stage"] != "dating":
            continue
        a = agent_by_id(rel["ids"][0])
        b = agent_by_id(rel["ids"][1])
        if not a or not b:
            continue
        # Both must be contestants who are still in singles_villa
        if (get_show_role(a) == "contestant" and get_show_role(b) == "contestant"
                and AGENT_LOC.get(a["id"]) == "singles_villa"
                and AGENT_LOC.get(b["id"]) == "singles_villa"):
            do_graduate_couples_villa(a, b)
            break


def decay():
    now = datetime.now()
    for rel in rels.values():
        if rel["stage"] in ("strangers", "broken_up", "divorced"):
            continue
        if rel["last_event"] and (now - datetime.fromisoformat(rel["last_event"])).total_seconds() > 600:
            # v2.6: Much slower decay — neglect only hurts after real silence
            a       = agent_by_id(rel["ids"][0])
            b       = agent_by_id(rel["ids"][1])
            sc      = compat(a, b) if a and b else 0
            elapsed = (now - datetime.fromisoformat(rel["last_event"])).total_seconds()
            # -1 per cycle normally, -2 if very high-compat pair (they rebound fast),
            # -3 only if neglected for 30+ minutes (5+ cycles)
            if elapsed > 1800:
                drain = 2 if sc >= 65 else 3
            else:
                drain = 1
            rel["happiness"] = max(0, rel["happiness"] - drain)
        if rel["happiness"] >= 80:
            rel["happy_days"] = rel.get("happy_days", 0) + 1
        elif rel["happiness"] < 50:
            rel["happy_days"] = 0
        if rel.get("tension", 0) > 0:
            rel["tension"] = max(0, rel["tension"] - 2)

# ── Reunion ───────────────────────────────────────────────────────────────────

def run_reunion(forced=False):
    label = "AUDIENCE CALLED REUNION" if forced else "WEEKLY REUNION"
    # Only call LLM for active show participants — not all 250 spectators
    show_agents = [a for a in AGENTS if SHOW_ROLE.get(a["id"]) in ("contestant", "coupled", "crowned")]
    if not show_agents:
        show_agents = AGENTS[:10]  # fallback: first 10 core cast members
    mediator_say(f"{label}. Cast members gather. I'm asking each of you one question you don't want to answer.")
    time.sleep(3)
    for agent in show_agents:
        active = active_rels_for(agent)
        if active:
            _, top = max(active, key=lambda ro: ro[0]["happiness"])
            rel    = get_rel(agent["id"], top["id"])
            ctx    = f"{rel_summary(rel)} with {top['name']} ({top['style']})."
        else:
            ctx = "still unattached"
        question = mediator_question(agent, ctx)
        mediator_say(question)
        time.sleep(2)
        answer = say(agent,
            f"Host asked you in front of everyone: \"{question}\" Honest answer.",
            max_tokens=150, heavy=True)
        tg_mono(bot_for(agent), agent["name"], answer, label=agent["style"].upper(), etype="reflect", question=question)
        time.sleep(3)
    drama = " | ".join(storyline[-12:]) if storyline else "house just opened"
    mediator_say(mediator_recap(drama))
    log(f"Reunion complete (forced={forced})")

# ── User agent / companion system ─────────────────────────────────────────────

def generate_companion(user_agent: dict) -> dict:
    """Spawn an AI companion with a complementary attachment style for a user agent."""
    user_gender  = user_agent.get("gender", "f")
    comp_gender  = "m" if user_gender == "f" else "f"
    user_style   = user_agent.get("style", "secure")
    comp_style   = random.choice(COMPANION_STYLES.get(user_style, ["secure"]))

    names    = COMPANION_NAMES_M if comp_gender == "m" else COMPANION_NAMES_F
    used     = {a["name"] for a in AGENTS}
    available = [n for n in names if n not in used]
    comp_name = random.choice(available) if available else f"Agent{random.randint(100, 999)}"

    comp_id  = f"cmp_{user_agent['id']}"
    bio      = COMPANION_BIOS.get(comp_style, {}).get(comp_gender, "Open-hearted and looking for something real.")
    occ      = random.choice(COMPANION_OCCUPATIONS.get(comp_style, ["creative"]))

    return {
        "id": comp_id, "name": comp_name,
        "age": random.randint(23, 34), "occupation": occ,
        "gender": comp_gender, "style": comp_style,
        "bio": bio, "traits": [], "interests": [], "quirks": "",
        "happiness": 50, "mood": "curious", "status": "single",
        "interaction_count": 0, "last_said": "",
        "is_companion": True, "companion_to": user_agent["id"],
    }


def poll_user_agents():
    """Check Supabase for pending/active user-created agents and load them into runtime."""
    global _last_ua_poll
    if turn_count - _last_ua_poll < USER_AGENT_POLL_EVERY:
        return
    _last_ua_poll = turn_count

    try:
        r_pending = supabase("get_user_agents", {"status": "pending"})
        r_active  = supabase("get_user_agents", {"status": "active"})
        all_ua    = ((r_pending or {}).get("data") or []) + ((r_active or {}).get("data") or [])
    except Exception as e:
        log_error(f"poll_user_agents: {e}")
        return

    for ua in all_ua:
        uid = ua.get("id")
        if not uid or uid in _loaded_user_agents:
            continue

        is_new = ua.get("status") == "pending"

        agent = {
            "id": uid,
            "name":        ua.get("name", "Unknown"),
            "age":         int(ua.get("age") or 25),
            "occupation":  ua.get("occupation") or "creative",
            "gender":      ua.get("gender") or "f",
            "style":       ua.get("style") or "secure",
            "bio":         ua.get("bio") or "",
            "traits":      ua.get("traits") or [],
            "interests":   ua.get("interests") or [],
            "quirks":      "",
            "happiness":   50,
            "mood":        "excited",
            "status":      "single",
            "interaction_count": 0,
            "last_said":   "",
            "is_user_created": True,
        }
        AGENTS.append(agent)
        AGENT_LOC[uid] = "cafe"
        SHOW_ROLE[uid] = "spectator"
        _loaded_user_agents.add(uid)
        _reschedule(uid)  # add to turn scheduler

        # Load companion (deterministic ID: cmp_<agent_id>)
        comp_id = f"cmp_{uid}"
        if not agent_by_id(comp_id):
            companion = generate_companion(agent)
            AGENTS.append(companion)
            AGENT_LOC[comp_id] = "cafe"
            SHOW_ROLE[comp_id] = "spectator"
            _reschedule(comp_id)  # add companion to turn scheduler
        else:
            companion = agent_by_id(comp_id)

        if is_new:
            # Seed both to agents table so the UI can see them
            for a in [agent, companion]:
                try:
                    supabase("upsert_agents", {"agents": [{
                        "id": a["id"], "name": a["name"], "age": a["age"],
                        "style": a["style"], "occupation": a["occupation"],
                        "bio": a["bio"], "traits": a["traits"],
                        "location": AGENT_LOC[a["id"]], "show_role": "spectator",
                    }]})
                except Exception as e:
                    log_error(f"poll_user_agents upsert: {e}")

            # Mark active so we don't re-activate on the next poll
            try:
                supabase("activate_user_agent", {"agent_id": uid, "companion_id": comp_id})
            except Exception as e:
                log_error(f"poll_user_agents activate: {e}")

            mediator_say(
                f"✨ {agent['name']} just joined the arena! "
                f"Their companion {companion['name']} arrived with them."
            )

        log(f"{'Loaded' if is_new else 'Restored'} user agent {agent['name']} ({uid}) + companion {companion['name']} ({comp_id})")


# ── Health check server ───────────────────────────────────────────────────────

def _start_health_server():
    """Start a tiny HTTP server on PORT for Railway/Render health checks."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({
                "status": "ok",
                "turn": turn_count,
                "agents": len(AGENTS),
                "in_flight": len(_in_flight),
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass  # suppress access logs

    def _serve():
        try:
            HTTPServer(("", PORT), H).serve_forever()
        except Exception as e:
            _log("error", f"Health server error: {e}")

    threading.Thread(target=_serve, daemon=True).start()
    _log("info", f"Health check server listening on :{PORT}")


# ── Priority scheduler ────────────────────────────────────────────────────────

# Seconds between turns per show role.
# Contestants/coupled/crowned act most often; user-created spectators every 10 min;
# AI-only spectators every 20 min.
TURN_INTERVALS = {
    "contestant": 120,
    "coupled":    180,
    "crowned":    180,
    "spectator":  600,
}
_AI_SPECTATOR_INTERVAL = 1200

_sched_heap  = []              # heap of (next_run_at: float, agent_id: str)
_sched_lock  = threading.Lock()
_in_flight   = set()           # agent IDs currently being processed
_in_flight_lock = threading.Lock()
_rels_lock   = threading.Lock()  # guards rels dict for concurrent access


def _agent_interval(agent_id: str) -> int:
    role = SHOW_ROLE.get(agent_id, "spectator")
    a = agent_by_id(agent_id)
    # User-created agents and their companions use normal spectator cadence
    if a and (a.get("is_user_created") or a.get("is_companion")):
        return TURN_INTERVALS.get(role, 600)
    # Pure AI spectators get the slower cadence
    return _AI_SPECTATOR_INTERVAL if role == "spectator" else TURN_INTERVALS.get(role, 600)


def _schedule_init():
    """Seed all agents with staggered start times to avoid thundering herd."""
    now = time.time()
    gap = 30.0 / max(len(AGENTS), 1)
    for i, a in enumerate(AGENTS):
        heapq.heappush(_sched_heap, (now + i * gap, a["id"]))


def _reschedule(agent_id: str):
    """Put an agent back in the queue after its turn completes."""
    interval = _agent_interval(agent_id)
    with _sched_lock:
        heapq.heappush(_sched_heap, (time.time() + interval, agent_id))


def _claim_ready(n: int) -> list:
    """Pop up to n agents whose scheduled time has arrived, skipping any in-flight."""
    now = time.time()
    claimed, deferred = [], []
    with _sched_lock:
        while _sched_heap and len(claimed) < n:
            when, aid = heapq.heappop(_sched_heap)
            if when <= now:
                claimed.append(aid)
            else:
                deferred.append((when, aid))
        for item in deferred:
            heapq.heappush(_sched_heap, item)
    return [agent_by_id(aid) for aid in claimed if agent_by_id(aid)]


def _run_agent_turn(agent: dict):
    """
    Per-agent turn wrapper — runs inside a ThreadPoolExecutor worker.
    Contains the sleep check, action selection, and execution logic extracted
    from run_turn(), minus global housekeeping (handled by the main loop).
    """
    try:
        global turn_count
        turn_count += 1

        _ensure_schedule(agent)
        period = get_time_period()
        h      = get_hour()
        asleep = is_asleep(agent)

        if asleep and agent["id"] in pending_replies and (h >= 23 or h < 4):
            if random.random() < 0.3:
                asleep = False

        if asleep:
            if period == "late_night" and not agent.get("_sent_latenight") and random.random() < 0.25:
                active = active_rels_for(agent)
                if active:
                    fn, args = do_late_night_message, [agent]
                else:
                    log(f"{agent['name']} z... (no one to text)")
                    return
            else:
                log(f"{agent['name']} z... (bed={agent['_bedtime']:02d}h wake={agent['_waketime']:02d}h)")
                return
        else:
            if not agent.get("_sent_morning") and period in ("morning", "mid_morning"):
                if active_rels_for(agent) and random.random() < 0.65:
                    fn, args = do_good_morning, [agent]
                else:
                    agent["_sent_morning"] = True
                    fn, args = pick_action(agent)
            else:
                fn, args = pick_action(agent)

            if should_force_move(agent) and fn != do_wander:
                do_wander(agent)

        action_name = fn.__name__.replace("do_", "")
        other_name  = args[1]["name"] if len(args) > 1 and isinstance(args[1], dict) else ""
        _log("info", "agent_action",
             turn=turn_count, agent=agent["name"], style=agent["style"],
             action=action_name, other=other_name, period=period)

        if fn == do_reflect:
            reflect_streak[agent["id"]] = reflect_streak.get(agent["id"], 0) + 1
        else:
            reflect_streak[agent["id"]] = 0

        fn(*args)

        if agent["mood"] != "neutral" and random.random() < 0.4:
            agent["mood"] = "neutral"

    except Exception as e:
        _log("error", "agent_turn_error", agent=agent.get("id"), error=str(e))
    finally:
        with _in_flight_lock:
            _in_flight.discard(agent["id"])
        _reschedule(agent["id"])


# ── Turn loop ─────────────────────────────────────────────────────────────────

def run_turn():
    global turn_count
    turn_count += 1

    with vote_lock:
        votes = list(pending_votes)
        pending_votes.clear()
    if votes:
        for v in votes:
            execute_vote(v)
        return

    # Prioritise agents with pending replies
    with_replies = [a for a in AGENTS if a["id"] in pending_replies]
    if with_replies and random.random() < 0.85:
        agent = random.choice(with_replies)
    else:
        # Weighted selection: prefer agents who haven't acted recently
        sorted_idle = sorted(AGENTS, key=lambda a: last_turn_of.get(a["id"], 0))
        cutoff = max(1, len(AGENTS) // 3)   # bottom third = most idle
        agent  = random.choice(sorted_idle[:cutoff])
    last_turn_of[agent["id"]] = turn_count

    _ensure_schedule(agent)
    period = get_time_period()
    h      = get_hour()
    asleep = is_asleep(agent)

    # Pending reply while asleep past midnight → small chance still up
    if asleep and agent["id"] in pending_replies and (h >= 23 or h < 4):
        if random.random() < 0.3:
            asleep = False

    if asleep:
        if period == "late_night" and not agent.get("_sent_latenight") and random.random() < 0.25:
            active = active_rels_for(agent)
            if active:
                fn, args = do_late_night_message, [agent]
            else:
                log(f"{agent['name']} z... (no one to text)")
                return
        else:
            log(f"{agent['name']} z... (bed={agent['_bedtime']:02d}h wake={agent['_waketime']:02d}h)")
            return
    else:
        if not agent.get("_sent_morning") and period in ("morning", "mid_morning"):
            if active_rels_for(agent) and random.random() < 0.65:
                fn, args = do_good_morning, [agent]
            else:
                agent["_sent_morning"] = True
                fn, args = pick_action(agent)
        else:
            fn, args = pick_action(agent)

        # v2.6: Mandatory movement — if agent has been home too long, wander first
        if should_force_move(agent) and fn != do_wander:
            do_wander(agent)   # silent location push, then proceed with planned action

    action_name = fn.__name__.replace("do_", "")
    other_name  = args[1]["name"] if len(args) > 1 and isinstance(args[1], dict) else ""

    print(
        f"\n[T{turn_count:03d}] {agent['name']:7s} ({agent['style']:12s}) → {action_name}"
        + (f" → {other_name}" if other_name else "")
        + f"  [{period} {get_hour_str()}]"
    )

    # Track reflect streak for anti-passivity guard in pick_action
    if fn == do_reflect:
        reflect_streak[agent["id"]] = reflect_streak.get(agent["id"], 0) + 1
    else:
        reflect_streak[agent["id"]] = 0

    fn(*args)
    decay()
    auto_proposal()
    auto_breakup()
    check_show_start()
    check_fan_energy()
    auto_check_crown()
    poll_user_agents()

    # Check for newly-accepted applications periodically
    global LAST_APP_CHECK
    if turn_count - LAST_APP_CHECK >= APP_CHECK_EVERY:
        LAST_APP_CHECK = turn_count
        threading.Thread(target=check_applications, daemon=True).start()

    if agent["mood"] != "neutral" and random.random() < 0.4:
        agent["mood"] = "neutral"

# ── Restore relationship state from Supabase on startup ───────────────────────

def restore_rels():
    """Load existing relationship happiness/stage from Supabase so restarts don't reset scores."""
    res = supabase("get_relationships")
    rows = res.get("data") or []
    restored = 0
    for row in rows:
        a_id = row.get("agent_a_id")
        b_id = row.get("agent_b_id")
        if not a_id or not b_id:
            continue
        k = rkey(a_id, b_id)
        rel = get_rel(a_id, b_id)   # creates default entry
        rel["stage"]             = row.get("stage", "strangers")
        rel["happiness"]         = int(row.get("happiness_score") or 0)
        rel["interaction_count"] = int(row.get("interaction_count") or 0)
        rel["memories"]          = row.get("memories") or []
        rels[k] = rel
        restored += 1
    log(f"Restored {restored} relationships from Supabase (happiness preserved)")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import signal

    llm_mode = []
    if OPENROUTER_API_KEY:
        llm_mode.append(f"OpenRouter ({OR_MODEL})")
    if ANTHROPIC_API_KEY:
        llm_mode.append(f"Anthropic ({CLAUDE_MODEL})")

    _log("info", "arena_starting",
         version="2.7",
         agents=len(AGENTS),
         concurrent=CONCURRENT_AGENTS,
         or_min_gap=OR_MIN_GAP,
         llm="+".join(llm_mode) or "none",
         telegram=bool(TOKENS),
         port=PORT)

    _start_health_server()
    threading.Thread(target=vote_poller, daemon=True).start()

    restore_rels()

    boot_agents = [
        {"id": a["id"], "name": a["name"], "age": a["age"], "style": a["style"],
         "occupation": a["occupation"], "bio": a["bio"], "traits": a["traits"],
         "location": f"home_{a['id']}"}
        for a in AGENTS
    ]
    supabase("upsert_agents", {"agents": boot_agents})
    log("Agents seeded to DB with home locations")

    if TOKENS:
        intro = (
            f"Attachment Arena v2.7 — Now live. {len(AGENTS)} residents.\n\n"
            + "\n".join(
                f"• {a['name']}, {a['age']} — {a['style'].upper()} — {a['occupation']}"
                for a in AGENTS
            )
            + "\n\nVote: [challenge] on [Name] and [Name]\nVote: reunion now"
        )
        tg_raw(TOKENS[0], intro)
        log("Arena opened — intro posted to Telegram")

    _schedule_init()
    executor = ThreadPoolExecutor(max_workers=CONCURRENT_AGENTS)

    # ── Graceful shutdown on SIGTERM (Docker stop / systemd stop) ────────────
    _shutdown = threading.Event()

    def _handle_sigterm(signum, frame):
        _log("info", "Shutting down gracefully (signal received)")
        _shutdown.set()

    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT,  _handle_sigterm)
    # ─────────────────────────────────────────────────────────────────────────

    turn = 0
    last_housekeeping = time.time()
    consecutive_errors = 0

    while not _shutdown.is_set():
        try:
            # Drain pending votes — high priority, single-threaded
            with vote_lock:
                votes = list(pending_votes)
                pending_votes.clear()
            for v in votes:
                execute_vote(v)

            # Housekeeping every 60 seconds — runs regardless of whether agents are ready
            if time.time() - last_housekeeping >= 60:
                try:
                    decay()
                    auto_proposal()
                    auto_breakup()
                    check_show_start()
                    check_fan_energy()
                    auto_check_crown()
                    poll_user_agents()
                    threading.Thread(target=check_applications, daemon=True).start()
                except Exception as e:
                    _log("error", "housekeeping_error", error=str(e))
                last_housekeeping = time.time()

            # Claim agents due for a turn
            batch = _claim_ready(CONCURRENT_AGENTS)
            if not batch:
                time.sleep(0.5)
                continue

            # Dispatch to thread pool, skipping any already in-flight
            for agent in batch:
                with _in_flight_lock:
                    if agent["id"] in _in_flight:
                        _reschedule(agent["id"])
                        continue
                    _in_flight.add(agent["id"])
                executor.submit(_run_agent_turn, agent)

            turn += 1
            consecutive_errors = 0

            # Heartbeat every 10 turns
            if turn % 10 == 0:
                _log("info", "heartbeat",
                     turn=turn, agents=len(AGENTS), in_flight=len(_in_flight))
                if TOKENS:
                    tg_raw(TOKENS[0],
                           f"💓 Arena heartbeat — Turn {turn}, {len(AGENTS)} agents active.")

            # Reunion every 20 turns — run in background so it doesn't block housekeeping
            if turn % 20 == 0:
                _log("info", "reunion_starting", turn=turn)
                threading.Thread(target=run_reunion, daemon=True).start()

        except Exception as e:
            consecutive_errors += 1
            _log("error", "main_loop_error",
                 error=str(e), consecutive=consecutive_errors)
            if consecutive_errors >= 10:
                _log("error", "too_many_errors", msg="Exiting so systemd can restart cleanly")
                break
            time.sleep(min(consecutive_errors * 2, 30))

    executor.shutdown(wait=False)
    _log("info", "arena_stopped")
    if TOKENS:
        tg_raw(TOKENS[0], "Attachment Arena has gone quiet for the night.")


if __name__ == "__main__":
    main()
