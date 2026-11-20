// Vercel serverless function: POST /api/voice
// Receives a browser recording, transcribes it with xAI STT, then asks Grok.
// The transcript is kept server-side; the browser receives only the AI answer.
const MODEL = process.env.XAI_MODEL || "grok-4.7";

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return sendError(res, 500, "XAI_API_KEY is not configured in Vercel.");

  try {
    const { audioBase64, mimeType, language } = req.body || {};
    if (typeof audioBase64 !== "string" || !audioBase64) {
      return sendError(res, 400, "No voice recording was received.");
    }
    if (audioBase64.length > 3_800_000) {
      return sendError(res, 413, "Recording is too large. Please record a shorter message.");
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/i, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
      return sendError(res, 400, "The voice recording format is invalid.");
    }
    const audioBuffer = Buffer.from(cleanBase64, "base64");
    if (!audioBuffer.length) return sendError(res, 400, "The voice recording is empty.");

    const type = typeof mimeType === "string" ? mimeType.split(";")[0].toLowerCase() : "audio/webm";
    const extension = type.includes("mp4") || type.includes("m4a") ? "m4a"
      : type.includes("ogg") ? "ogg"
      : type.includes("wav") ? "wav"
      : type.includes("mpeg") || type.includes("mp3") ? "mp3"
      : "webm";

    const form = new FormData();
    form.append("model", "grok-voice-transcribe-2.0");
    // xAI explicitly lists Urdu and English; leave other selections to auto-detection.
    if (language === "ur" || language === "en") form.append("language", language);
    form.append("file", new Blob([audioBuffer], { type: type || "audio/webm" }), `voice.${extension}`);

    const sttResponse = await fetch("https://api.x.ai/v1/stt", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form
    });
    const stt = await sttResponse.json().catch(() => ({}));
    if (!sttResponse.ok) {
      console.error("xAI speech-to-text error:", sttResponse.status, stt?.error || stt);
      return sendError(res, 502, stt?.error?.message || "Grok could not understand this recording. Please try again.");
    }

    const transcript = String(stt.text || "").trim();
    if (!transcript) return sendError(res, 422, "No speech was detected. Please record your question again.");
    if (transcript.length > 6000) return sendError(res, 413, "The voice question is too long.");

    const answerLanguage = language === "ur" ? "Urdu" : language === "en" ? "English" : "Sindhi";
    const systemText = `You are Sindhi AI Learning Assistant, a careful school tutor. Answer in ${answerLanguage}. Explain school subjects in simple, age-appropriate language with examples. If unsure, say so and advise checking the textbook or teacher.`;
    const answerResponse = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        max_output_tokens: 1000,
        input: [
          { role: "system", content: systemText },
          { role: "user", content: transcript }
        ]
      })
    });
    const answerData = await answerResponse.json().catch(() => ({}));
    if (!answerResponse.ok) {
      console.error("xAI answer error:", answerResponse.status, answerData?.error || answerData);
      return sendError(res, 502, answerData?.error?.message || "Grok could not prepare an answer.");
    }
    const answer = answerData.output_text || (answerData.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n").trim();

    // Deliberately do not return the transcript or audio to the client.
    return res.status(200).json({ answer: answer || "No answer returned." });
  } catch (error) {
    console.error("Voice function failed:", error?.message || error);
    return sendError(res, 500, "Voice message processing failed. Please try again.");
  }
}
