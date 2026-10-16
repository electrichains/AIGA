import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { voiceRouter, speakableText } from '../src/web/voice.js';

describe('Asara voice (ElevenLabs)', () => {
  const realFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  let server: Server;
  let base = '';

  before(async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    process.env.ELEVENLABS_VOICE_ID = 'voice123';
    globalThis.fetch = (async (input: any, init: any = {}) => {
      const url = String(input);
      if (!url.startsWith('https://api.elevenlabs.io')) return realFetch(input, init);
      calls.push({ url, init });
      if (url.includes('/text-to-speech/')) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/mpeg' } });
      return Response.json({ text: 'A big table (laughs) under the trees' });
    }) as typeof fetch;
    const app = express();
    app.use(express.json());
    app.use(voiceRouter());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    globalThis.fetch = realFetch;
    server.close();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
  });

  test('chat HTML becomes plain speakable text', () => {
    assert.equal(speakableText('Here is <b>5.8 hectares</b> · about 150 m²'), 'Here is 5.8 hectares , about 150 square metres');
    assert.equal(speakableText('x'.repeat(2000)).length, 600);
  });

  test('speak sends the text with the key and voice, and caches repeated lines', async () => {
    const r1 = await realFetch(`${base}/api/asara/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: "Hello, I'm <b>Asara</b>." }) });
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await r1.arrayBuffer())], [1, 2, 3, 4]);
    const call = calls.find((c) => c.url.includes('/text-to-speech/voice123'))!;
    assert.ok(call, 'ElevenLabs text-to-speech was called with the configured voice');
    assert.equal((call.init.headers as Record<string, string>)['xi-api-key'], 'test-key');
    assert.equal(JSON.parse(String(call.init.body)).text, "Hello, I'm Asara .");
    const before = calls.length;
    await realFetch(`${base}/api/asara/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: "Hello, I'm <b>Asara</b>." }) });
    assert.equal(calls.length, before, 'the second identical line comes from the cache');
  });

  test('empty text is refused', async () => {
    const r = await realFetch(`${base}/api/asara/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '<b></b>' }) });
    assert.equal(r.status, 400);
  });

  test('transcribe forwards the audio and returns clean words', async () => {
    const r = await realFetch(`${base}/api/asara/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array(4000) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: 'A big table under the trees' });
    const call = calls.find((c) => c.url.endsWith('/speech-to-text'))!;
    const form = call.init.body as FormData;
    assert.equal(form.get('model_id'), 'scribe_v1');
    assert.equal((form.get('file') as File).name, 'answer.webm');
  });

  test('tiny recordings are refused before reaching ElevenLabs', async () => {
    const r = await realFetch(`${base}/api/asara/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array(10) });
    assert.equal(r.status, 400);
  });
});
