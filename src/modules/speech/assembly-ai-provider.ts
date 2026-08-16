/* ════════════════════════════════════════════════════════
   AssemblyAI Speech Provider — Production-grade
   Real-time voice-to-text via AssemblyAI Streaming

   KNOWN ISSUES FIXED:
   1. MIME type "audio/webm;codecs=pcm" not supported on mobile.
      Fixed: detect supported format at runtime.
   2. Provider locked at mount — if token fails at cold start,
      browser speech is used forever. Fixed: lazy init per session.
   3. Cleanup order — transcriber closed before recorder stops.
      Fixed: correct teardown sequence.
   ════════════════════════════════════════════════════════ */

import RecordRTC, { StereoAudioRecorder } from "recordrtc";
import { RealtimeTranscriber } from "assemblyai";
import {
  type ClientSpeechProvider,
  type RecordingState,
  type SpeechProviderConfig,
} from "./types";

const MAX_RECORDING_MS = 60_000;

/**
 * Detect the best supported audio MIME type for this browser.
 * "audio/webm;codecs=pcm" fails silently on iOS/Android Chrome.
 * We must probe what the browser actually supports.
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";

  const candidates = [
    "audio/webm;codecs=pcm",   // Chrome desktop only
    "audio/webm;codecs=opus",  // Chrome desktop + Android
    "audio/webm",              // Generic WebM
    "audio/ogg;codecs=opus",   // Firefox
    "audio/mp4",               // iOS Safari (partial)
  ];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      console.log(`[Speech] Using MIME type: ${mime}`);
      return mime;
    }
  }

  console.warn("[Speech] No preferred MIME type supported, using audio/webm");
  return "audio/webm";
}

export class AssemblyAiProvider implements ClientSpeechProvider {
  readonly name = "assemblyai";
  private transcriber: RealtimeTranscriber | null = null;
  private recorder: RecordRTC | null = null;
  private micStream: MediaStream | null = null;
  private isActive = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Unique session ID — prevents stale callbacks from old sessions */
  sessionId: string | null = null;

  /** Track the last final text to prevent duplicates */
  private lastFinalText = "";

  onResult: ((transcript: string, isFinal: boolean) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onStateChange: ((state: RecordingState) => void) | null = null;

  get isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  async start(config?: SpeechProviderConfig): Promise<void> {
    if (this.isActive) {
      console.warn("[Speech] AssemblyAI already active, ignoring start");
      return;
    }

    if (!this.isSupported) {
      this.onError?.("Microphone not supported on this device.");
      return;
    }

    // Clean up any previous session completely
    await this.cleanupAsync();

    this.isActive = true;
    this.sessionId = crypto.randomUUID();
    this.lastFinalText = "";
    const currentSessionId = this.sessionId;

    try {
      this.onStateChange?.("processing");

      // ── Step 1: Microphone permission ──────────────────
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (permErr: unknown) {
        const errName = permErr instanceof Error ? permErr.name : String(permErr);
        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          this.onStateChange?.("permission_denied");
          this.onError?.("Microphone permission denied. Please allow microphone access in your browser settings.");
        } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          this.onStateChange?.("error");
          this.onError?.("No microphone found on this device.");
        } else if (errName === "NotReadableError") {
          this.onStateChange?.("error");
          this.onError?.("Microphone is in use by another app. Please close other apps and try again.");
        } else {
          this.onStateChange?.("error");
          this.onError?.(`Could not access microphone: ${errName}`);
        }
        this.isActive = false;
        this.sessionId = null;
        return;
      }

      if (this.sessionId !== currentSessionId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.micStream = stream;

      // ── Step 2: Get ephemeral token ────────────────────
      let token: string;
      try {
        const res = await fetch("/api/speech/token", {
          // Short timeout — if it fails, fall back at call site
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Token failed: HTTP ${res.status}`);
        }
        const data = await res.json();
        token = data.token;
        if (!token) throw new Error("Empty token received from server");
      } catch (tokenErr) {
        console.error("[Speech] Token fetch failed:", tokenErr);
        this.onError?.(
          tokenErr instanceof Error && tokenErr.name === "TimeoutError"
            ? "Speech service timed out. Check your internet connection."
            : "Speech service unavailable. Please type your report instead."
        );
        this.onStateChange?.("error");
        await this.cleanupAsync();
        return;
      }

      if (this.sessionId !== currentSessionId) {
        await this.cleanupAsync();
        return;
      }

      // ── Step 3: Create RealtimeTranscriber ────────────
      this.transcriber = new RealtimeTranscriber({
        token,
        sampleRate: 16_000,
        wordBoost: [
          "Nagpur", "NMC", "pothole", "waterlogging", "garbage",
          "Wardha", "Dharampeth", "Hingna", "Kamptee",
        ],
      });

      this.transcriber.on("open", () => {
        if (this.sessionId !== currentSessionId) return;
        console.log("[Speech] AssemblyAI WebSocket connected");
        this.onStateChange?.("recording");
      });

      this.transcriber.on("error", (error: Error) => {
        if (this.sessionId !== currentSessionId) return;
        console.error("[Speech] AssemblyAI stream error:", error.message);
        this.onError?.("Speech recognition encountered an error. Please try again.");
        this.onStateChange?.("error");
        this.cleanupAsync();
      });

      this.transcriber.on("close", (code: number, reason: string) => {
        if (this.sessionId !== currentSessionId) return;
        console.log(`[Speech] AssemblyAI WebSocket closed: ${code} ${reason}`);
        if (this.isActive) {
          // Unexpected close
          this.onStateChange?.("idle");
          this.isActive = false;
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.transcriber.on("transcript", (transcript: any) => {
        if (this.sessionId !== currentSessionId) return;
        if (!transcript.text) return;

        if (transcript.message_type === "FinalTranscript") {
          const trimmed = transcript.text.trim();
          if (trimmed && trimmed !== this.lastFinalText) {
            this.lastFinalText = trimmed;
            this.onResult?.(trimmed, true);
          }
        } else if (transcript.message_type === "PartialTranscript") {
          // Partial replaces previous — never appended
          this.onResult?.(transcript.text, false);
        }
      });

      try {
        await this.transcriber.connect();
      } catch (connErr) {
        console.error("[Speech] Failed to connect to AssemblyAI:", connErr);
        this.onError?.("Could not connect to speech service. Check your internet connection.");
        this.onStateChange?.("error");
        await this.cleanupAsync();
        return;
      }

      if (this.sessionId !== currentSessionId) {
        await this.cleanupAsync();
        return;
      }

      // ── Step 4: Start recording audio ─────────────────
      // Detect the best supported MIME type at runtime
      const mimeType = getSupportedMimeType();

      this.recorder = new RecordRTC(this.micStream, {
        type: "audio",
        mimeType: mimeType as "audio/webm", // RecordRTC type accepts this
        recorderType: StereoAudioRecorder,
        timeSlice: 250,            // Send chunks every 250ms
        desiredSampRate: 16_000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        audioBitsPerSecond: 128_000,
        ondataavailable: async (blob: Blob) => {
          if (this.sessionId !== currentSessionId || !this.transcriber) return;
          if (blob.size === 0) return; // Skip empty blobs (common on mobile)
          try {
            const buffer = await blob.arrayBuffer();
            if (buffer.byteLength > 0) {
              this.transcriber.sendAudio(buffer);
            }
          } catch {
            // WebSocket may have closed — ignore
          }
        },
      });

      this.recorder.startRecording();

      // ── Step 5: Auto-stop safety timer ────────────────
      this.timeoutId = setTimeout(() => {
        if (this.sessionId !== currentSessionId) return;
        console.log("[Speech] Max recording duration reached");
        this.stop();
      }, MAX_RECORDING_MS);

      console.log(`[Speech] Recording started (session: ${currentSessionId.slice(0, 8)})`);

    } catch (err) {
      console.error("[Speech] Unexpected start error:", err);
      this.onError?.(err instanceof Error ? err.message : "Failed to start recording");
      this.onStateChange?.("error");
      await this.cleanupAsync();
    }
  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (!this.isActive) return;

    if (this.recorder) {
      this.recorder.stopRecording(() => {
        // Give 800ms for final audio to be sent and transcribed
        setTimeout(() => this.cleanupAsync(), 800);
      });
    } else {
      this.cleanupAsync();
    }
  }

  abort(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.cleanupAsync();
  }

  private async cleanupAsync(): Promise<void> {
    this.isActive = false;
    this.sessionId = null;
    this.lastFinalText = "";

    // Stop recorder first (stop sending audio)
    if (this.recorder) {
      try { this.recorder.destroy(); } catch { /* ignore */ }
      this.recorder = null;
    }

    // Release microphone
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    // Close transcriber last (after audio is done)
    if (this.transcriber) {
      try {
        this.transcriber.close(false);
      } catch {
        // Already closed — fine
      }
      this.transcriber = null;
    }

    this.onStateChange?.("idle");
  }
}
