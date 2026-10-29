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

## 2. First message and 3. System prompt

Both live in [asara-agent-prompt.md](asara-agent-prompt.md). Paste them into the agent whenever they change, then
publish. The page sends the English first message itself, and doesn't send a prompt. The Italian, German and Russian
greetings are stored on the agent; see [asara-agent-export.md](asara-agent-export.md).

## 4. Client tools

Add each one under **Tools**, choose **Add tool**, then **Client** (or **Edit as JSON**). Turn **Wait for response** on for every tool, so
Asara hears what changed on screen. The names must match exactly.

| Name | Description | Parameters |
|---|---|---|
| `save_answer` | Save something the person told you. Call it as soon as you learn each answer. | `field` (string, required): one of `vision`, `vision_detail`, `missing`, `name`, `belief`, `calling`, `contribution`, `children`, `children_ages`, `invest`, `wishes`, `idea`, `film`, `meat`, `meat_ok`. `value` (string, required): their answer in their own words; for `children`, the number of children or "none" |
| `show_place` | Show the place they chose: fly the map to it, or dive into the Nusa Dua land. Response timeout 15 seconds. | `place` (string, required): one of `nusa-dua`, `amed`, `candidasa`, `payangan`, `tabanan`, `anywhere`, `offer`, `unsure` |
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

For the full exported configuration (prompt, greetings in all four languages, tool JSON) and the complete conversation
workflow, see [asara-agent-export.md](asara-agent-export.md).
