import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      text, 
      voice = 'Aoede', 
      model = 'gemini-2.0-flash', 
      temperature, 
      topP, 
      topK, 
      maxOutputTokens,
      systemInstruction
    } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured in .env' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare configuration options according to the @google/genai specification
    const generationConfig: any = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
    };

    if (temperature !== undefined) generationConfig.temperature = Number(temperature);
    if (topP !== undefined) generationConfig.topP = Number(topP);
    if (topK !== undefined) generationConfig.topK = Number(topK);
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = Number(maxOutputTokens);
    if (systemInstruction !== undefined) generationConfig.systemInstruction = systemInstruction;

    const responseStream = await ai.models.generateContentStream({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Read the following text out loud exactly as written. Do not add any greeting, intro, outro, commentary, or extra speech. Just read the text verbatim:\n\n${text}`
            }
          ]
        }
      ],
      config: generationConfig,
    });

    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const data = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (data) {
              const sseMessage = `event: audio\ndata: ${JSON.stringify({ audio: data })}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            }
            
            const textPart = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              const sseMessage = `event: text\ndata: ${JSON.stringify({ text: textPart })}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            }
          }
          controller.close();
        } catch (err: any) {
          console.error('TTS stream generation error:', err);
          const errorMsg = `event: error\ndata: ${JSON.stringify({ error: err.message || 'Stream failed' })}\n\n`;
          controller.enqueue(encoder.encode(errorMsg));
          controller.close();
        }
      }
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('TTS API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
