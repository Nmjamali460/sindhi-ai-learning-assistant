// Vercel serverless function: POST /api/chat
// Gemini API key stays on the server; never place it in browser code.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_ATTEMPTS = 4; // Initial request + up to 3 retries
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
  maxDuration: 60
};

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || "")
    .join("\n")
    .trim();
}

function getRetryDelay(response, attempt) {
  const retryAfter = response?.headers?.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 500), 8000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.min(dateDelay, 8000);
  }
  return Math.min(1000 * (2 ** attempt), 8000);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestGemini(url, payload) {
  let lastResponse;
  let lastResult = {};

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok) return { response, result };

    lastResponse = response;
    lastResult = result;

    if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
      break;
    }

    const delay = getRetryDelay(response, attempt);
    console.warn(`Gemini returned ${response.status}; retrying chat request (${attempt + 1}/${MAX_ATTEMPTS - 1}) after ${delay}ms.`);
    await wait(delay);
  }

  return { response: lastResponse, result: lastResult };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sendError(res, 500, "GEMINI_API_KEY is not configured in Vercel.");

  try {
    const body = req.body || {};
    const question = String(body.question || "").trim();

    if (!question && !body.image) {
      return sendError(res, 400, "Please enter a question or attach an image.");
    }
    if (question.length > 12000) return sendError(res, 400, "Question is too long.");

    const language = body.language === "ur" ? "Urdu" : body.language === "en" ? "English" : "Sindhi";
    const prompt = `You are Sindhi AI Learning Assistant, a careful school tutor. Answer in ${language}. Explain school subjects in simple, age-appropriate language with clear examples. If unsure, say so and advise checking the textbook or teacher. Be accurate, respectful, and concise.\n\nStudent question: ${question || "Please explain the attached image."}`;
    const parts = [{ text: prompt }];

    if (body.image) {
      const image = String(body.image);
      const match = image.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([\s\S]+)$/i);
      if (!match) return sendError(res, 400, "Unsupported image format.");
      if (image.length > 3_500_000) {
        return sendError(res, 413, "Image is too large. Please choose a smaller image.");
      }
      parts.push({
        inline_data: {
          mime_type: match[1].toLowerCase().replace("image/jpg", "image/jpeg"),
          data: match[2]
        }
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const { response: upstream, result } = await requestGemini(url, {
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.5 }
    });

    if (!upstream?.ok) {
      const status = upstream?.status || 502;
      const providerMessage = result?.error?.message;
      console.error("Gemini chat API error after retries:", status, providerMessage || result);

      if (status === 429 || status === 503 || status === 504) {
        return sendError(res, 503, "Gemini is temporarily busy. Please wait a little and try again.");
      }
      return sendError(res, 502, providerMessage || "Gemini could not answer. Check API access and model availability.");
    }

    return res.status(200).json({ answer: extractText(result) || "No answer returned." });
  } catch (error) {
    console.error("Gemini chat function failed:", error?.message || error);
    return sendError(res, 500, "AI request failed. Please try again.");
  }
}
