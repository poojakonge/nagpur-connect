/* ════════════════════════════════════════════════════════
   POST /api/speech/transcribe — Upload audio + create job
   GET  /api/speech/transcribe?id=xxx — Poll job status

   Used by mobile devices to batch-transcribe a complete audio
   recording. Two-step design avoids Vercel function timeouts:
   - POST: upload audio to AssemblyAI + create transcript job (~3-5s)
   - GET:  check status (fast, client polls every 2s)
   ════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export const maxDuration = 30;

const AAI = "https://api.assemblyai.com";

function authHeaders(apiKey: string) {
  return { Authorization: apiKey };
}

/* ── GET /api/speech/transcribe?id=xxx ─────────────────── */
export async function GET(req: NextRequest) {
  try {
    const apiKey = env.assemblyAiKey;
    if (!apiKey) {
      return NextResponse.json({ error: "AssemblyAI not configured" }, { status: 503 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const res = await fetch(`${AAI}/v2/transcript/${id}`, {
      headers: authHeaders(apiKey),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[Transcribe] Poll failed (${res.status}):`, txt);
      return NextResponse.json({ error: "Poll failed" }, { status: 500 });
    }

    const data = await res.json();
    // Forward: status, text (if completed), error (if error)
    return NextResponse.json({
      status: data.status,          // "queued" | "processing" | "completed" | "error"
      transcript: data.text ?? "",  // Final text when completed
      error: data.error ?? null,    // AssemblyAI error message if status === "error"
    });
  } catch (err) {
    console.error("[Transcribe] GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ── POST /api/speech/transcribe ───────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const apiKey = env.assemblyAiKey;
    if (!apiKey) {
      return NextResponse.json({ error: "AssemblyAI not configured" }, { status: 503 });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile || !audioFile.size) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    console.log(`[Transcribe] Received audio: ${audioFile.size}B, type: ${audioFile.type}`);

    // Step 1 — Upload raw audio bytes to AssemblyAI
    const audioBuffer = await audioFile.arrayBuffer();
    const uploadRes = await fetch(`${AAI}/v2/upload`, {
      method: "POST",
      headers: {
        ...authHeaders(apiKey),
        "Content-Type": "application/octet-stream",
      },
      body: audioBuffer,
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text().catch(() => "");
      console.error(`[Transcribe] Upload failed (${uploadRes.status}):`, txt);
      return NextResponse.json({ error: "Audio upload failed" }, { status: 500 });
    }

    const { upload_url } = await uploadRes.json();
    console.log(`[Transcribe] Uploaded → ${upload_url}`);

    // Step 2 — Create transcript job
    const transcriptRes = await fetch(`${AAI}/v2/transcript`, {
      method: "POST",
      headers: {
        ...authHeaders(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: upload_url,
        language_detection: true,  // Auto-detects Hindi, Marathi, English, etc.
      }),
    });

    if (!transcriptRes.ok) {
      const txt = await transcriptRes.text().catch(() => "");
      console.error(`[Transcribe] Job creation failed (${transcriptRes.status}):`, txt);
      return NextResponse.json({ error: "Transcription job failed" }, { status: 500 });
    }

    const { id: jobId } = await transcriptRes.json();
    console.log(`[Transcribe] Job created → ${jobId}`);

    return NextResponse.json({ jobId });
  } catch (err) {
    console.error("[Transcribe] POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
