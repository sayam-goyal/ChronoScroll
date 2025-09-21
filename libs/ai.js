
// ai.js — Gemini summarization for transcripts
import { getSettings } from './storage.js';

export const GEMINI_DEFAULT_KEY = "AIzaSyAeOvPwSGpP36CioU2kyPNOcTzA718dTK8";
const MODEL = 'models/gemini-1.5-flash:generateContent';

export async function getGeminiKey() {
  const s = await getSettings();
  return (s.aiKey && s.aiKey.trim()) || GEMINI_DEFAULT_KEY;
}

function buildPrompt(transcript, prefs) {
  const schema = [
    '{',
    '  "summary": string,',
    '  "topics": string[],',
    '  "genres": string[],',
    '  "language": string,',
    '  "key_quotes": string[],',
    '  "suitability": string,',
    '  "tags": string[]',
    '}'
  ].join('\n');
  return [
    'You are a helpful assistant that summarizes short-form video transcripts.',
    'Return ONLY valid JSON (no markdown). Use this schema:',
    schema,
    '',
    'User preferences (suggest, do not force): ' + (prefs||''),
    '',
    'Transcript:',
    (transcript||'').slice(0, 6000)
  ].join('\n\n');
}

export async function summarizeTranscript(transcriptText, prefsSummary='') {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error('No Gemini API key configured.');
  const body = {
    contents:[{ role:'user', parts:[{text: buildPrompt(transcriptText, prefsSummary)}] }]
  };
  const url = 'https://generativelanguage.googleapis.com/v1beta/' + MODEL + '?key=' + encodeURIComponent(apiKey);
  const resp = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await resp.json();
  const text = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    const raw = m ? m[0] : text;
    return JSON.parse(raw);
  } catch (e) {
    return { summary: (text||'').slice(0, 600), topics: [], genres: [], language: '', key_quotes: [], suitability: 'neutral', tags: [] };
  }
}
