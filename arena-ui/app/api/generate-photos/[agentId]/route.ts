import { NextRequest, NextResponse } from 'next/server'
import type { PhotoContextTag, AgentPhoto } from '@/types/photos'

interface PhotoSeed {
  contextTag: PhotoContextTag
  label: string
  caption: string
  timestamp: string
  prompt: string
}

// ── Per-agent photo seeds ─────────────────────────────────────────────────────
// 5 photos per agent. Prompts aim for candid lifestyle photography.
// Style: "cinematic, film grain, shallow depth of field, muted tones, no text, photorealistic"

const BASE = 'photorealistic candid lifestyle photo, film grain, shallow depth of field, muted tones, no text, no watermark, when person is visible their full head is in frame with generous headroom above crown, face not cropped at top or chin'
const NEGATIVE = 'cropped forehead, cropped chin, cut off head, partial face, head cut off at top, missing top of head, head touching top edge of frame'

const PHOTO_SEEDS: Record<string, PhotoSeed[]> = {
  maya: [
    {
      contextTag: 'morning_routine',
      label: 'Morning Ritual',
      caption: 'made three cups of tea. drank none of them.',
      timestamp: 'this morning',
      prompt: `${BASE}. young south asian woman 27, dark curly hair, sitting cross-legged on a yoga mat at dawn, three half-full mugs of tea around her, soft golden hour window light, slightly distracted expression, cozy apartment`,
    },
    {
      contextTag: 'creative_space',
      label: 'Journaling',
      caption: "wrote four pages and then couldn't remember what i said.",
      timestamp: '2 days ago',
      prompt: `${BASE}. young south asian woman 27, dark curly hair, writing intensely in a journal at a small café table, warm lamplight, slight worry crease between brows, coffee going cold, creative clutter around her`,
    },
    {
      contextTag: 'late_night',
      label: 'Overthinking Hours',
      caption: 'why do I always do this at 2am.',
      timestamp: 'last tuesday',
      prompt: `${BASE}. young south asian woman 27, lying on her bed staring at ceiling, phone face-down on her chest, dim bedroom light, slightly dramatic shadow, introspective mood, soft fairy lights in background`,
    },
    {
      contextTag: 'social_moment',
      label: 'Yoga Class',
      caption: 'finally present. for like six whole minutes.',
      timestamp: '4 days ago',
      prompt: `${BASE}. young south asian woman 27, dark curly hair, in a yoga class, warrior pose, soft studio light, genuinely focused expression, natural light through large windows, other blurred figures in background`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'After the Rain',
      caption: 'everything smells like rain and almost.',
      timestamp: 'last week',
      prompt: `${BASE}. young south asian woman 27, standing at a rain-wet window, looking outside with a gentle longing expression, overcast afternoon light, cozy sweater, warm interior vs grey exterior, quiet melancholy`,
    },
  ],

  jake: [
    {
      contextTag: 'nature_escape',
      label: 'Solo Hike',
      caption: 'no signal. finally.',
      timestamp: 'last weekend',
      prompt: `${BASE}. white man 30, dark hair, hiking alone on a mossy Pacific Northwest trail, back to camera, moody overcast light, tall ferns, alone in frame, quiet focused energy, fleece jacket`,
    },
    {
      contextTag: 'late_night',
      label: 'Night Coding',
      caption: 'it is what it is.',
      timestamp: 'wednesday night',
      prompt: `${BASE}. white man 30, dark hair, at a minimal desk setup, multiple monitors glowing blue, late night, dark apartment, coffee mug, headphones around neck, slightly tired but absorbed expression`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Coffee Ritual',
      caption: 'one thing i do not skip.',
      timestamp: 'this morning',
      prompt: `${BASE}. white man 30, dark hair, precise pour-over coffee setup on a clean kitchen counter, morning light, measured careful movements implied, minimalist apartment, alone, calm and self-contained`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'At the Bar Alone',
      caption: "good book, better beer, no one to explain myself to.",
      timestamp: '3 days ago',
      prompt: `${BASE}. white man 30, dark hair, sitting alone at a wooden bar, paperback book open, half-finished beer, warm dim pub lighting, relaxed and unguarded, not looking at camera, comfortable in solitude`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Summit',
      caption: 'up here it all makes sense.',
      timestamp: 'last month',
      prompt: `${BASE}. white man 30, standing on a mountain ridge, overcast sky, looking out over valley, back mostly to camera, windswept, alone, sense of hard-won peace, dramatic landscape behind him`,
    },
  ],

  priya: [
    {
      contextTag: 'morning_routine',
      label: 'Sunday Kitchen',
      caption: 'this is the only hour i keep for myself.',
      timestamp: 'sunday morning',
      prompt: `${BASE}. south asian woman 29, warm confident face, cooking in a bright airy kitchen, golden morning light, unhurried, flour-dusted hands, soft smile, natural and grounded energy, plants on windowsill`,
    },
    {
      contextTag: 'social_moment',
      label: 'With Friends',
      caption: "full table, good people. this is what it's for.",
      timestamp: 'saturday night',
      prompt: `${BASE}. south asian woman 29, laughing genuinely at a dinner table with friends, warm candlelight, mid-conversation, relaxed and fully present, friends blurred in background, genuine joy not performance`,
    },
    {
      contextTag: 'creative_space',
      label: 'Therapy Notes',
      caption: 'the work matters. i do not forget that.',
      timestamp: 'thursday',
      prompt: `${BASE}. south asian woman 29, at a calm organized therapy office desk, reviewing handwritten notes, soft daylight from frosted window, professional but warm space, plants, focused and purposeful expression`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Morning Walk',
      caption: 'started carrying a book. end up just walking.',
      timestamp: '5 days ago',
      prompt: `${BASE}. south asian woman 29, walking confidently on a tree-lined path, book under arm, dappled morning light, unhurried stride, comfortable in herself, looking slightly ahead not at camera`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Reading Hour',
      caption: "someone wrote exactly what i couldn't say. i read it three times.",
      timestamp: 'last tuesday',
      prompt: `${BASE}. south asian woman 29, curled in a deep chair reading a novel, afternoon light through curtains, tea nearby, fully absorbed, glasses perched, warm and comfortable, totally at ease alone`,
    },
  ],

  leo: [
    {
      contextTag: 'creative_space',
      label: 'Late Session',
      caption: 'started at midnight. not sure what time it is.',
      timestamp: 'last night',
      prompt: `${BASE}. young man 26, curly dark hair, in a chaotic music studio at 2am, surrounded by instruments and cables, lit by a single lamp and monitor glow, intensely focused on guitar, empty coffee cups, authentic creative chaos`,
    },
    {
      contextTag: 'late_night',
      label: 'Somewhere on the Street',
      caption: "couldn't sleep. ended up here. don't know why.",
      timestamp: '3am wednesday',
      prompt: `${BASE}. young man 26, curly hair, standing alone on a rain-slicked city street at night, neon reflections, hands in pockets, looking up, simultaneously lost and searching, moody dramatic light`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Empty Stage',
      caption: 'this is the only place i know who i am.',
      timestamp: 'before soundcheck',
      prompt: `${BASE}. young man 26, curly dark hair, sitting alone on an empty stage, single spotlight, guitar in lap, head bowed, powerful and lonely, dust motes in the light beam, cinematic`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Woke Up Like This',
      caption: 'noon counts as morning.',
      timestamp: 'today-ish',
      prompt: `${BASE}. young man 26, curly hair disheveled, sitting on edge of an unmade bed, holding a journal and pen, looks like he slept in his clothes, instruments visible in background, mid-thought expression`,
    },
    {
      contextTag: 'social_moment',
      label: 'After the Show',
      caption: 'for exactly one hour, everything fits.',
      timestamp: 'last friday',
      prompt: `${BASE}. young man 26, curly dark hair, after a small venue show, flushed and electric, surrounded by people but somehow still slightly apart, stage sweat, guitar strap over shoulder, magnetic energy`,
    },
  ],

  zara: [
    {
      contextTag: 'social_moment',
      label: 'The Meeting',
      caption: "they said it couldn't be done. i didn't argue.",
      timestamp: 'tuesday morning',
      prompt: `${BASE}. black woman 31, natural hair up, leading a meeting with confident body language, standing at a whiteboard, warm but authoritative presence, modern office with large windows, powerful and at ease`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Early Run',
      caption: 'before the world catches up.',
      timestamp: '6am today',
      prompt: `${BASE}. black woman 31, natural hair back, running through a park at early morning, golden light just breaking, athletic and confident stride, headphones in, strong and unhurried, beautiful morning light`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Working Breakfast',
      caption: 'the plan is always better with good coffee.',
      timestamp: 'this morning',
      prompt: `${BASE}. black woman 31, natural hair, at a café table with laptop open and coffee, planner next to it, focused but relaxed, morning light, self-possessed and purposeful, unhurried confidence`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Rooftop Hour',
      caption: 'i built this. i keep forgetting that.',
      timestamp: 'last thursday',
      prompt: `${BASE}. black woman 31, standing on a city rooftop at golden hour, looking out over skyline, glass of wine in hand, reflective smile, quiet pride, warm evening light, city below, fully in herself`,
    },
    {
      contextTag: 'social_moment',
      label: 'Dinner with Friends',
      caption: 'laughed until my stomach hurt. i needed that.',
      timestamp: 'friday night',
      prompt: `${BASE}. black woman 31, laughing hard at a dinner party, head tilted back, warm candlelight, relaxed and completely herself, friends visible but blurred, genuine unbothered joy`,
    },
  ],

  nia: [
    {
      contextTag: 'creative_space',
      label: 'Design Desk',
      caption: 'four tabs open. seventeen browser bookmarks. i know what i want.',
      timestamp: 'this afternoon',
      prompt: `${BASE}. young black woman 25, natural hair with colorful wrap, at a bright creative desk covered in color swatches and sketches, dual monitor with design work, lots of stickers and plants, slightly chaotic but joyful, headphones on neck`,
    },
    {
      contextTag: 'social_moment',
      label: 'Vintage Market',
      caption: 'found the jacket. texted four people about it immediately.',
      timestamp: 'last saturday',
      prompt: `${BASE}. young black woman 25, natural hair, excited expression at an outdoor vintage market, holding up a jacket to the light, warm afternoon sun, slightly manic happy energy, joy barely contained`,
    },
    {
      contextTag: 'late_night',
      label: '11pm Spiral',
      caption: "i'm fine. i'm probably fine. i'll text first. no i won't.",
      timestamp: 'last night',
      prompt: `${BASE}. young black woman 25, sitting on floor with back against bed, phone in both hands, worried-but-trying-not-to-show-it expression, dim bedroom light, string lights, the look of someone composing and deleting a text`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Breakfast Spread',
      caption: 'made a whole thing. no one to share it with. whatever.',
      timestamp: 'sunday',
      prompt: `${BASE}. young black woman 25, natural hair loose, elaborate colorful breakfast spread on a small kitchen table, sat looking at it with a mix of pride and sadness, warm morning light, cozy apartment, slightly too much food for one person`,
    },
    {
      contextTag: 'social_moment',
      label: 'Concert Night',
      caption: 'this is where i make sense.',
      timestamp: 'last friday',
      prompt: `${BASE}. young black woman 25, at an outdoor concert, phone up filming, pure unself-conscious joy, warm stage light on her face, crowd around her, completely in the moment for once, genuine happiness`,
    },
  ],

  marcus: [
    {
      contextTag: 'creative_space',
      label: 'Drawing Table',
      caption: 'the detail is where the intention lives.',
      timestamp: 'wednesday evening',
      prompt: `${BASE}. black man 33, close-cropped hair, at a large drafting table covered in architectural drawings, warm desk lamp, deliberate and focused, pencil in hand mid-sketch, structured but not rigid space, evening light`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Morning Cycle',
      caption: 'the city makes more sense from a bicycle.',
      timestamp: 'this morning',
      prompt: `${BASE}. black man 33, cycling on a quiet city street at morning, calm and unhurried, good posture, looking slightly ahead, dappled light through trees, quiet confidence, the kind of person who just does the thing`,
    },
    {
      contextTag: 'social_moment',
      label: 'Jazz Night',
      caption: "don't talk during the solo. that's all i ask.",
      timestamp: 'thursday',
      prompt: `${BASE}. black man 33, at a small jazz club, leaning forward intently listening to musicians, warm amber light, glass of whiskey in hand, completely absorbed, thoughtful and present, other patrons softly blurred`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Site Visit',
      caption: 'something about unfinished buildings.',
      timestamp: 'tuesday afternoon',
      prompt: `${BASE}. black man 33, standing in a partially constructed building looking up at exposed beams and light, hard hat in hand, thoughtful expression, dramatic light shafts through concrete, one figure in large empty space, sense of potential`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Saturday Slow',
      caption: 'i do nothing quickly on saturdays.',
      timestamp: 'saturday',
      prompt: `${BASE}. black man 33, reading a physical newspaper at a quiet kitchen table, coffee and morning light, relaxed and completely unhurried, calm settled energy, simple clean kitchen, fully at rest`,
    },
  ],

  sienna: [
    {
      contextTag: 'creative_space',
      label: 'In the Darkroom',
      caption: 'the only place where waiting feels right.',
      timestamp: 'yesterday',
      prompt: `${BASE}. white woman 28, dark hair pulled back, leaning over a film photography contact sheet with a loupe, red darkroom light, deliberate careful attention, hands smelling of fixer, the work is everything right now`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Solo Trip',
      caption: 'went somewhere no one knew the address.',
      timestamp: 'last weekend',
      prompt: `${BASE}. white woman 28, dark hair, photographing a misty coastal landscape, back to camera, Canon film camera raised, dramatic grey sky and sea, entirely alone, defined by the tool in her hands, not herself`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Coffee Before the World',
      caption: 'the hour before anyone needs anything from me.',
      timestamp: 'this morning',
      prompt: `${BASE}. white woman 28, dark hair loose, small apartment kitchen, single perfect coffee cup, looking out window with a neutral expression that is doing a lot of work, keeps people at exactly one arm's length, quiet morning`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Editing Session',
      caption: 'every photo is a decision about what to leave out.',
      timestamp: '3 days ago',
      prompt: `${BASE}. white woman 28, at a desk covered in printed photos, reviewing them with careful detachment, afternoon light, dry expression, a kind of cool intelligence, the viewer feels she sees through them too`,
    },
    {
      contextTag: 'social_moment',
      label: 'At the Edge',
      caption: "i came. that's enough.",
      timestamp: 'friday night',
      prompt: `${BASE}. white woman 28, dark hair, at a party or gallery opening, standing slightly apart from the group, wine glass, dry half-smile, watching rather than participating, sharp observational eye, beautiful in the margins of someone else's photo`,
    },
  ],

  eli: [
    {
      contextTag: 'morning_routine',
      label: 'Opening Shift',
      caption: 'here before everyone. the way i like it.',
      timestamp: 'this morning',
      prompt: `${BASE}. white man 24, round glasses, light brown hair, carefully making pour-over coffee in an empty café before opening, warm amber light, quiet focused expression, apron on, slight morning tiredness`,
    },
    {
      contextTag: 'creative_space',
      label: 'Working on Something',
      caption: "three drafts and none of them are right yet.",
      timestamp: 'last night',
      prompt: `${BASE}. white man 24, round glasses, bent over a notebook at a small wooden desk, lamp light, crumpled pages nearby, pen in hand mid-thought, cozy apartment, earnest creative concentration`,
    },
    {
      contextTag: 'social_moment',
      label: 'Reading Group',
      caption: 'someone agreed with me and i forgot what i was saying.',
      timestamp: 'tuesday evening',
      prompt: `${BASE}. white man 24, round glasses, at a bookshop reading event, mid-sentence gesture, a little flushed, good warm lighting, other attendees softly blurred, animated and slightly self-conscious`,
    },
    {
      contextTag: 'late_night',
      label: 'Last Order',
      caption: 'waited for a message that didn\'t come. made coffee instead.',
      timestamp: 'last wednesday',
      prompt: `${BASE}. white man 24, round glasses, alone in a coffee shop after closing, single lamp on, mug in both hands, looking at phone on the table, quiet and a little sad, warm dark atmosphere`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Bookshop Saturday',
      caption: 'spent forty minutes deciding. bought both.',
      timestamp: 'last saturday',
      prompt: `${BASE}. white man 24, round glasses, in an independent bookshop, holding two books comparing them, soft diffuse light through window, absorbed and slightly overwhelmed in a pleasant way`,
    },
  ],

  carmen: [
    {
      contextTag: 'morning_routine',
      label: 'Pre-Shift',
      caption: 'ten minutes before the world needs something from me.',
      timestamp: 'this morning',
      prompt: `${BASE}. latina woman 29, dark hair back, in hospital scrubs in a break room, coffee in both hands, eyes closed for a moment of quiet before the shift, fluorescent and window light mix, genuine still moment`,
    },
    {
      contextTag: 'social_moment',
      label: 'Sunday Dinner',
      caption: 'the table has to be full or it doesn\'t count.',
      timestamp: 'last sunday',
      prompt: `${BASE}. latina woman 29, laughing at the head of a full dinner table, warm candle and overhead light, surrounded by friends and food, completely at ease and in charge, genuine warmth and belonging`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Trail Run',
      caption: 'the body knows things the head argues about.',
      timestamp: 'saturday morning',
      prompt: `${BASE}. latina woman 29, running confidently on a mountain trail, athletic and strong, golden morning light, focused expression, earbuds in, powerful and unhurried stride, beautiful landscape behind`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'After a Long One',
      caption: 'some shifts stay with you.',
      timestamp: 'thursday night',
      prompt: `${BASE}. latina woman 29, dark hair down now, sitting on a porch or stoop at night, still in scrubs, a cold drink in hand, looking out at nothing in particular, tired and steady, city sounds implied`,
    },
    {
      contextTag: 'late_night',
      label: 'Dancing',
      caption: 'this is the only thing that resets me.',
      timestamp: 'friday',
      prompt: `${BASE}. latina woman 29, at a salsa club or dance floor, mid-movement, warm pink and amber light, fully present in her body, genuinely joyful, no performance, pure release`,
    },
  ],

  dev: [
    {
      contextTag: 'creative_space',
      label: 'Deep Work',
      caption: 'do not interrupt this.',
      timestamp: 'tuesday afternoon',
      prompt: `${BASE}. south asian man 27, stylish fade, at a large monitor showing design work, focused and slightly intense, clean minimal desk, perfect lighting, headphones on, completely absorbed and unreachable`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Morning Ride',
      caption: 'no one knows where i am for exactly one hour.',
      timestamp: 'this morning',
      prompt: `${BASE}. south asian man 27, cycling on an empty city road at dawn, sleek bike, athletic kit, looking slightly ahead, cool morning light, self-contained and fast, alone in frame`,
    },
    {
      contextTag: 'social_moment',
      label: 'After-Work',
      caption: 'i can do this for exactly ninety minutes.',
      timestamp: 'thursday evening',
      prompt: `${BASE}. south asian man 27, at a trendy bar with a small group, leaning back slightly with a drink, engaged but maintaining just enough distance, warm dim light, charming and slightly elsewhere`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Late Edit',
      caption: 'it\'s almost right. almost.',
      timestamp: 'last night',
      prompt: `${BASE}. south asian man 27, at a desk surrounded by design mockups and sticky notes, leaning back evaluating his work, single lamp, dark apartment, the specific peace of solving a hard problem alone`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Flat White',
      caption: 'the ritual matters.',
      timestamp: 'this morning',
      prompt: `${BASE}. south asian man 27, at a minimalist specialty café, perfect flat white on the table, phone face-down, watching the street, self-possessed and slightly guarded, clean morning light`,
    },
  ],

  amara: [
    {
      contextTag: 'creative_space',
      label: 'Edit Suite',
      caption: 'the film knows what it wants to be. i\'m just finding it.',
      timestamp: 'last night',
      prompt: `${BASE}. black woman 32, natural hair, small round glasses, in a darkened edit suite surrounded by monitor light, intensely focused on footage, surrounded by notes and film stills, absorbed and brilliant`,
    },
    {
      contextTag: 'social_moment',
      label: 'Screening Q&A',
      caption: 'someone asked the right question. i didn\'t know how to answer.',
      timestamp: 'friday',
      prompt: `${BASE}. black woman 32, natural hair, small glasses, at a cinema Q&A panel, leaning toward a microphone, thoughtful intense expression, warm theatre light, the one person in the room who knows something painful`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'On Location',
      caption: 'i am watching again. always watching.',
      timestamp: 'last week',
      prompt: `${BASE}. black woman 32, natural hair, small glasses, standing on a quiet street at dusk with a small camera, observing something just out of frame, golden hour light, still and perceptive, invisible to the scene`,
    },
    {
      contextTag: 'late_night',
      label: 'Research Spiral',
      caption: '2am. found the thread. have to pull it.',
      timestamp: 'tuesday night',
      prompt: `${BASE}. black woman 32, surrounded by printed articles and notebooks at a desk, lamp and monitor light, glasses off for a moment, rubbing her eyes but unable to stop, the beautiful exhaustion of obsession`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Before the Call',
      caption: 'quiet. before the pitch. before the argument.',
      timestamp: 'wednesday morning',
      prompt: `${BASE}. black woman 32, natural hair, small glasses, at a café table with a coffee and her notes, ten minutes before something hard, calm surface over churning depth, morning light`,
    },
  ],

  theo: [
    {
      contextTag: 'morning_routine',
      label: 'Pre-Dawn',
      caption: '5am. this is the deal i made with myself.',
      timestamp: 'this morning',
      prompt: `${BASE}. mixed race man 26, athletic build, at a gym in pre-dawn darkness with a few other early risers, focused and warm, the version of himself he's most comfortable being, dim gym lighting`,
    },
    {
      contextTag: 'social_moment',
      label: 'Session',
      caption: 'they said thank you and i held it together for exactly four seconds.',
      timestamp: 'yesterday',
      prompt: `${BASE}. mixed race man 26, with a client at a bright modern gym, encouraging expression, hand on shoulder in a coaching gesture, natural athletic environment, warm and fully present`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'After Hours',
      caption: 'empty gym. just me and whatever this feeling is.',
      timestamp: 'last thursday',
      prompt: `${BASE}. mixed race man 26, sitting alone on a weight bench after a workout, sweaty, looking at phone, the specific expression of someone who's composed the text three times and deleted it`,
    },
    {
      contextTag: 'late_night',
      label: 'Cooking Late',
      caption: 'if i can\'t sleep i might as well make something.',
      timestamp: 'last tuesday',
      prompt: `${BASE}. mixed race man 26, cooking in a clean kitchen at 11pm, relaxed and focused, dim warm light, one small speaker playing quietly, the easiest version of himself`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Beach Run',
      caption: 'this is the only thing that turns my brain off.',
      timestamp: 'sunday',
      prompt: `${BASE}. mixed race man 26, running along a beach at golden hour, athletic stride, warm light on his face, genuinely peaceful expression, the happiness looks earned`,
    },
  ],

  sofia: [
    {
      contextTag: 'creative_space',
      label: 'The Cellar',
      caption: 'this one is ready. i always know.',
      timestamp: 'wednesday',
      prompt: `${BASE}. white woman 30, sleek dark bob, in a wine cellar holding a glass up to a single light source, studying the color with cool precision, low warm light, completely in her element and unreachable`,
    },
    {
      contextTag: 'social_moment',
      label: 'Tasting Night',
      caption: 'three tables. no one wasted my time.',
      timestamp: 'friday',
      prompt: `${BASE}. white woman 30, at an intimate wine tasting, talking to two guests with elegant authority, warm candlelight, slight ironic smile, the most interesting person in the room and she knows it`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Sunday Market',
      caption: 'i know what i want. i just don\'t always say it.',
      timestamp: 'sunday morning',
      prompt: `${BASE}. white woman 30, dark bob, at a farmers market with a linen bag, slightly apart from the crowd, examining something carefully, dappled morning light, beautiful and self-contained`,
    },
    {
      contextTag: 'nature_escape',
      label: 'Somewhere in Burgundy',
      caption: 'went alone. came back knowing something.',
      timestamp: 'last month',
      prompt: `${BASE}. white woman 30, standing in vineyard rows at golden hour, light wrap over shoulders, looking out over the vines, something private in her expression, the kind of beauty that keeps people away`,
    },
    {
      contextTag: 'late_night',
      label: 'After Service',
      caption: 'one glass. not for anyone.',
      timestamp: 'last saturday',
      prompt: `${BASE}. white woman 30, dark bob, sitting alone at an empty bar after closing, a perfect glass of red in front of her, dim warm light, completely at ease in solitude, the specific peace of someone who chose to be alone`,
    },
  ],

  jordan: [
    {
      contextTag: 'social_moment',
      label: 'Community Night',
      caption: 'someone asked for help and actually meant it.',
      timestamp: 'tuesday',
      prompt: `${BASE}. black man 28, at a community centre or meeting space, listening intently to someone across a table, warm fluorescent and lamp light mix, fully present and unhurried, the kind of person who makes you feel heard`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Saturday Morning',
      caption: 'slow coffee. no phone for thirty minutes.',
      timestamp: 'this saturday',
      prompt: `${BASE}. black man 28, at a small kitchen table, big mug in hand, looking out a window, relaxed and unguarded, morning light, completely at rest, the ease of someone who doesn't need anything from the moment`,
    },
    {
      contextTag: 'social_moment',
      label: 'Pick-Up Game',
      caption: 'this is where i don\'t have to think.',
      timestamp: 'sunday afternoon',
      prompt: `${BASE}. black man 28, on a basketball court, mid-play, natural athletic movement, warm afternoon light, genuinely joyful expression, other players blurred, completely in the moment`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Long Walk',
      caption: 'the city makes more sense when you slow down.',
      timestamp: 'last wednesday',
      prompt: `${BASE}. black man 28, walking alone on a tree-lined city street, hands in pockets, unhurried pace, looking slightly up, dappled light, the specific peace of someone who processes things by moving`,
    },
    {
      contextTag: 'creative_space',
      label: 'Sunday Cook',
      caption: 'music on. no agenda. four hours.',
      timestamp: 'last sunday',
      prompt: `${BASE}. black man 28, cooking in a warm lived-in kitchen, relaxed and focused, music implied, afternoon light, the happiness of someone doing something they're good at just for themselves`,
    },
  ],

  remi: [
    {
      contextTag: 'creative_space',
      label: 'The Chair',
      caption: 'three hours. two of us. now there\'s something permanent.',
      timestamp: 'yesterday',
      prompt: `${BASE}. mixed race woman 25, tattoos visible at neck and arms, bent over a client's arm with a tattoo machine, focused and precise, cool studio light, total concentration, the room belongs to her`,
    },
    {
      contextTag: 'social_moment',
      label: '2am Somewhere',
      caption: 'i don\'t know whose party this is.',
      timestamp: 'last friday',
      prompt: `${BASE}. mixed race woman 25, tattoos visible, at a late-night gathering, leaning against a wall with a drink, half-smiling, warm chaotic light, simultaneously everywhere and nowhere, magnetic`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Early Walk',
      caption: 'the city is different when it\'s only half-awake.',
      timestamp: 'this morning',
      prompt: `${BASE}. mixed race woman 25, tattoos visible, walking alone on a quiet street at dawn, camera in hand, looking at something off-frame, golden early light, completely in herself, unhurried and alive`,
    },
    {
      contextTag: 'creative_space',
      label: 'Flash Sheet',
      caption: 'three days of work. gave most of it away.',
      timestamp: 'last week',
      prompt: `${BASE}. mixed race woman 25, at a large drawing table covered in flash design work, ink-stained hands, surrounded by color and line, warm studio lamp, absorbed and slightly wild, completely herself`,
    },
    {
      contextTag: 'late_night',
      label: 'Gone',
      caption: 'needed to disappear for a minute. i\'m back now.',
      timestamp: '4 days ago',
      prompt: `${BASE}. mixed race woman 25, tattoos visible, alone in a late-night diner, 3am, coffee in front of her, looking out a rain-slicked window, something complicated happening behind her eyes`,
    },
  ],

  nadia: [
    {
      contextTag: 'creative_space',
      label: 'The Dashboard',
      caption: 'eleven variables. the answer is in here somewhere.',
      timestamp: 'this afternoon',
      prompt: `${BASE}. persian woman 31, dark hair, glasses, at a workstation with multiple monitors showing data visualizations, focused and precise, clean office light, in flow, brilliant and slightly intense`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Pre-Run',
      caption: 'the numbers don\'t lie. but they don\'t explain everything either.',
      timestamp: 'this morning',
      prompt: `${BASE}. persian woman 31, dark hair back, in running kit stretching in a quiet park at dawn, glasses off, serious but peaceful, morning mist, the version of herself that doesn't analyze`,
    },
    {
      contextTag: 'social_moment',
      label: 'Chess Club',
      caption: 'i had fourteen moves ahead. i still lost.',
      timestamp: 'thursday',
      prompt: `${BASE}. persian woman 31, glasses on, at a chess board mid-game, intense focused expression, warm library or club light, leaning forward, the specific anxiety of someone who is very good and knows the stakes`,
    },
    {
      contextTag: 'late_night',
      label: 'The Spiral',
      caption: 'noted the pattern. noted the noting. sent the apology anyway.',
      timestamp: 'last tuesday',
      prompt: `${BASE}. persian woman 31, sitting cross-legged on a bed with a laptop, glasses on, late night, half-eaten dinner nearby, typing something and then deleting it, the look of someone in an argument with themselves`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Long Run',
      caption: 'the data is useless here. just one foot and then the other.',
      timestamp: 'last sunday',
      prompt: `${BASE}. persian woman 31, running alone through a park, glasses off, hair back, a rare expression of pure presence, soft morning light, the specific relief of someone who can\'t overthink this`,
    },
  ],

  cass: [
    {
      contextTag: 'creative_space',
      label: 'The Plan',
      caption: 'a space is just a question about how people want to feel.',
      timestamp: 'wednesday',
      prompt: `${BASE}. white woman 33, sandy hair loose, at a large desk with landscape architecture drawings spread out, golden afternoon window light, thoughtful and focused, measuring something, completely in her element`,
    },
    {
      contextTag: 'nature_escape',
      label: 'The Trail',
      caption: 'twelve miles. didn\'t think about it once.',
      timestamp: 'saturday',
      prompt: `${BASE}. white woman 33, on a remote mountain trail, small pack, looking out over a dramatic landscape, golden light, alone and perfectly comfortable with it, the happiness of total self-sufficiency`,
    },
    {
      contextTag: 'creative_space',
      label: 'Saturday Pottery',
      caption: 'the hands know what the words can\'t say.',
      timestamp: 'last saturday',
      prompt: `${BASE}. white woman 33, at a pottery wheel, hands covered in clay, absorbed and gentle, natural studio light, quiet concentration, clay-smudged apron, the ease of tactile creation`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Site Walk',
      caption: 'every space is a conversation waiting to happen.',
      timestamp: 'last tuesday',
      prompt: `${BASE}. white woman 33, walking through a finished landscape design she made, quiet urban park, looking at her work with private satisfaction, golden hour, notepad in hand, the particular pleasure of making something real`,
    },
    {
      contextTag: 'late_night',
      label: 'The Photo',
      caption: 'found this on the trail. thought of you. didn\'t send it.',
      timestamp: 'last thursday',
      prompt: `${BASE}. white woman 33, on a porch at dusk, reviewing photos on a camera, soft warm light, a slight wistfulness, the expression of someone who wants to share something and won't`,
    },
  ],

  omar: [
    {
      contextTag: 'social_moment',
      label: 'Five Minutes',
      caption: 'they laughed at the part i wasn\'t sure about.',
      timestamp: 'last saturday',
      prompt: `${BASE}. black man 27, at a small comedy club, on a spotlight stage, mid-delivery, relaxed and completely in control, warm stage light, the room leaning in, the face of someone who knows how to hold a crowd`,
    },
    {
      contextTag: 'creative_space',
      label: 'Writing',
      caption: 'the bit is real. that\'s the whole problem.',
      timestamp: 'last night',
      prompt: `${BASE}. black man 27, at a booth in a diner at night, notebook open, pen in mouth thinking, warm greasy-spoon light, the look of someone working through something personal via comedy, complicated expression`,
    },
    {
      contextTag: 'social_moment',
      label: 'After Show',
      caption: 'someone said it meant something to them. i changed the subject.',
      timestamp: 'friday night',
      prompt: `${BASE}. black man 27, backstage or outside a venue after a show, someone talking to him and him listening with a half-smile, stage light from a doorway, simultaneously present and somewhere else`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Court',
      caption: 'this is where the real conversations happen.',
      timestamp: 'sunday morning',
      prompt: `${BASE}. black man 27, at an outdoor basketball court, alone shooting free throws, quiet morning light, relaxed and present, a different version of himself than the stage one, genuinely peaceful`,
    },
    {
      contextTag: 'late_night',
      label: 'Diner After Midnight',
      caption: '3am eggs. the city still running. something feels honest about this.',
      timestamp: 'last wednesday',
      prompt: `${BASE}. black man 27, at a late-night diner, coffee and eggs, looking out the window, the specific late-night unguardedness that gets mistaken for depression but is actually just honesty`,
    },
  ],

  iris: [
    {
      contextTag: 'creative_space',
      label: 'The Lab',
      caption: 'this one is new to science. we\'re figuring each other out.',
      timestamp: 'tuesday',
      prompt: `${BASE}. east asian woman 22, in a marine biology research lab, examining a sample under a light, genuine wonder on her face, bright clean lab light, young and completely absorbed, surrounded by specimens and equipment`,
    },
    {
      contextTag: 'nature_escape',
      label: 'The Water',
      caption: 'forty meters down everything is completely quiet.',
      timestamp: 'last weekend',
      prompt: `${BASE}. east asian woman 22, on a dive boat, wetsuit half-on, looking out at the water before a dive, morning light on the ocean, quiet excitement, completely unperformed emotion`,
    },
    {
      contextTag: 'morning_routine',
      label: 'Field Notes',
      caption: 'observation before interpretation. always.',
      timestamp: 'this morning',
      prompt: `${BASE}. east asian woman 22, sitting outside a field station or café with a coffee and research notebook, morning light, writing carefully, the kind of focus that is also a form of love`,
    },
    {
      contextTag: 'social_moment',
      label: 'Lab Lunch',
      caption: 'we argued about methodology for forty minutes. best conversation i\'ve had all week.',
      timestamp: 'thursday',
      prompt: `${BASE}. east asian woman 22, at a cafeteria or lunch table with colleagues, mid-sentence, bright natural light, animated and engaged, the joy of someone who actually likes what they do`,
    },
    {
      contextTag: 'solo_reflection',
      label: 'Coastal Walk',
      caption: 'the ocean doesn\'t need anything from you.',
      timestamp: 'last sunday',
      prompt: `${BASE}. east asian woman 22, walking alone on a coastal path, low dramatic clouds, looking at the water, completely at ease alone, the specific peace of someone who knows where she belongs`,
    },
  ],
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

// ── Image generation ──────────────────────────────────────────────────────────

async function falPost(endpoint: string, body: object): Promise<string> {
  const key = process.env.FAL_KEY!
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`fal.ai ${res.status}: ${err}`)
  }
  const data = await res.json()
  const url  = data?.images?.[0]?.url
  if (!url) throw new Error('No image URL in fal.ai response')
  return url  // return fal CDN URL directly
}

