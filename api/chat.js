// Vercel serverless function: POST /api/chat
// Gemini API key stays on the server; never place it in browser code.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
    const body = req.body || {};
    const question = String(body.question || "").trim();
    if (!question && !body.image) return sendError(res, 400, "Please enter a question or attach an image.");
    if (question.length > 12000) return sendError(res, 400, "Question is too long.");
    const language = body.language === "ur" ? "Urdu" : body.language === "en" ? "English" : "Sindhi";
    const prompt = `You are Sindhi AI Learning Assistant, a careful school tutor. Answer in ${language}. Explain school subjects in simple, age-appropriate language with clear examples. If unsure, say so and advise checking the textbook or teacher. Be accurate, respectful, and concise.\n\nStudent question: ${question || "Please explain the attached image."}`;
    const parts = [{ text: prompt }];
    if (body.image) {
      const image = String(body.image);
      const match = image.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([\s\S]+)$/i);
      if (!match) return sendError(res, 400, "Unsupported image format.");
      if (image.length > 3_500_000) return sendError(res, 413, "Image is too large. Please choose a smaller image.");
      parts.push({ inline_data: { mime_type: match[1].toLowerCase().replace("image/jpg", "image/jpeg"), data: match[2] } });
    }
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 1200, temperature: 0.5 } })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Gemini chat API error:", upstream.status, result?.error?.message || result);
      return sendError(res, 502, result?.error?.message || "Gemini could not answer. Check API access and model availability.");
    }
    return res.status(200).json({ answer: extractText(result) || "No answer returned." });
  } catch (error) {
    console.error("Gemini chat function failed:", error?.message || error);
    return sendError(res, 500, "AI request failed. Please try again.");
  }
}
