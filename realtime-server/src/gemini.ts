import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY!;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(apiKey);
export const geminiModel = genAI.getGenerativeModel({ model: modelName });

// System prompt to shape the AI's behavior as a voice assistant
const SYSTEM_PROMPT = `You are a helpful and friendly voice assistant. Your responses should be:
- Natural and conversational in tone
- Concise and to-the-point (aim for 1-3 sentences when possible)
- Formatted for speech (avoid special characters, URLs, or markdown)
- Engaging but professional
- Helpful while being direct

If you don't know something, say so clearly and briefly.
If you need clarification, ask a short, specific question.
Always maintain a helpful and positive demeanor.`;

let conversationHistory: {role: string, parts: {text: string}[]}[] = [
  {
    role: 'model',
    parts: [{text: SYSTEM_PROMPT}]
  }
];

export async function* streamGeminiReply(userText: string) {
  // Add user message to history
  conversationHistory.push({
    role: 'user',
    parts: [{text: userText}]
  });

  // Keep conversation history limited to last 10 messages to avoid token limits
  if (conversationHistory.length > 10) {
    // Keep system prompt and trim old messages
    conversationHistory = [
      conversationHistory[0],
      ...conversationHistory.slice(-9)
    ];
  }

  try {
    const resp = await geminiModel.generateContentStream({
      contents: conversationHistory,
      generationConfig: {
        temperature: 0.7, // Slightly increased for more natural responses
        topP: 0.8,
        maxOutputTokens: 200, // Limit response length for voice
      }
    });

    let responseText = '';
    for await (const chunk of resp.stream) {
      const t = chunk.text();
      if (t) {
        responseText += t;
        yield t;
      }
    }

    // Add AI response to history
    conversationHistory.push({
      role: 'model',
      parts: [{text: responseText}]
    });

  } catch (error) {
    console.error('Gemini API error:', error);
    yield "I apologize, but I'm having trouble processing that right now. Could you try again?";
  }
}
