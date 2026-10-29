import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY is missing in Vercel Environment Variables."
    });
  }

  try {
    const question = String(
      req.body?.question || ""
    ).trim();

    const languageCode = req.body?.language || "en";

    const language =
      languageCode === "ur"
        ? "Urdu"
        : languageCode === "sd"
        ? "Sindhi"
        : "English";

    if (!question) {
      return res.status(400).json({
        error: "Please enter a question."
      });
    }

    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    });

    const response = await client.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            `You are Sindhi AI Learning Assistant, created by Rizwan Ali Jamali, a Class 10 student. You are a helpful school tutor. Answer in ${language}. Explain subjects using simple words and examples.`
        },
        {
          role: "user",
          content: question
        }
      ],
      max_tokens: 700
    });

    return res.status(200).json({
      answer:
        response.choices?.[0]?.message?.content ||
        "No answer returned."
    });

  } catch (error) {
    console.error("Groq API error:", error.message);

    return res.status(500).json({
      error: "Groq AI request failed. Check API key, model access, and usage limits."
    });
  }
}
