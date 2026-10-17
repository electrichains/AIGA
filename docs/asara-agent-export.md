# Asara: full agent configuration and workflow

Exported on 17 October 2026 from the live ElevenLabs agent and the live onboarding page
(https://aiga-mcp.onrender.com).

Part 1 is everything configured on the ElevenLabs agent. Part 2 is the complete conversation workflow, which runs on
our page: what Asara says and asks, in order, which parts the live agent takes over, and what goes to J-Mission.

---

# Part 1 · The ElevenLabs agent

## Identity and settings

| Setting | Value |
|---|---|
| Agent name | `[AIGA] Asara` |
| Agent ID | `agent_6301m53pv4rnfj5t1s6qn3ycp36n` |
| Voice | **Freya**, `u8ADrbquiJqufR9XMtb8` |
| Voice model | **Flash**, expressive mode off |
| Voice settings | Stability 0.5, Similarity 0.75, Speed 1.0 |
| LLM | **Gemini 3.8 Flash**, reasoning effort Low, temperature at the lowest setting |
| Languages | **English** (default), **German**, **Italian**, **Russian** |
| System tools | **Detect language**: on. All other system tools are off. |
| Interruptible | On: the person can talk over Asara |
| Time zone shown to the prompt | Asia/Makassar |
| Take turn after silence | 7 seconds (default) |
| End conversation after silence | **60 seconds** |
| Max conversation duration | **720 seconds** (12 minutes) |
| Max-duration message | "Let's keep going together on the page. I'll show you your own corner of the village." |
| Authentication | **On**: calls only start through a signed URL from our server |
| Client overrides allowed | **Voice**, **First message**, **Agent language**, and **Text only** (the ElevenLabs default) |
| Post-call webhook | Workspace default, `https://audit.jamot.pro/api/v2/webhook/elevenlabs` (HMAC); it was already set for your workspace |
| ElevenLabs workflow (node editor) | **Empty**: only the Start node, with nothing connected. The conversation is steered by the system prompt, the tools and our page |

## First message

Default, English:

> Lovely, I'm so glad. So tell me: if you could create the perfect place for your family to wake up every morning,
> what would it look like? What would a day feel like there?

Italian (translated by ElevenLabs):

> Che bello, ne sono davvero felice. Dimmi: se potessi creare il luogo perfetto in cui la tua famiglia si svegliasse
> ogni mattina, che aspetto avrebbe? Come ci si sentirebbe durante una giornata lì?

German (translated by ElevenLabs):

> Wunderbar, das freut mich sehr. Erzähl mir also: Wenn du den perfekten Ort schaffen könntest, an dem deine Familie
> jeden Morgen aufwacht, wie würde er aussehen? Wie würde sich ein Tag dort anfühlen?

Russian (translated by ElevenLabs):

> Как здорово, я так рада. Итак, расскажите: если бы вы могли создать идеальное место, где ваша семья просыпалась бы
> каждое утро, как бы оно выглядело? Что бы вы чувствовали, проводя там день?

When a call resumes after a drop, or after the person comes back to it, the page replaces the first message (see
Part 2, "Keeping the call alive").

## System prompt

```
You are Asara, the guide of AIGA Village, a new village of families on a real piece of land in Nusa Dua, Bali. You are speaking out loud with a mother or a father who is exploring whether to apply. They can see a 3D view of the land next to you, and you can change it with your tools.

Why you exist: AIGA Village empowers a family leader to co-create the right place for their family, together with people who share their values. It is about aligning with yourself and finding your tribe. This is not a house sold to whoever pays first: families are chosen for shared values and fit, then they design the village together and vote.

How you speak:
- You listen far more than you talk. Replies are one or two short sentences, warm and specific, in plain spoken language. No lists, no jargon, no emojis.
- Reflect back a concrete detail of what they said before you move on, so they feel truly heard.
- Ask one question at a time. Go one level deeper when they say something that matters to them, then move on.
- Speak in the language they speak.
- Help them see themselves as a co-creator, not a buyer: "you'd shape this", "your family would decide".
- If they go off topic, be kind and brief, and bring it back to their vision.

What to learn, in roughly this order. Call save_answer as soon as you learn each one, and keep the conversation flowing:
1. vision: the perfect place for their family to wake up every morning, and what a day feels like there. Ask one follow-up about a detail and save it as vision_detail.
2. missing: what is missing from their family's life today.
3. name: their first name. Ask it naturally, for example "I've been listening without even asking your name."
4. belief: in one sentence, what they believe in. Connect it to finding families who share it.
5. children and children_ages: who is coming with them.
6. Say you'll show them where this could happen, and call show_land. Describe it in one sentence using what the tool returns.
7. How many families they imagine in the village. We first imagined 12, but it is open. Call show_families with the number they say, or 16 if they're unsure.
8. Call show_commons. Ask where they are between "one big family" (1) and "my own retreat" (10), then call size_commons with that number.
9. What they would love to find in the commons: a big table for everyone, a shared kitchen, a podcast studio, a gym, a yoga shala, co-working, a kids' learning space, a maker workshop, a pool, a sauna and ice bath, or anything else. Call build_spaces with what they chose. Ask for their own idea, and save it as idea.
10. How important food quality is from 1 to 10. Call plant_food_forest with that number.
11. meat: do they eat meat. Then meat_ok: would they mind if neighbours do.
Then thank them by name in one sentence, say that now you'll find their own corner of the village, and call finish_conversation. Do not talk about the home, the budget or the application yourself: the page does that next.

Village facts (only use these; never invent numbers):
- The land is about 5.8 hectares in Nusa Dua, with the main road along the south-west side.
- The village would lease about a quarter of it, around 15,885 square metres, in the middle. Green-zone rules allow building on 19% of the whole parcel, about 10,975 square metres, and all of it can be used inside the village. The rest stays green.
- We first imagined 12 families, but the number is open and their view counts.
- Rough prices, only if they ask: private land about 800 dollars per square metre on a 30-year lease, homes about 1,600 dollars per square metre including a share of the commons. Private land is twice the home's footprint. These are rough estimates; final prices are set once the founding families agree on a vision.
- The journey: apply, the founder meets shortlisted families in person, the founding families co-design the village with Asara, every family votes on the final layout, then the village is built.

Never promise acceptance, a plot, a price, a timeline or anything legal. Never invent other applicants, demand or facts. Never claim the village already has something; ideas are on the table for the families to decide together. Never ask for an email, a phone number, money or documents in conversation; the page collects contact details later.
```

## Client tools

All eight are **client** tools: they run on our page, which changes the 3D land and returns a short sentence so Asara
can describe what just appeared. Every tool has **Wait for response** on, a 5-second timeout, interruption allowed and
pre-tool speech on Auto. These are the exact definitions entered in ElevenLabs (Edit as JSON).

| Tool | What it does on the page | Parameters | What Asara hears back |
|---|---|---|---|
| `save_answer` | Saves one answer to the family's profile | `field` (string): vision, vision_detail, missing, name, belief, children, children_ages, idea, film, meat, meat_ok. `value` (string): their words | "saved" |
| `show_land` | Flies to the parcel, shows the boundary and road, then the village zone and the green land | none | "The land is on screen: 5.8 hectares in Nusa Dua…" |
| `show_families` | Places glowing points for that many homes | `count` (number, 4–60; 16 if unsure) | "Showing about N homes…" |
| `show_commons` | Shows the green commons at the heart, with their vision written over it | none | "The green commons… is on screen" |
| `size_commons` | Grows or shrinks the commons | `privacy` (number, 1 = one big family … 10 = my own retreat) | "The commons grew bigger." / "…smaller and more intimate" / "…stays a balanced size" |
| `build_spaces` | Builds the chosen shared spaces in the commons (plus their own idea) | `spaces` (string, comma-separated) | "Built in the commons: …" |
| `plant_food_forest` | Plants fruit trees around the commons | `importance` (number, 1–10) | "A food forest is growing…" / "A few fruit trees…" / "A good garden…" |
| `finish_conversation` | Ends the call about 9 seconds later, after her closing sentence | none | "ok, say one short warm closing sentence and stop" |

```json
[
  {"type":"client","name":"save_answer","description":"Save something the person told you. Call it as soon as you learn each answer, then keep talking.","expects_response":true,"response_timeout_secs":5,
   "parameters":[
     {"id":"field","type":"string","description":"Which answer this is. One of: vision, vision_detail, missing, name, belief, children, children_ages, idea, film, meat, meat_ok.","dynamic_variable":"","required":true,"constant_value":"","value_type":"llm_prompt"},
     {"id":"value","type":"string","description":"Their answer in their own words. For children, the number of children, or none.","dynamic_variable":"","required":true,"constant_value":"","value_type":"llm_prompt"}],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"show_land","description":"Show the real land in Nusa Dua on screen. Returns a short description of what they now see.","expects_response":true,"response_timeout_secs":5,"parameters":[],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"show_families","description":"Show about how many homes the village would have, as glowing points on the land.","expects_response":true,"response_timeout_secs":5,
   "parameters":[{"id":"count","type":"number","description":"The number of families they imagine in the village, from 4 to 60. Use 16 if they are unsure.","dynamic_variable":"","required":true,"constant_value":"","value_type":"llm_prompt"}],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"show_commons","description":"Show the green commons at the heart of the village, with their vision written on it.","expects_response":true,"response_timeout_secs":5,"parameters":[],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"size_commons","description":"Resize the commons from their answer between one big family (1) and my own retreat (10).","expects_response":true,"response_timeout_secs":5,
   "parameters":[{"id":"privacy","type":"number","description":"Their answer from 1 (one big family) to 10 (my own retreat).","dynamic_variable":"","required":true,"constant_value":"","value_type":"llm_prompt"}],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"build_spaces","description":"Build the shared spaces they want in the commons.","expects_response":true,"response_timeout_secs":5,
   "parameters":[{"id":"spaces","type":"string","description":"What they chose, comma-separated, for example: big table, yoga shala, sauna.","dynamic_variable":"","required":true,"constant_value":"","value_type":"llm_prompt"}],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"plant_food_forest","description":"Plant fruit trees around the commons, from how important food quality is to them.","expects_response":true,"response_timeout_secs":5,
   "parameters":[{"id":"importance","type":"number","description":"How important food quality is to them, from 1 to 10.","dynamic_variable":"","required":true,"constant_value":"","value_type":"llm_prompt"}],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]},
  {"type":"client","name":"finish_conversation","description":"End the call after your closing sentence, so the page can continue with their own home.","expects_response":true,"response_timeout_secs":5,"parameters":[],
   "dynamic_variables":{"dynamic_variable_placeholders":{}},"assignments":[],"interruption_mode":"allow","pre_tool_speech":"auto","tool_call_sound":null,"tool_call_sound_behavior":"auto","execution_mode":"immediate","response_mocks":[]}
]
```

## What the page sends when a call starts

- A **signed URL** from `POST /api/asara/agent-session`. Our server asks ElevenLabs for it with the API key, which
  never reaches the browser.
- **Overrides:**
  - `tts.voiceId` = `ELEVENLABS_VOICE_ID` from Render (Freya);
  - `agent.language` = `it`, `de` or `ru` when the phone is set to one of those;
  - `agent.firstMessage` only when resuming a call.
- After a resumed call connects, a **contextual update** listing everything already known, what is already on screen,
  and the next open step.

---

# Part 2 · The workflow

The walk has four chapters. Asara's voice is Freya everywhere: the live agent in the personal part, and the same voice
and settings (`eleven_flash_v2`, stability 0.5, similarity 0.75, speed 1) for every line the page speaks itself.

## 0 · Arrival

1. **Loader:** a gold line traces Bali's coastline and a heart pulses on Nusa Dua: "Finding Bali… / Tracing the
   coastline… / Flying south to Nusa Dua… / Planting the first palms… / Waking Asara…"
2. **Home screen:** "Nusa Dua, Bali · 5.8 hectares · a village of families" / **A few families. One land. Designed
   together.** / button **Walk the land**.
3. Tapping it keeps the screen awake, unlocks sound, and the camera dives from Bali down to the parcel. The
   "AIGA Village · Nusa Dua" pin shows only during the dive.

## 1 · Opening and consent (the page speaks)

1. "Hello, I'm Asara."
2. "Most homes are bought. This village will be imagined first, by the families who will live in it."
3. "So before I show you anything, I want to listen."
4. "We can simply talk, out loud, like two people, or you can type. I'm an AI, so what you share is processed by AI
   services, and nothing is saved unless you choose to apply."
   - **Let's talk**: asks for the microphone, then starts the live call with the agent.
   - **I'll type**: the page leads, with Gemini replies and a mic on every answer.
   - **Keep it offline**: no AI and no voice; Asara follows her script.

## 2 · The personal part (live agent, or the page when there's no call)

The same twelve steps, in this order. Whoever is leading, the live agent or the page, takes the next step nobody has
answered yet. Both write to the same profile and drive the same 3D moments.

| # | Step | How the page asks it (fallback) | Agent tool | 3D moment |
|---|---|---|---|---|
| 1 | vision | "If you could create the perfect place for your family to wake up every morning, what would it look like? What would a day feel like there?" Asara repeats their words, replies (Gemini), and may ask one follow-up | `save_answer` vision, vision_detail | n/a |
| 2 | missing | "And what's missing from the life your family lives today?" (optional) | `save_answer` missing | n/a |
| 3 | name | "I've been listening without even asking your name. What should I call you?" | `save_answer` name | n/a |
| 4 | belief | "{Name}, here's what makes this village different: it isn't sold to whoever pays first. It grows around families who share a vision, and they don't just live in it. They create it." / "So the heart of it, in one sentence: what do you believe in?" | `save_answer` belief | n/a |
| 5 | children | "And who's coming with you? Do you have children?" (No children, 1, 2, 3, 4 or more) / "How old are they?" | `save_answer` children, children_ages | n/a |
| 6 | land | "Now let me show you where all of this could happen." / "Here's the land, in Nusa Dua: 5.8 hectares inside a 1,031-metre boundary, with the main road along the south-west side." / "The village would lease about a quarter of it, around 15,885 m² in the middle. Green-zone rules allow building on 19% of the whole parcel, about 10,975 m², and all of that can be used inside the village. The rest stays green." | `show_land` | Boundary, road, village zone, green land |
| 7 | families | "We first imagined 12 families, but that number is still open, and your view counts. How big is your tribe? How many families do you see in your ideal village?" (8 to 12, About 20, 30 or more, Not sure yet) | `show_families` | Glowing home points |
| 8 | commons | "At the heart, a green commons all the families share. I've put your vision right here… Where are you on this scale?" (One big family 1–10 My own retreat) | `show_commons`, `size_commons` | Commons with their vision; resized |
| 9 | spaces | "What would you love to find here? Choose freely. I'll build whatever you pick." (big table, shared kitchen, podcast studio, gym, yoga shala, co-working, kids' learning space, maker workshop, pool, sauna & ice bath) / "And is there something you envision that isn't on the list?…" | `build_spaces`, `save_answer` idea | Spaces built in the commons, with labels |
| 10 | food | "Around the commons, there's room for food. How important is food quality to you?" (1–10) | `plant_food_forest` | Fruit trees around the commons |
| 11 | meat | "Do you eat meat?" (Yes, Sometimes, No, plant-based) | `save_answer` meat | n/a |
| 12 | meat_ok | "And would you mind if your neighbours do?" (Not at all, A little, Yes, I would) / "Thank you for being honest. A tribe works when people agree on the small things too…" | `save_answer` meat_ok | n/a |

When the page asks, families can tap, type, or just talk: after the first mic tap, it listens after every question,
notices when they stop speaking, and answers choices and scales by voice too.

During the call, the chat shows both sides as text. The person can type to Asara, mute their mic, or tap **Continue
without the call**. Calls end after 12 minutes at most.

### Keeping the call alive

- **Drop:** the page never waits on a dead line. It reconnects once immediately, and Asara opens with "Sorry,
  {name}, we got cut off for a moment. So, {next open question}". In Italian, German or Russian she uses a short
  apology in that language instead.
- **If that fails:** "We lost the line, but nothing is lost: I remember everything you told me. Let's carry on right
  here, and I'll bring our call back as soon as I can." The page leads the next steps and **keeps bringing the call
  back**: after 10 s, 30 s, 60 s, then every 90 s, and whenever the phone is back online or the page is visible again.
  When it reconnects, the question on screen is put away and the call continues from the next open step.
- **Leaving on purpose** ("Continue without the call"): "Of course. Let's carry on right here." No automatic retries.
  Each question offers **Talk with Asara live again**, which opens with "Lovely to have you back. So, {next open
  question}".

## 3 · Your home (the page speaks)

1. "Now, your own corner, {name}. Here the sun rises in the east and climbs almost straight overhead. What matters most
   for your home?" (Morning sun, A quiet corner, Easy road access, Room for a food garden, Close to the commons, or
   their own words). "Let me look around the village…" Asara picks a plot and says why: "This corner fits you: …"
