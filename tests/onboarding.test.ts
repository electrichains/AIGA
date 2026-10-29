import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, assertPublicHttpsUrl } from '../src/web/guards.js';
import {
  ApplicationInput,
  toCrmAttributes,
  engagementScore,
  memoryNote,
  cleanAsaraOutput,
  buildAsaraMessages,
} from '../src/web/onboarding.js';

describe('URL safety (SSRF)', () => {
  test('private and local addresses are refused', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
  });

  test('public addresses are allowed', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });

  test('only https links to public hosts pass', async () => {
    await assert.rejects(assertPublicHttpsUrl('http://example.com/a.kmz'), /https/);
    await assert.rejects(assertPublicHttpsUrl('https://127.0.0.1/a.kmz'), /private or local/);
    await assert.rejects(assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data'), /private or local/);
    await assert.rejects(assertPublicHttpsUrl('not a url'), /valid URL/);
  });
});

const sample = {
  applicantId: '5b0c9f2e-3c8f-4a1e-9a77-2f1d6d1a9b10',
  consent: true as const,
  firstName: 'Ana',
  email: 'ana@example.com',
  phone: '',
  profile: {
    belief: 'A teacher who believes kids should grow up barefoot',
    kids: '2',
    ages: '4 and 7',
    vision: 'Kids running between gardens, a big table every Sunday',
    families: 20,
    spaces: ['A big table for everyone', 'Maker workshop'],
    food: 9,
    homeType: '2 bedrooms',
    modules: ['Bathroom & storage', 'Master bedroom', 'Living & kitchen, large', 'Bedroom with bathroom'],
    wishes: ['Morning sun'],
    material: 'Tropical Modern',
    stylesLiked: ['Tropical Modern', 'Bukit Limestone'],
    stylesPassed: ['Steel & Glass'],
  },
  plan: { budget: 480000, land: 300, floor: 150, storeys: 1, total: 480000 },
};

describe('Applications to J-Mission', () => {
  test('a complete application is accepted and an empty phone is dropped', () => {
    const parsed = ApplicationInput.parse(sample);
    assert.equal(parsed.phone, undefined);
    assert.equal(parsed.email, 'ana@example.com');
  });

  test('consent is required', () => {
    assert.equal(ApplicationInput.safeParse({ ...sample, consent: false }).success, false);
  });

  test('an email or a phone is required', () => {
    const res = ApplicationInput.safeParse({ ...sample, email: '', phone: '' });
    assert.equal(res.success, false);
  });

  test('answers become flat aiga_* attributes', () => {
    const attrs = toCrmAttributes(ApplicationInput.parse(sample));
    assert.equal(attrs.aiga_vision, sample.profile.vision);
    assert.equal(attrs.aiga_shared_spaces, 'A big table for everyone, Maker workshop');
    assert.equal(attrs.aiga_budget_usd, 480000);
    assert.equal(attrs.aiga_families_envisioned, 20);
    assert.equal(attrs.aiga_home_modules, 'Bathroom & storage, Master bedroom, Living & kitchen, large, Bedroom with bathroom');
    assert.equal(attrs.aiga_style, 'Tropical Modern');
    assert.equal(attrs.aiga_styles_liked, 'Tropical Modern, Bukit Limestone');
    assert.ok(!('aiga_film' in attrs), 'empty answers are left out');
    for (const key of Object.keys(attrs)) assert.ok(key.length <= 60, key);
  });

  test('a live conversation reaches J-Mission as text and an id', () => {
    const app = ApplicationInput.parse({ ...sample, profile: { ...sample.profile, transcript: 'Asara: Hello\nThem: We dream of a big table', agentConversationId: 'conv_123' } });
    assert.equal(toCrmAttributes(app).aiga_agent_conversation_id, 'conv_123');
    assert.match(memoryNote(app), /conversation with Asara \(voice\):\nAsara: Hello\nThem: We dream of a big table/);
  });

  test('joining the circle carries the village type and place', () => {
    const app = ApplicationInput.parse({ ...sample, stage: 'interest', plan: undefined, profile: { vision: 'A village for single mothers by the sea', villageType: 'Single mothers raising kids together', place: 'amed', placeName: 'Amed', contributions: ['Teaching', 'A digital presence'], investRange: 'Not yet' } });
    const attrs = toCrmAttributes(app);
    assert.equal(attrs.aiga_village_type, 'Single mothers raising kids together');
    assert.equal(attrs.aiga_place, 'Amed');
    assert.equal(attrs.aiga_role, 'seeker');
    assert.ok(attrs.aiga_saved_at);
    assert.match(memoryNote(app), /Joined the Asara circle for Amed/);
    assert.equal(attrs.aiga_contributions, 'Teaching, A digital presence');
    assert.equal(attrs.aiga_invest_range, 'Not yet');
    assert.match(memoryNote(app), /What they could bring: Teaching, A digital presence/);
  });

  test('a land offer is tagged as a land owner with its details', () => {
    const app = ApplicationInput.parse({ ...sample, stage: 'land_offer', plan: undefined, profile: { vision: 'Share my land with vegan families', landOffer: { region: 'Sidemen', size: '1 hectare', terms: 'Long lease' } } });
    const attrs = toCrmAttributes(app);
    assert.equal(attrs.aiga_role, 'land_owner');
    assert.equal(attrs.aiga_land_region, 'Sidemen');
    assert.ok(attrs.aiga_offered_at);
    assert.match(memoryNote(app), /Land offered: where: Sidemen; size: 1 hectare; terms: Long lease/);
  });

  test('a supplier offer is tagged as a supplier with what they offer', () => {
    const app = ApplicationInput.parse({ ...sample, stage: 'supplier', plan: undefined, profile: { supplier: {
      offers: ['Construction or a building team', 'Building materials'],
      details: { 'Construction or a building team': 'Bamboo builders, a team of 12', 'Building materials': 'Reclaimed teak' },
      business: 'Bambu Kita', area: 'East Bali', terms: ['Paid work'], links: 'instagram.com/bambukita' } } });
    const attrs = toCrmAttributes(app);
    assert.equal(attrs.aiga_role, 'supplier');
    assert.equal(attrs.aiga_supplier_offers, 'Construction or a building team, Building materials');
    assert.equal(attrs.aiga_supplier_business, 'Bambu Kita');
    assert.match(String(attrs.aiga_supplier_details), /Building materials: Reclaimed teak/);
    assert.ok(attrs.aiga_offered_at);
    const note = memoryNote(app);
    assert.match(note, /supplier gate: Construction or a building team, Building materials/);
    assert.match(note, /Where they work: East Bali/);
  });

  test('a home on a concept land names its place', () => {
    const note = memoryNote(ApplicationInput.parse({ ...sample, profile: { ...sample.profile, place: 'payangan', placeName: 'Payangan' } }));
    assert.match(note, /^Applied to an Asara village in Payangan \(concept land\) through Asara\./);
  });

  test('the memory note carries the vision and the sketch', () => {
    const note = memoryNote(ApplicationInput.parse(sample));
    assert.match(note, /Their ideal village: Kids running/);
    assert.match(note, /150 m² home on 300 m² of land/);
  });
});

