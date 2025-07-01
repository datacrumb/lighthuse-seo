'use client';

import { useState } from 'react';

export default function Home() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runAnalysis = async () => {
    setIsRunning(true);
    setLogs([]);

    const response = await fetch('/api/run-analysis', {
      method: 'POST',
    });

    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.substring(6));
              setLogs((prev) => [...prev, json.message]);
            } catch (e) {
              console.error('Failed to parse JSON', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading stream:', error);
      setLogs((prev) => [...prev, `Error: ${error}`]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold mb-8">Lighthouse SEO & Performance Analysis</h1>
      </div>

      <div className="w-full max-w-5xl">
        <button
          onClick={runAnalysis}
          disabled={isRunning}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-500"
        >
          {isRunning ? 'Analysis in Progress...' : 'Start Analysis'}
        </button>

        <div className="mt-8 p-4 bg-black rounded-lg h-96 overflow-y-auto">
          <pre className="text-sm">
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </pre>
        </div>
      </div>
    </main>
  );
}
