import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const prompt = formData.get('prompt') as string || 'Transcribe the audio exactly. Do not add explanations.';
    const model = formData.get('model') as string || 'gemini-2.5-flash';
    const temperature = formData.get('temperature') ? Number(formData.get('temperature')) : undefined;
    const topP = formData.get('topP') ? Number(formData.get('topP')) : undefined;
    const topK = formData.get('topK') ? Number(formData.get('topK')) : undefined;
    const maxOutputTokens = formData.get('maxOutputTokens') ? Number(formData.get('maxOutputTokens')) : undefined;
    const systemInstruction = formData.get('systemInstruction') as string || undefined;

    if (!file) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured in .env' }, { status: 500 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'audio/wav';

    const ai = new GoogleGenAI({ apiKey });

    // Prepare configuration options according to the @google/genai specification
    const generationConfig: any = {};
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (topP !== undefined) generationConfig.topP = topP;
    if (topK !== undefined) generationConfig.topK = topK;
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
    if (systemInstruction !== undefined) generationConfig.systemInstruction = systemInstruction;

    const responseStream = await ai.models.generateContentStream({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio
              }
            },
            {
              text: prompt
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
            const textPart = chunk.text;
            if (textPart) {
              const sseMessage = `event: text\ndata: ${JSON.stringify({ text: textPart })}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            }
          }
          controller.close();
        } catch (err: any) {
          console.error('STT stream generation error:', err);
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
    console.error('STT API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
