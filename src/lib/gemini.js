import { GEMINI_KEY } from '../config.js';

// Compress a data-URL image before sending it to the AI, to keep requests small.
export function compressImage(base64, maxWidth = 1400, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64;
  });
}

// Calls Gemini directly from the browser. NOTE: this exposes the key in the
// bundle. For production, proxy this through a Supabase Edge Function and call
// that instead (see README "Hiding the Gemini key").
export async function callGemini(base64, mimeType, prompt) {
  if (!GEMINI_KEY) throw new Error('AI scan is not configured (missing VITE_GEMINI_KEY).');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${GEMINI_KEY}`;
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const payload = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } }] }],
    generationConfig: { responseMimeType: 'application/json' },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini API error');
  const raw = data.candidates[0].content.parts[0].text;
  return JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
}

export const DO_SCAN_PROMPT = `You are an AI assistant for MJM Nursery Malaysia.
Examine this photo of a nursery delivery document, plant label, collection slip, or handwritten note.
The document may list MULTIPLE nurseries/farms with different plant breeds and quantities.

Extract ALL items visible. Also extract the customer/recipient name if shown on the document.
Return ONLY this JSON (no extra text):
{
  "customer_name": "string or null",
  "items": [
    {"nursery": "string or null", "breed": "string or null", "quantity": integer_or_null}
  ],
  "date": "YYYY-MM-DD or null"
}
Include one object per distinct nursery+breed combination. If a field is unreadable use null.`;
