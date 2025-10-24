import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY!;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(apiKey);
export const geminiModel = genAI.getGenerativeModel({ model: modelName });

export async function* streamGeminiReply(userText: string) {
	const resp = await geminiModel.generateContentStream({
		contents: [{ role: 'user', parts: [{ text: userText }] }],
		generationConfig: { temperature: 0.6, topP: 0.9 },
	});
	for await (const chunk of resp.stream) {
		const t = chunk.text();
		if (t) yield t;
	}
}
