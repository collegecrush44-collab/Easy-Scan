import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export const suggestTitleFromText = (text: string): string => {
  const cleanText = text.trim();
  if (!cleanText) return "";

  // 1. Check for Dates (YYYY-MM-DD, DD/MM/YYYY, etc)
  const dateRegex = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b|\b(\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/;
  const dateMatch = cleanText.match(dateRegex);
  const foundDate = dateMatch ? (dateMatch[1] || dateMatch[2]) : "";

  // 2. Check for Document Keywords
  const keywords = ['Invoice', 'Receipt', 'Bill', 'Contract', 'Agreement', 'License', 'Passport', 'Ticket', 'Statement', 'Agenda', 'Memo'];
  let foundKeyword = "Document";
  
  for (const kw of keywords) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(cleanText)) {
      foundKeyword = kw;
      break;
    }
  }

  // 3. Extract potential ID number (sequence of 6+ digits)
  const idRegex = /\b\d{6,}\b/;
  const idMatch = cleanText.match(idRegex);
  const foundId = idMatch ? ` #${idMatch[0].slice(-4)}` : "";

  let title = foundKeyword;
  if (foundId) title += foundId;
  if (foundDate) title += ` ${foundDate}`;

  return title === "Document" && !foundDate && !foundId ? "" : title;
};

export const analyzeDocument = async (base64Data: string, type: 'SUMMARY' | 'OCR'): Promise<string> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Extract mimeType and base64 data from dataURL
        const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        
        if (!matches || matches.length !== 3) {
            console.error("Invalid data URL format");
            return "";
        }

        const mimeType = matches[1];
        const data = matches[2];
        const model = 'gemini-2.5-flash'; 
        
        let prompt = "Extract all text from this image. Return only the text content without markdown formatting.";
        if (type === 'SUMMARY') {
            prompt = "Summarize the document in this image in 3 bullet points.";
        }

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: data
                        }
                    },
                    {
                        text: prompt
                    }
                ]
            }
        });

        return response.text || "";

    } catch (error) {
        console.error("AI Error:", error);
        return "";
    }
};