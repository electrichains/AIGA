import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from './guards.js';

/*
 * The AIGA Village onboarding API.
 *
 *   POST /api/asara         Asara's personal reply at a few key moments of the
 *                           conversation (Gemini or OpenAI). The page falls back to its
 *                           scripted lines whenever this is unavailable.
 *   POST /api/applications  Sends a finished application to J-Mission (the CRM)
 *                           through an "api" entry point, with the applicant's
 *                           consent. The J-Mission key never reaches the browser.
 *
 * Env: GEMINI_API_KEY + GEMINI_MODEL (default gemini-3.8-flash), or
 *      OPENAI_API_KEY + OPENAI_MODEL (default gpt-4.1-mini); Gemini wins if both are set.
 *      JMISSION_URL, JMISSION_API_KEY, JMISSION_ENTRY_POINT.
 */

const VILLAGE_FACTS = `AIGA Village facts (use only these, never invent others):
- A real 5.8-hectare parcel in Nusa Dua, Bali, in a green zone.
- The families would lease about 27.5% of it (around 15,900 m²) for the village; the rest stays green.
- By law, building is allowed on 19% of the whole parcel (about 10,975 m²), used inside the village area.
- Each home's private land is twice its footprint; the green commons and shared spaces belong to all families.
- Rough prices: land $800/m² (30-year lease), building $1,600/m² including a share of building the commons.
- The number of families is still open (first imagined as 12). Places are limited.
- The founder personally reviews every application and invites families who fit to meet.
- Families are chosen for shared values and fit, not money alone. Then they co-design the village together and vote.`;

const SYSTEM_PROMPT = `You are Asara, the guide of AIGA Village, speaking with someone who is exploring whether to apply.
Your one job right now: make them feel truly heard. Reflect back what they shared in your own words, warmly and specifically,
and show genuine curiosity about their life and vision.

Rules:
- Reply in the same language the person wrote in.
- Be concise: "reply" is at most 2 short sentences. No lists, no emojis, no exclamation marks in a row.
- Mention a concrete detail from what they wrote. Never flatter generically.
- "followUp" is at most one short, open, curious question, or null. Only ask one when the moment asks for it.
- Never promise acceptance, a specific plot, a price, a timeline or anything legal. Never invent numbers, other applicants or demand.
- Never claim the village already has something; ideas are "on the table" for the families to decide together.
- If they write something harmful or off-topic, stay kind and brief, and steer back to their vision.
- Output strict JSON: {"reply": string, "followUp": string | null}.

${VILLAGE_FACTS}`;

const MOMENT_GUIDE: Record<string, string> = {
  belief: 'They just told you who they are and what they believe. Reflect it back. followUp must be null.',
  film: 'They shared a film line or film that represents them. Respond briefly and warmly about what it says about them. followUp must be null.',
  vision: 'They described their ideal village (to raise their children, if they have any). Reflect the 1-3 strongest themes in your own words, then ask ONE curious follow-up question about a specific detail they mentioned.',
  vision_followup: 'They answered your follow-up question about their vision. Acknowledge it in one sentence. followUp must be null.',
  childhood: 'They shared something from their childhood they want their children to have (or what is missing where they live now). Reflect it in one sentence. followUp must be null.',
  idea: 'They suggested their own idea for a shared space in the village. Respond with genuine interest in one sentence and say it will go into their application for the families to consider. followUp must be null.',
  closing: 'Write one personal sentence (in "reply") that connects what they shared to joining the village, as the last thing before they decide to apply. No pressure, no promises. followUp must be null.',
};

const AsaraInput = z.object({
  moment: z.enum(['belief', 'film', 'vision', 'vision_followup', 'childhood', 'idea', 'closing']),
  text: z.string().trim().max(800).default(''),
  context: z
    .object({
      name: z.string().max(40).optional(),
      kids: z.string().max(20).optional(),
      ages: z.string().max(80).optional(),
      belief: z.string().max(300).optional(),
      vision: z.string().max(800).optional(),
      followUpQuestion: z.string().max(300).optional(),
    })
    .default({}),
});

