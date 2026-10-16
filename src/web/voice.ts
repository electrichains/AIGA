/**
 * Asara's voice, through ElevenLabs. The API key stays on the server:
 *
 *   POST /api/asara/speak       { text } -> audio/mpeg of Asara saying it
 *   POST /api/asara/transcribe  raw audio (webm/mp4/ogg) -> { text }
 *
 * Environment: ELEVENLABS_API_KEY (required to enable voice), ELEVENLABS_VOICE_ID,
 * ELEVENLABS_MODEL (text-to-speech) and ELEVENLABS_STT_MODEL (speech-to-text).
 */
import express, { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from './guards.js';

const API = 'https://api.elevenlabs.io/v1';
const MAX_SPEAK_CHARS = 600;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export function voiceEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

const voiceId = () => process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const ttsModel = () => process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
const sttModel = () => process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';

/** Most of Asara's lines are scripted and identical for everyone, so recent clips are kept in memory. */
const cache = new Map<string, Buffer>();
const CACHE_MAX = 300;
function remember(key: string, audio: Buffer) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, audio);
}

/** Turns a chat line into something natural to say aloud. */
export function speakableText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/m²/g, ' square metres')
    .replace(/[·•]/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPEAK_CHARS);
}

const SpeakInput = z.object({ text: z.string().max(4000) });

export function voiceRouter(): Router {
  const router = Router();

  router.post('/api/asara/speak', rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
    if (!voiceEnabled()) {
      res.status(503).json({ error: 'Voice is off' });
      return;
    }
    const parsed = SpeakInput.safeParse(req.body);
    const text = parsed.success ? speakableText(parsed.data.text) : '';
    if (!text) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    const key = `${voiceId()}|${ttsModel()}|${text}`;
    const hit = cache.get(key);
    if (hit) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.end(hit);
      return;
    }
    try {
      const response = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId())}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: ttsModel(),
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        console.error('[Voice] ElevenLabs speak failed', response.status, (await response.text().catch(() => '')).slice(0, 300));
        res.status(502).json({ error: 'Asara could not speak' });
        return;
      }
      const audio = Buffer.from(await response.arrayBuffer());
      remember(key, audio);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.end(audio);
    } catch (err) {
      console.error('[Voice] speak error', (err as Error).message);
      res.status(502).json({ error: 'Asara could not speak' });
    }
  });

  router.post(
    '/api/asara/transcribe',
    rateLimit({ windowMs: 60_000, max: 12 }),
    express.raw({ type: ['audio/*', 'video/webm', 'application/octet-stream'], limit: MAX_AUDIO_BYTES }),
    async (req, res) => {
      if (!voiceEnabled()) {
        res.status(503).json({ error: 'Voice is off' });
        return;
      }
      const audio = req.body;
      if (!Buffer.isBuffer(audio) || audio.length < 1000) {
        res.status(400).json({ error: 'No audio received' });
        return;
      }
      try {
        const type = String(req.headers['content-type'] || 'audio/webm').split(';')[0];
        const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const form = new FormData();
        form.append('model_id', sttModel());
        form.append('file', new Blob([new Uint8Array(audio)], { type }), `answer.${ext}`);
        const response = await fetch(`${API}/speech-to-text`, {
          method: 'POST',
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          console.error('[Voice] ElevenLabs transcribe failed', response.status, (await response.text().catch(() => '')).slice(0, 300));
          res.status(502).json({ error: 'Could not hear that' });
          return;
        }
        const data = (await response.json()) as { text?: string };
        // Scribe marks sounds like "(laughs)"; keep only the words.
        res.json({ text: String(data.text || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 800) });
      } catch (err) {
        console.error('[Voice] transcribe error', (err as Error).message);
        res.status(502).json({ error: 'Could not hear that' });
      }
    },
  );

  return router;
}