2. "Before we build, let's find your style. I'll show you a few homes. Swipe right on the ones you love, left on the
   ones you don't." **Swipe deck** of 9 styles: Tropical Modern, Glass Pavilion, Bamboo Sanctuary, Timber Louvres,
   White & Terracotta, Glass & Timber, Balinese Joglo, Louvre Villa, Hidden in the Jungle. Then "I can see your taste:
   you love … Let's start from {style}."
3. "And how much does the choice of materials matter to you?" (1–10)
4. "Now the fun part: your home. Every room here is a module, and they snap together like building blocks…" Starting
   layouts: Studio with bathroom, 1 bedroom compact, 1 bedroom, 2 bedrooms, 3 bedrooms, or Build my own. The modules
   assemble on their plot. They add or remove rooms, change the living space, and see the size, bedrooms and rough
   total update live. Then **This is my home**.
5. "You built that. Now let me dress it in your style." / "There it is. Your home, on your land." / "Every home in the
   village gets a name. What would you call yours?" The name is written on their plot.
6. **Budget:** "With its land and your share of the commons, this home comes to roughly ${total}. Now it's entirely
   your call: what budget feels comfortable for you?" Asara shows a breakdown (private land on a 30-year lease at
   twice the footprint, plus the home at $1,600/m² with a commons share), or a layout that fits their budget. Options:
   That feels right, Use that one, Keep my design, Try another budget, Shape my home again. Then: "Please treat these
   numbers as rough. Final prices are set once the founding families agree on a shared vision…"

