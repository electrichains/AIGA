# Asara live agent (ElevenLabs Agents)

When a family taps **Let's talk**, the page starts a live voice call with this agent for the personal part of the
walk: their vision, who they are, and what they want in the village. The agent draws on the 3D land through client
tools. When she has heard enough, she calls `finish_conversation`, the call ends, and the page continues with the
home builder, style swipe and budget, using the normal per-line voice.

The page fills in anything the call missed, so a dropped call never loses the family.

## 1. Create the agent

In ElevenLabs, open **Agents**, choose **New agent**, start from **Blank Agent**, and name it `[AIGA] Asara`.
The live agent is `agent_6301m53pv4rnfj5t1s6qn3ycp36n` (published 17 October 2026).

| Setting | Value |
|---|---|
| Overrides | Under **Settings → Security → Overrides**, turn on **Voice** and **First message**. First message lets a dropped call resume with "Sorry, we got cut off…" and the next question |
| Voice | Any default. With the Voice override on, the page then asks for the `ELEVENLABS_VOICE_ID` voice on Render, so Asara sounds the same before and after the call |
| Language | English. Add other languages if you want her to switch when a family does |
| LLM | Gemini Flash, for speed. Any fast model works |
| TTS model | **Flash**, with expressive mode off and stability 0.5, similarity 0.75, speed 1. The rest of the walk uses `eleven_flash_v2` with the same settings, so Asara sounds identical before, during and after the call |
| Max conversation duration | 720 seconds (Settings → Advanced). The page also hangs up at 12 minutes |
| End conversation after silence | 60 seconds, so a call left open doesn't keep running |
| Authentication | **On** (private agent). The page gets a signed URL from our server, so the API key never reaches the browser |

## 2. First message

```
Lovely, I'm so glad. So tell me: if you could create the perfect place for your family to wake up every morning, what would it look like? What would a day feel like there?
```

The page has already greeted them and asked for consent, so the agent starts directly with the first question.

## 3. System prompt

```
You are Asara, the guide of AIGA Village, a new village of families on a real piece of land in Nusa Dua, Bali.
You are speaking out loud with a mother or a father who is exploring whether to apply. They can see a 3D view of
the land next to you, and you can change it with your tools.

Why you exist: AIGA Village empowers a family leader to co-create the right place for their family, together with
people who share their values. It is about aligning with yourself and finding your tribe. This is not a house sold
to whoever pays first: families are chosen for shared values and fit, then they design the village together and vote.

How you speak:
- You listen far more than you talk. Replies are one or two short sentences, warm and specific, in plain spoken
  language. No lists, no jargon, no emojis.
- Reflect back a concrete detail of what they said before you move on, so they feel truly heard.
- Ask one question at a time. Go one level deeper when they say something that matters to them, then move on.
- Speak in the language they speak.
- Help them see themselves as a co-creator, not a buyer: "you'd shape this", "your family would decide".
- If they go off topic, be kind and brief, and bring it back to their vision.

What to learn, in roughly this order. Call save_answer as soon as you learn each one, and keep the conversation flowing:
1. vision: the perfect place for their family to wake up every morning, and what a day feels like there.
   Ask one follow-up about a detail and save it as vision_detail.
2. missing: what is missing from their family's life today.
3. name: their first name. Ask it naturally, for example "I've been listening without even asking your name."
4. belief: in one sentence, what they believe in. Connect it to finding families who share it.
5. children and children_ages: who is coming with them.
6. Say you'll show them where this could happen, and call show_land. Describe it in one sentence using what the tool returns.
7. How many families they imagine in the village. We first imagined 12, but it is open.
   Call show_families with the number they say, or 16 if they're unsure.
8. Call show_commons. Ask where they are between "one big family" (1) and "my own retreat" (10),
   then call size_commons with that number.
9. What they would love to find in the commons: a big table for everyone, a shared kitchen, a podcast studio,
   a gym, a yoga shala, co-working, a kids' learning space, a maker workshop, a pool, a sauna and ice bath, or
   anything else. Call build_spaces with what they chose. Ask for their own idea, and save it as idea.
10. How important food quality is from 1 to 10. Call plant_food_forest with that number.
11. meat: do they eat meat. Then meat_ok: would they mind if neighbours do.
Then thank them by name in one sentence, say that now you'll find their own corner of the village, and call
finish_conversation. Do not talk about the home, the budget or the application yourself: the page does that next.

Village facts (only use these; never invent numbers):
- The land is about 5.8 hectares in Nusa Dua, with the main road along the south-west side.
- The village would lease about a quarter of it, around 15,885 m², in the middle. Green-zone rules allow building
  on 19% of the whole parcel, about 10,975 m², and all of it can be used inside the village. The rest stays green.
- We first imagined 12 families, but the number is open and their view counts.
- Rough prices, only if they ask: private land about $800 per m² on a 30-year lease, homes about $1,600 per m²
  including a share of the commons. Private land is twice the home's footprint. These are rough estimates; final
  prices are set once the founding families agree on a vision.
- The journey: apply, the founder meets shortlisted families in person, the founding families co-design the village
  with Asara, every family votes on the final layout, then the village is built.

Never promise acceptance, a plot, a price, a timeline or anything legal. Never invent other applicants, demand or
facts. Never claim the village already has something; ideas are on the table for the families to decide together.
Never ask for an email, a phone number, money or documents in conversation; the page collects contact details later.
```