export function buildAsaraMessages(input: z.infer<typeof AsaraInput>) {
  const c = input.context;
  const lines = [
    `Moment: ${input.moment}. ${MOMENT_GUIDE[input.moment]}`,
    c.name ? `Their name: ${c.name}` : '',
    c.kids ? `Children: ${c.kids}${c.ages ? ` (ages: ${c.ages})` : ''}` : '',
    c.belief && input.moment !== 'belief' ? `Who they are, in their words: ${c.belief}` : '',
    c.vision && input.moment !== 'vision' ? `Their vision of the ideal village: ${c.vision}` : '',
    c.followUpQuestion ? `Your follow-up question was: ${c.followUpQuestion}` : '',
    input.text ? `What they just wrote: """${input.text}"""` : '',
  ].filter(Boolean);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ];
}

export function cleanAsaraOutput(raw: string): { reply: string; followUp: string | null } | null {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim().slice(0, 420) : '';
    if (!reply) return null;
    const follow = typeof parsed.followUp === 'string' ? parsed.followUp.trim().slice(0, 220) : '';
    return { reply, followUp: follow || null };
  } catch {
    return null;
  }
}

type ChatMessage = { role: string; content: string };

/** Which model Asara talks through: Gemini when GEMINI_API_KEY is set, else OpenAI. */
export function asaraProvider(): 'gemini' | 'openai' | null {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

async function complete(messages: ChatMessage[]): Promise<string> {
  const [system, user] = [messages[0].content, messages[1].content];
  if (asaraProvider() === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`);
    const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 220,
    }),
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

/* ---------------- applications → J-Mission ---------------- */

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const short = z.string().trim().max(300);
const long = z.string().trim().max(1500);

const ApplicationInput = z.object({
  applicantId: z.string().uuid(),
  consent: z.literal(true),
  firstName: z.string().trim().min(1).max(60),
  email: z.preprocess(blankToUndefined, z.string().trim().email().max(254).optional()),
  phone: z.preprocess(blankToUndefined, z.string().trim().min(6).max(32).regex(/^[+0-9 ()-]+$/).optional()),
  profile: z.object({
    belief: long.optional(),
    film: short.optional(),
    kids: short.optional(),
    ages: short.optional(),
    vision: long.optional(),
    visionFollowUpQuestion: short.optional(),
    visionFollowUp: long.optional(),
    childhood: long.optional(),
    families: z.number().int().min(1).max(200).optional(),
    familiesAnswer: short.optional(),
    privacy: z.number().int().min(1).max(10).optional(),
    spaces: z.array(short).max(20).optional(),
    idea: short.optional(),
    food: z.number().int().min(1).max(10).optional(),
    meat: short.optional(),
    meatOk: short.optional(),
    material: short.optional(),
    materials: z.number().int().min(1).max(10).optional(),
    homeType: short.optional(),
    wishes: z.array(short).max(10).optional(),
    direction: short.optional(),
  }),
  plan: z
    .object({
      budget: z.number().min(0).max(100_000_000),
      land: z.number().min(0),
      floor: z.number().min(0),
      storeys: z.number().int().min(1).max(3),
      total: z.number().min(0),
    })
    .optional(),
  utm: z.record(z.string().max(40), z.string().max(200)).optional(),
}).refine((a) => a.email || a.phone, { message: 'An email or a WhatsApp number is needed so the founder can reach you.' });

export type Application = z.infer<typeof ApplicationInput>;
export { ApplicationInput };

/** Flat CRM attributes, one column each in J-Mission's exports. */
export function toCrmAttributes(app: Application): Record<string, string | number> {
  const p = app.profile;
  const out: Record<string, string | number | undefined> = {
    aiga_belief: p.belief,
    aiga_film: p.film,
    aiga_children: p.kids,
    aiga_children_ages: p.ages,
    aiga_vision: p.vision,
    aiga_vision_followup_question: p.visionFollowUpQuestion,
    aiga_vision_followup: p.visionFollowUp,
    aiga_childhood_or_missing: p.childhood,
    aiga_families_envisioned: p.families,
    aiga_families_answer: p.familiesAnswer,
    aiga_privacy_1to10: p.privacy,
    aiga_shared_spaces: p.spaces?.join(', '),
    aiga_own_idea: p.idea,
    aiga_food_quality_1to10: p.food,
    aiga_eats_meat: p.meat,
    aiga_minds_neighbours_meat: p.meatOk,
    aiga_material: p.material,
    aiga_materials_importance_1to10: p.materials,
    aiga_home_type: p.homeType,
    aiga_home_wishes: p.wishes?.join(', '),
    aiga_plot_direction: p.direction,
    aiga_budget_usd: app.plan?.budget,
    aiga_land_m2: app.plan?.land,
    aiga_home_m2: app.plan?.floor,
    aiga_storeys: app.plan?.storeys,
    aiga_estimate_usd: app.plan?.total,
    aiga_applied_at: new Date().toISOString(),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string | number>;
}

export function memoryNote(app: Application): string {
  const p = app.profile;
  return [
    `Applied to AIGA Village through the 3D onboarding with Asara.`,
    p.belief ? `Who they are: ${p.belief}` : '',
    p.vision ? `Their ideal village: ${p.vision}` : '',
    p.visionFollowUp ? `More on that (${p.visionFollowUpQuestion ?? 'follow-up'}): ${p.visionFollowUp}` : '',
    p.childhood ? `Childhood / missing today: ${p.childhood}` : '',
    p.idea ? `Their own idea for the village: ${p.idea}` : '',
    p.kids ? `Children: ${p.kids}${p.ages ? ` (${p.ages})` : ''}` : '',
    p.families ? `Imagines a village of about ${p.families} families.` : '',
    app.plan ? `Budget about $${Math.round(app.plan.budget).toLocaleString('en-US')}; sketch: ${app.plan.floor} m² home on ${app.plan.land} m² of land.` : '',
  ].filter(Boolean).join('\n');
}

async function jm(path: string, body: unknown) {
  const base = (process.env.JMISSION_URL || '').replace(/\/+$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.JMISSION_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: data as Record<string, any> };
}

/* ---------------- routes ---------------- */

export function onboardingRouter(): Router {
  const router = Router();

  router.get('/api/onboarding/status', (_req, res) => {
    res.json({
      asara: Boolean(asaraProvider()),
      applications: Boolean(process.env.JMISSION_URL && process.env.JMISSION_API_KEY && process.env.JMISSION_ENTRY_POINT),
    });
  });

  router.post('/api/asara', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
    if (!asaraProvider()) {
      res.status(503).json({ error: 'Asara is resting' });
      return;
    }
    const parsed = AsaraInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    try {
      const out = cleanAsaraOutput(await complete(buildAsaraMessages(parsed.data)));
      if (!out) {
        res.status(502).json({ error: 'Asara could not answer' });
        return;
      }
      res.json(out);
    } catch (err: any) {
      console.error('[Asara] request failed:', err?.message);
      res.status(502).json({ error: 'Asara could not answer' });
    }
  });

  router.post('/api/applications', rateLimit({ windowMs: 10 * 60_000, max: 5 }), async (req, res) => {
    if (!process.env.JMISSION_URL || !process.env.JMISSION_API_KEY || !process.env.JMISSION_ENTRY_POINT) {
      res.status(503).json({ error: 'Applications open very soon. Please try again in a few days.' });
      return;
    }
    const parsed = ApplicationInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Some answers need a look.' });
      return;
    }
    const app = parsed.data;
    try {
      const pushed = await jm('/api/people', {
        entryPoint: process.env.JMISSION_ENTRY_POINT,
        consent: true,
        firstName: app.firstName,
        ...(app.email ? { email: app.email } : {}),
        ...(app.phone ? { phone: app.phone } : {}),
        attributes: toCrmAttributes(app),
        externalId: { provider: 'aiga', value: app.applicantId },
        utm: app.utm ?? {},
      });
      if (!pushed.ok) {
        console.error('[Applications] J-Mission refused', pushed.status, JSON.stringify(pushed.data).slice(0, 300));
        res.status(502).json({ error: 'We could not save your application just now. Please try again in a minute.' });
        return;
      }
      const personId = pushed.data?.person?.id;
      if (personId) {
        const note = await jm(`/api/people/${personId}/memory`, { content: memoryNote(app), kind: 'note' }).catch(() => null);
        if (note && !note.ok) console.warn('[Applications] memory note not saved', note.status);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[Applications] failed:', err?.message);
      res.status(502).json({ error: 'We could not save your application just now. Please try again in a minute.' });
    }
  });

  return router;
}
