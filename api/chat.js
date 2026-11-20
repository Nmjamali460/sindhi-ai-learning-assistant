// Vercel serverless function: POST /api/chat
// Keeps the xAI API key on the server; never place it in browser code.
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
    const body = req.body || {};
    const question = String(body.question || "").trim();
    if (!question && !body.image) return sendError(res, 400, "Please enter a question or attach an image.");
    if (question.length > 12000) return sendError(res, 400, "Question is too long.");

    const language = body.language === "ur" ? "Urdu" : body.language === "en" ? "English" : "Sindhi";
    const systemText = `You are Sindhi AI Learning Assistant, a careful school tutor. Answer in ${language}. Explain school subjects in simple, age-appropriate language with clear examples. If unsure, say so and advise checking the textbook or teacher. Be accurate, respectful, and concise.`;

    const userContent = [{ type: "input_text", text: question || "Please explain the attached image." }];
    if (body.image) {
      const image = String(body.image);
      if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
        return sendError(res, 400, "Unsupported image format.");
      }
      if (image.length > 3_500_000) return sendError(res, 413, "Image is too large. Please choose a smaller image.");
      userContent.push({ type: "input_image", image_url: image });
    }

    const upstream = await fetch("https://api.x.ai/v1/responses", {
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
          { role: "user", content: userContent }
        ]
      })
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("xAI chat API error:", upstream.status, result?.error?.message || result);
      return sendError(res, 502, result?.error?.message || "Grok could not answer. Check your xAI API access and model.");
    }
    const answer = result.output_text || (result.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n").trim();

    return res.status(200).json({ answer: answer || "No answer returned." });
  } catch (error) {
    console.error("Chat function failed:", error?.message || error);
    return sendError(res, 500, "AI request failed. Please try again.");
  }
}
