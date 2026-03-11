import fs from "node:fs/promises";

import { GoogleGenerativeAI } from "@google/generative-ai";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function transcribeWithGemini(params: { audioWavPath: string }) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);

  const requestedModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = [
    requestedModel,
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro-latest",
  ].filter((m): m is string => Boolean(m && m.length > 0));

  const wavBytes = await fs.readFile(params.audioWavPath);
  const base64 = wavBytes.toString("base64");

  const prompt =
    "Transcribe the audio. Return ONLY valid JSON with this shape: " +
    "{language?: string, segments: [{start:number,end:number,text:string,words?:[{start:number,end:number,text:string}]}]}. " +
    "Prefer word-level timestamps in words[]. If you cannot produce word-level timestamps, omit words and produce accurate segment timestamps.";

  let lastErr: unknown;
  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "audio/wav",
            data: base64,
          },
        },
      ]);

      const text = result.response.text();
      return safeJsonFromModel(text);
    } catch (err) {
      lastErr = err;
      if (!isModelNotFoundError(err)) break;
      continue;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function analyzeTranscript(params: { transcriptJson: any }) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);

  const requestedModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = [
    requestedModel,
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
  ].filter((m): m is string => Boolean(m && m.length > 0));

  const prompt =
    "Analyze this video transcript and identify the most engaging, viral-potential segments. " +
    "For each segment, provide: " +
    "1. Start and end times (must be accurate based on the transcript). " +
    "2. A short catchy title. " +
    "3. A 'viral_score' from 1 to 10. " +
    "4. A brief reason why it's engaging. " +
    "Return ONLY valid JSON in this format: " +
    "{ segments: [{start:number, end:number, title:string, viral_score:number, reason:string}] }. " +
    "Transcript: " + JSON.stringify(params.transcriptJson);

  let lastErr: unknown;
  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return safeJsonFromModel(text);
    } catch (err) {
      lastErr = err;
      if (!isModelNotFoundError(err)) break;
      continue;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function safeJsonFromModel(text: string) {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Gemini returned no JSON object");
  }
  const slice = trimmed.slice(firstBrace, lastBrace + 1);
  return JSON.parse(slice);
}

function isModelNotFoundError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("models/") && msg.includes("not found");
}