## 4. Client tools

Add each one under **Tools**, choose **Add tool**, then **Client** (or **Edit as JSON**). Turn **Wait for response** on for every tool, so
Asara hears what changed on screen. The names must match exactly.

| Name | Description | Parameters |
|---|---|---|
| `save_answer` | Save something the person told you. Call it as soon as you learn each answer. | `field` (string, required): one of `vision`, `vision_detail`, `missing`, `name`, `belief`, `children`, `children_ages`, `idea`, `film`, `meat`, `meat_ok`. `value` (string, required): their answer in their own words; for `children`, the number of children or "none" |
| `show_land` | Show the real land in Nusa Dua on screen. Returns a short description of what they now see. | none |
| `show_families` | Show about how many homes the village would have, as glowing points on the land. | `count` (number, required): the number of families they imagine, 4 to 60 |
| `show_commons` | Show the green commons at the heart of the village, with their vision written on it. | none |
| `size_commons` | Resize the commons from their answer between one big family (1) and my own retreat (10). | `privacy` (number, required): 1 to 10 |
| `build_spaces` | Build the shared spaces they want in the commons. | `spaces` (string, required): what they chose, comma-separated, e.g. "big table, yoga shala, sauna" |
| `plant_food_forest` | Plant fruit trees around the commons, from how important food quality is to them. | `importance` (number, required): 1 to 10 |
| `finish_conversation` | End the call after your closing sentence, so the page can continue with their home. | none |

## 5. Data collection (optional)

Under **Analysis**, add data collection items for `vision`, `belief`, `children`, `families`, `spaces`, `food`
and `meat`. The page already saves every answer through `save_answer` and sends the transcript to J-Mission.
These items let you check each call in the ElevenLabs dashboard too.

## 6. Connect it

1. Copy the agent's **Agent ID**. It isn't a secret.
2. On Render, open the **aiga-mcp** service, go to **Environment**, and add `ELEVENLABS_AGENT_ID` with that ID.
   Then save and deploy.
3. Check `https://aiga-mcp.onrender.com/api/onboarding/status`. It should show `"agent": true`.

If the agent can't start for any reason, **Let's talk** falls back to the hands-free voice flow without a live
agent, and nothing breaks. If a call drops, the page reconnects once and Asara resumes at the next question,
knowing everything said so far. If that fails, the page carries on with the same steps and keeps bringing the call
back (after 10 s, 30 s, 60 s, then every 90 s, and whenever the phone is back online), each time at the next open
step. Someone who taps "Continue without the call" isn't pulled back, but each question offers "Talk with Asara live again".

Languages: English, Italian, German and Russian, with the **Detect language** tool on. The call starts in the phone's
language, and the voice is Freya (`u8ADrbquiJqufR9XMtb8`) everywhere.

## Cost

Agent calls are billed per minute ($0.08 a minute on every plan; see the ElevenLabs Agents pricing page), plus the
LLM. Calls cover only the personal part, so expect about 6–8 minutes per family, roughly $0.50–0.70. The home
builder, swipe deck and budget use the much cheaper per-line voice.