describe('Leads and engagement', () => {
  test('a saved home is a lead with its own timestamp', () => {
    const attrs = toCrmAttributes(ApplicationInput.parse({ ...sample, stage: 'lead' }));
    assert.equal(attrs.aiga_stage, 'lead');
    assert.ok('aiga_saved_at' in attrs && !('aiga_applied_at' in attrs));
  });

  test('stage defaults to application', () => {
    assert.equal(ApplicationInput.parse(sample).stage, 'application');
  });

  test('effort and self-expression raise the engagement score, capped at 100', () => {
    const low = engagementScore(ApplicationInput.parse({ ...sample, profile: { vision: 'ok' } }));
    const high = engagementScore(ApplicationInput.parse({ ...sample, profile: { ...sample.profile, vision: 'x'.repeat(200),
      visionFollowUp: 'yes', childhood: 'trees', idea: 'a library', builderEdits: 9, homeType: 'Built my own', homeName: 'Rumah Senja', fit: 'Yes, I can' } }));
    assert.ok(low < 10, `low was ${low}`);
    assert.equal(high, 100);
  });
});

describe('Asara', () => {
  test('model output is cleaned and length-limited', () => {
    assert.deepEqual(cleanAsaraOutput('{"reply":" Hi there. ","followUp":""}'), { reply: 'Hi there.', followUp: null });
    assert.equal(cleanAsaraOutput('not json'), null);
    assert.deepEqual(cleanAsaraOutput('```json\n{"reply":"Fenced.","followUp":"Why?"}\n```'), { reply: 'Fenced.', followUp: 'Why?' });
    assert.equal(cleanAsaraOutput('{"reply":""}'), null);
    assert.equal(cleanAsaraOutput(JSON.stringify({ reply: 'x'.repeat(2000) }))!.reply.length, 420);
  });

  test('the prompt carries the moment, their words and the guardrails', () => {
    const msgs = buildAsaraMessages({ moment: 'vision', text: 'A village by the sea', context: { name: 'Ana', kids: '2' } });
    assert.match(msgs[0].content, /Never promise acceptance/);
    assert.match(msgs[1].content, /Moment: vision/);
    assert.match(msgs[1].content, /A village by the sea/);
  });
});