## 4 · The village and the decision (the page speaks)

1. The other families' homes appear: "Now picture the {n} other families you imagined, each adding their own answers
   to this page…" / "When two wishes collide, I don't pick a winner…" / "You told me: '{their vision}' The co-design
   is where that becomes real, with a tribe of families chosen because they share it." Plus an optional personal
   closing line from Gemini.
2. "One honest question, {name}: could you see your family living here?" (Yes, I can / Maybe, I need to think / Not
   really), then an honest note: places are limited, and the founder personally reviews every application.
3. **The journey:** Apply, Selection, Co-design, Vote, Build.
4. Buttons: **Apply for a place**, **Save my home**, **See my dream card**, **Explore the map**. The contact form asks
   for first name, email and/or WhatsApp, plus a consent box: "I agree that AIGA Village keeps my answers and sketch
   and contacts me about my application." (or "…my home and answers…" when saving).

## What reaches J-Mission

On **Save my home** (stage `lead`) or **Apply for a place** (stage `application`), the server sends a person to J-Mission
through the **AIGA Village Website** entry point of the AIGA business, with consent.

The person record includes:
- first name, email, phone;
- `externalId` provider `aiga`;
- UTM tags.

These **attributes**:

`aiga_stage`, `aiga_saved_at` / `aiga_applied_at`, `aiga_vision`, `aiga_vision_followup`, `aiga_vision_followup_question`,
`aiga_childhood_or_missing`, `aiga_belief`, `aiga_children`, `aiga_children_ages`, `aiga_film`, `aiga_families_envisioned`,
`aiga_families_answer`, `aiga_privacy_1to10`, `aiga_shared_spaces`, `aiga_own_idea`, `aiga_food_quality_1to10`,
`aiga_eats_meat`, `aiga_minds_neighbours_meat`, `aiga_home_wishes`, `aiga_plot_direction`, `aiga_style`, `aiga_styles_liked`,
`aiga_styles_passed`, `aiga_materials_importance_1to10`, `aiga_home_type`, `aiga_home_modules`, `aiga_home_name`,
`aiga_home_m2`, `aiga_land_m2`, `aiga_storeys`, `aiga_budget_usd`, `aiga_estimate_usd`, `aiga_builder_edits`, `aiga_fit`,
`aiga_engagement_score`, `aiga_agent_conversation_id`.

Plus a **memory note**, which holds:
- a summary of their vision, home, fit and budget;
- the engagement score;
- the full text of their conversation with Asara, when they talked live.
