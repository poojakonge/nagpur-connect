/* ════════════════════════════════════════════════════════
   POST /api/speech/transcribe — Mobile audio transcription

   Uses Groq's Whisper API (whisper-large-v3-turbo) which returns
   in 1-3 seconds — fast enough for real-time UX on mobile.

   WHY NOT AssemblyAI batch?
   AssemblyAI batch queues jobs. A 5-second clip can take 30s-2min
   depending on queue depth. Groq Whisper is synchronous and returns
   in 1-5 seconds for clips up to 30 seconds long.

   Supported formats from Chrome MediaRecorder: audio/webm, audio/ogg
   Groq accepts: webm, ogg, mp4, wav, flac, mp3, m4a
   ════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const apiKey = env.groqApiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Speech service not configured. Please type your report instead." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile || !audioFile.size) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    console.log(
      `[Transcribe] Audio received: ${audioFile.size}B, type: "${audioFile.type}"`
    );

    // Determine file extension from MIME type for Groq
    const ext = mimeToExt(audioFile.type);

    // Build multipart/form-data to send to Groq
    const groqForm = new FormData();
    const renamed = new File([audioFile], `audio.${ext}`, { type: audioFile.type });
    groqForm.append("file", renamed);
    groqForm.append("model", "whisper-large-v3-turbo"); // Fastest Whisper on Groq
    // language omitted → auto-detect (handles English, Hindi, Marathi, etc.)

    console.log(`[Transcribe] Calling Groq Whisper (${ext})…`);
    const start = Date.now();

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: groqForm,
      }
    );

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "");
      console.error(`[Transcribe] Groq error (${groqRes.status}):`, errText);
      return NextResponse.json(
        { error: "Transcription failed. Please try again." },
        { status: 500 }
      );
    }

    const data = await groqRes.json();
    const transcript = (data.text || "").trim();
    console.log(
      `[Transcribe] Done in ${Date.now() - start}ms: "${transcript.slice(0, 80)}"`
    );

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[Transcribe] Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function mimeToExt(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  return "webm"; // Chrome default
}
