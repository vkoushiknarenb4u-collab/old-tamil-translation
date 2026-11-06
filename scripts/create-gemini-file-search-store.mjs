import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY before creating a File Search store.");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const store = await ai.fileSearchStores.create({
  config: { displayName: "CholaScript Verified Historical References", embeddingModel: "models/gemini-embedding-2" },
});
console.log(store.name);
console.log("Add the name above as GEMINI_FILE_SEARCH_STORE_ID. Only admin-verified files are indexed by CholaScript.");
