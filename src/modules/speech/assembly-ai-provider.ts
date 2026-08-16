/* ════════════════════════════════════════════════════════
   AssemblyAI Speech Provider
   Real-time voice-to-text using AssemblyAI Streaming
   With timeout, permission handling, session isolation,
   and dedup guards. Properly handles partial vs final.
   ════════════════════════════════════════════════════════ */

import RecordRTC, { StereoAudioRecorder } from "recordrtc";
import { RealtimeTranscriber } from "assemblyai";
import {
  type ClientSpeechProvider,
  type RecordingState,
  type SpeechProviderConfig,
} from "./types";

const MAX_RECORDING_MS = 60_000; // 60s max

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
    // Guard against duplicate starts
    if (this.isActive) {
      console.warn("[Speech] AssemblyAI already active, ignoring start");
      return;
    }

    if (!this.isSupported) {
      this.onError?.("Microphone not supported on this device.");
      return;
    }

    // Clean up any previous session completely before starting new one
    this.cleanup();

    this.isActive = true;
    this.sessionId = crypto.randomUUID();
    this.lastFinalText = "";
    const currentSessionId = this.sessionId;

    try {
      this.onStateChange?.("processing");

      // 1. Check mic permission first
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (permErr: unknown) {
        const errName =
          permErr instanceof Error ? permErr.name : String(permErr);
        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          this.onStateChange?.("permission_denied");
          this.onError?.("Microphone permission denied. Please allow microphone access.");
        } else {
          this.onStateChange?.("error");
          this.onError?.("Could not access microphone. Please check your device.");
        }
        this.isActive = false;
        this.sessionId = null;
        return;
      }
      this.micStream = stream;

      // 2. Fetch temp token from our API
      let token: string;
      try {
        const res = await fetch("/api/speech/token");
        if (!res.ok) {
          throw new Error(`Token request failed: ${res.status}`);
        }
        const data = await res.json();
        token = data.token;
        if (!token) throw new Error("Empty token received");
      } catch (tokenErr) {
        console.error("[Speech] Token fetch failed:", tokenErr);
        this.onError?.("Speech service unavailable. Try typing your report instead.");
        this.onStateChange?.("error");
        this.cleanup();
        return;
      }

      // Guard: check if session was cancelled during async token fetch
      if (this.sessionId !== currentSessionId) {
        this.cleanup();
        return;
      }

      // 3. Setup RealtimeTranscriber
      this.transcriber = new RealtimeTranscriber({
        token,
        sampleRate: 16_000,
        wordBoost: ["Nagpur", "NMC", "pothole", "waterlogging", "garbage", "Wardha", "Dharampeth"],
      });

      this.transcriber.on("open", () => {
        if (this.sessionId !== currentSessionId) return;
        this.onStateChange?.("recording");
      });

      this.transcriber.on("error", (error: Error) => {
        if (this.sessionId !== currentSessionId) return;
        console.error("[Speech] AssemblyAI stream error:", error);
        this.onError?.("Speech recognition error. Please try again.");
        this.onStateChange?.("error");
        this.cleanup();
      });

      this.transcriber.on("close", () => {
        if (this.sessionId !== currentSessionId) return;
        if (this.isActive) {
          this.onStateChange?.("idle");
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.transcriber.on("transcript", (transcript: any) => {
        // Guard: ignore events from stale sessions
        if (this.sessionId !== currentSessionId) return;
        if (!transcript.text) return;

        if (transcript.message_type === "FinalTranscript") {
          const trimmed = transcript.text.trim();
          // Deduplicate: skip if identical to last final
          if (trimmed && trimmed !== this.lastFinalText) {
            this.lastFinalText = trimmed;
            this.onResult?.(trimmed, true);
          }
        } else if (transcript.message_type === "PartialTranscript") {
          // Partial transcripts REPLACE the previous partial (not append)
          this.onResult?.(transcript.text, false);
        }
      });

      await this.transcriber.connect();

      // Guard: check again after async connect
      if (this.sessionId !== currentSessionId) {
        this.cleanup();
        return;
      }

      // 4. Start recording PCM audio
      this.recorder = new RecordRTC(this.micStream, {
        type: "audio",
        mimeType: "audio/webm;codecs=pcm",
        recorderType: StereoAudioRecorder,
        timeSlice: 250,
        desiredSampRate: 16_000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        audioBitsPerSecond: 128_000,
        ondataavailable: async (blob: Blob) => {
          // Guard: only send audio for current session
          if (this.sessionId !== currentSessionId || !this.transcriber) return;
          try {
            const buffer = await blob.arrayBuffer();
            this.transcriber.sendAudio(buffer);
          } catch {
            // WebSocket may have closed
          }
        },
      });

      this.recorder.startRecording();

      // 5. Auto-stop after MAX_RECORDING_MS
      this.timeoutId = setTimeout(() => {
        if (this.sessionId !== currentSessionId) return;
        console.log("[Speech] Max recording duration reached, stopping");
        this.stop();
      }, MAX_RECORDING_MS);
    } catch (err) {
      console.error("[Speech] Failed to start AssemblyAI:", err);
      this.onError?.(
        err instanceof Error ? err.message : "Failed to start recording"
      );
      this.onStateChange?.("error");
      this.cleanup();
    }
  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.recorder) {
      this.recorder.stopRecording(() => {
        // Give the transcriber a moment to flush any remaining audio
        // before closing the connection
        setTimeout(() => {
          this.cleanup();
        }, 500);
      });
    } else {
      this.cleanup();
    }
  }

  abort(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isActive = false;
    this.sessionId = null;
    this.lastFinalText = "";
    this.onStateChange?.("idle");

    if (this.recorder) {
      try { this.recorder.destroy(); } catch { /* ignore */ }
      this.recorder = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.transcriber) {
      try {
        this.transcriber.close(false);
      } catch {
        // Already closed
      }
      this.transcriber = null;
    }
  }
}
