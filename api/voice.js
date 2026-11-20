// Vercel serverless function: POST /api/voice
// Sends the recording to Gemini as audio input. Only the answer is returned to the browser.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
function sendError(res, status, message) { return res.status(status).json({ error: message }); }
export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 60 };
function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("\n").trim();
}
export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sendError(res, 500, "GEMINI_API_KEY is not configured in Vercel.");
  try {
    const { audioBase64, mimeType, language } = req.body || {};
    if (typeof audioBase64 !== "string" || !audioBase64) return sendError(res, 400, "No voice recording was received.");
    if (audioBase64.length > 3_800_000) return sendError(res, 413, "Recording is too large. Please record a shorter message.");
    const cleanBase64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/i, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) return sendError(res, 400, "The voice recording format is invalid.");
    const type = typeof mimeType === "string" ? mimeType.split(";")[0].toLowerCase() : "audio/webm";
    if (!/^audio\/(webm|ogg|opus|wav|mpeg|mp3|mp4|m4a|aac|flac)$/i.test(type)) return sendError(res, 400, "This audio format is not supported.");
    const answerLanguage = language === "ur" ? "Urdu" : language === "en" ? "English" : "Sindhi";
    const prompt = `Listen to the attached voice recording. Understand the student's spoken question and answer it directly in ${answerLanguage}. Do not output a transcript. You are Sindhi AI Learning Assistant, a careful school tutor. Explain simply with clear examples. If the speech is unclear, politely ask the student to record it again.`;
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: type, data: cleanBase64 } }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.5 } })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Gemini voice API error:", upstream.status, result?.error?.message || result);
      return sendError(res, 502, result?.error?.message || "Gemini could not process this recording. Please try again.");
    }
    return res.status(200).json({ answer: extractText(result) || "No answer returned." });
  } catch (error) {
    console.error("Gemini voice function failed:", error?.message || error);
    return sendError(res, 500, "Voice message processing failed. Please try again.");
  }
}
