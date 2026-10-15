import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, assertPublicHttpsUrl } from '../src/web/guards.js';
import {
  ApplicationInput,
  toCrmAttributes,
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
    assert.ok(!('aiga_film' in attrs), 'empty answers are left out');
    for (const key of Object.keys(attrs)) assert.ok(key.length <= 60, key);
  });

  test('the memory note carries the vision and the sketch', () => {
    const note = memoryNote(ApplicationInput.parse(sample));
    assert.match(note, /Their ideal village: Kids running/);
    assert.match(note, /150 m² home on 300 m² of land/);
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