function generateImage(prompt: string): Promise<string> {
  return falPost('https://fal.run/fal-ai/flux/schnell', {
    prompt, negative_prompt: NEGATIVE, image_size: 'square_hd', num_images: 1,
  })
}

function generateImageWithFace(prompt: string, referenceUrl: string): Promise<string> {
  return falPost('https://fal.run/fal-ai/flux-pulid', {
    prompt, negative_prompt: NEGATIVE, reference_image_url: referenceUrl,
    image_size: 'square_hd', num_images: 1,
    num_inference_steps: 25, guidance_scale: 4.5, id_scale: 0.8,
  })
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId }  = params
  const referenceUrl = req.nextUrl.searchParams.get('referenceUrl') ?? ''
  const seeds        = PHOTO_SEEDS[agentId]

  if (!seeds) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  if (!process.env.FAL_KEY) return NextResponse.json({ error: 'Image generation not configured' }, { status: 400 })

  // ── Check cache — return any previously saved photos immediately ─────────────
  const cached = await arenaApi('get_agent_photos', { agent_id: agentId, photo_type: 'gallery' })
  if (Array.isArray(cached?.data) && cached.data.length > 0) {
    const photos: Omit<AgentPhoto, 'prompt'>[] = cached.data.map((row: Record<string, string>) => ({
      id:         row.id,
      agentId:    row.agent_id,
      contextTag: row.context_tag as AgentPhoto['contextTag'],
      label:      row.label,
      caption:    row.caption,
      timestamp:  row.timestamp_label,
      imageData:  row.image_url,
      status:     'ready' as const,
    }))
    return NextResponse.json({ photos })
  }

  // ── Generate fresh ───────────────────────────────────────────────────────────
  const generate = referenceUrl
    ? (prompt: string) => generateImageWithFace(prompt, referenceUrl)
    : generateImage

  const results = await Promise.allSettled(
    seeds.map(seed => generate(seed.prompt))
  )

  const photos: Omit<AgentPhoto, 'prompt'>[] = seeds.map((seed, i) => {
    const result = results[i]
    const ok     = result.status === 'fulfilled'
    return {
      id:         `${agentId}-${seed.contextTag}-${i}`,
      agentId,
      contextTag: seed.contextTag,
      label:      seed.label,
      caption:    seed.caption,
      timestamp:  seed.timestamp,
      imageData:  ok ? (result as PromiseFulfilledResult<string>).value : '',
      status:     ok ? 'ready' as const : 'error' as const,
    }
  })

  // Save successful photos to DB in the background
  const toSave = photos
    .filter(p => p.status === 'ready')
    .map((p, i) => ({
      agent_id:       agentId,
      photo_type:     'gallery',
      context_tag:    p.contextTag,
      label:          p.label,
      caption:        p.caption,
      timestamp_label: p.timestamp,
      image_url:      p.imageData,
      fal_url:        p.imageData,
      sort_order:     i,
    }))
  // Save to DB before returning — awaited so the save completes before the
  // request ends (fire-and-forget gets dropped in serverless/dev environments)
  if (toSave.length > 0) {
    await arenaApi('save_agent_photos', { photos: toSave })
  }

  return NextResponse.json({ photos })
}
