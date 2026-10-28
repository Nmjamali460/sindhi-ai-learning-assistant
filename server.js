import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();
const app=express(), port=process.env.PORT||3000;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));
app.post("/api/chat",async(req,res)=>{
 try{
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"OPENAI_API_KEY is missing in server .env"});
  const question=String(req.body?.question||"").trim();
  const language=req.body?.language==="ur"?"Urdu":req.body?.language==="en"?"English":"Sindhi";
  if(!question)return res.status(400).json({error:"Please enter a question"});
  if(question.length>4000)return res.status(400).json({error:"Question too long"});
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await client.responses.create({
   model:process.env.OPENAI_MODEL||"gpt-6-astra",
   instructions:`You are Sindhi AI Learning Assistant, a careful school tutor. Answer in ${language}. Explain school subjects in simple, age-appropriate language with examples. If unsure, say so and advise checking the textbook or teacher.`,
   input:question,max_output_tokens:700
  });
  res.json({answer:response.output_text||"No answer returned"});
 }catch(e){console.error(e?.message||e);res.status(500).json({error:"AI request failed. Check API key, model access, internet, and API billing."})}
});
app.listen(port,()=>console.log(`App running at http://localhost:${port}`));
