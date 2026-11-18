import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY is missing in Vercel Environment Variables." });

  try {
    const body = req.body || {};
    const question = String(body.question || body.userQuestion || "").trim();
    const image = typeof body.image === "string" ? body.image : "";
    const languageCode = body.language || "en";
    const language = languageCode === "ur" ? "Urdu" : languageCode === "sd" ? "Sindhi" : "English";
    if (!question && !image) return res.status(400).json({ error: "Please enter a question or attach an image." });

    const client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
    const isImage = Boolean(image);
    const messages = [
      { role: "system", content: `You are Sindhi AI Learning Assistant, created by Rizwan Ali Jamali. You are a helpful, accurate school tutor. Respond in ${language}. Use simple words and examples. For translation, faithfully translate visible text. For homework checking, assess the student's visible answer, explain correct/incorrect/partly correct, and provide a correct answer. Never invent text that cannot be read.` },
      { role: "user", content: isImage ? [
        { type: "text", text: question || "Please inspect this image and help the student." },
        { type: "image_url", image_url: { url: image } }
      ] : question }
    ];
    const response = await client.chat.completions.create({
      model: isImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "openai/gpt-oss-20b",
      messages,
      max_tokens: isImage ? 1400 : 900,
      temperature: 0.2
    });
    return res.status(200).json({ answer: response.choices?.[0]?.message?.content || "No answer returned." });
  } catch (error) {
    console.error("Groq API error:", error?.message || error);
    return res.status(500).json({ error: "AI request failed. Check the GROQ_API_KEY, model availability, image size, and Vercel logs." });
  }
}
