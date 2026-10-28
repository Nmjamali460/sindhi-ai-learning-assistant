import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "API key is missing"
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
        error: "Please enter a question"
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions:
        `You are Sindhi AI Learning Assistant, created by Rizwan Ali Jamali, a Class 10 student. You are a helpful school tutor. Answer in ${language}. Explain lessons clearly with simple words and examples. Help students understand their subjects.`,
      input: question,
      max_output_tokens: 700
    });

    return res.status(200).json({
      answer: response.output_text || "No answer returned."
    });

  } catch (error) {
    console.error("AI error:", error.message);

    return res.status(500).json({
      error: "AI request failed. Check API key, model access, and API billing."
    });
  }
}
