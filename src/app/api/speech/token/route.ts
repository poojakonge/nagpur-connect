/* ════════════════════════════════════════════════════════
   AssemblyAI Token Endpoint
   Generates a short-lived temporary token for the client.
   Falls back gracefully if the API key is invalid.
   ════════════════════════════════════════════════════════ */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  try {
    const apiKey = env.assemblyAiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AssemblyAI API key not configured", fallback: true },
        { status: 503 }
      );
    }

    // Use the REST API directly to create a temporary token
    // This avoids importing the full AssemblyAI SDK on the server
    const res = await fetch("https://api.assemblyai.com/v2/realtime/token", {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_in: 300 }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`[Speech API] AssemblyAI token request failed (${res.status}): ${errorText}`);
      return NextResponse.json(
        { error: "Speech service unavailable", fallback: true },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ token: data.token });
  } catch (err) {
    console.error("[Speech API] Failed to generate token:", err);
    return NextResponse.json(
      { error: "Failed to generate speech token", fallback: true },
      { status: 503 }
    );
  }
}
