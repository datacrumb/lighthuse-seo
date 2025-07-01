import { processGoogleSheet } from '@/lib/google-sheets';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const readableStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (message: string) => {
        controller.enqueue(`data: ${JSON.stringify({ message })}\n\n`);
      };

      try {
        await processGoogleSheet(sendEvent);
        controller.close();
      } catch (error: any) {
        sendEvent(`Error: ${error.message}`);
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 