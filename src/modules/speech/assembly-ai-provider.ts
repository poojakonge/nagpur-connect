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


import { RealtimeTranscriber } from "assemblyai";
import {
  type ClientSpeechProvider,
  type RecordingState,
  type SpeechProviderConfig,
} from "./types";

const MAX_RECORDING_MS = 60_000;

export class AssemblyAiProvider implements ClientSpeechProvider {
  readonly name = "assemblyai";
  private transcriber: RealtimeTranscriber | null = null;
  
  // Audio pipeline for raw PCM16
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
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
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
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
      // AssemblyAI Real-Time API strictly expects raw PCM16 (16-bit signed, little-endian, 16kHz, mono).
      // MediaRecorder outputs WebM/Opus which AssemblyAI rejects/closes.
      // We use AudioContext to extract raw PCM.

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });

      const source = this.audioContext.createMediaStreamSource(this.micStream);
      
      // 4096 buffer size = ~256ms of audio at 16kHz
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (this.sessionId !== currentSessionId || !this.transcriber) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        
        // Convert Float32 to Int16
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        try {
          this.transcriber.sendAudio(pcm16.buffer);
        } catch {
          // WebSocket may have closed — ignore
        }
      };

      // Connect nodes safely. 
      // To ensure onaudioprocess fires on Safari, processor must connect to destination.
      // We use a GainNode with gain=0 to prevent the microphone from echoing out the speakers.
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      
      source.connect(this.processor);
      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

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

    if (this.audioContext && this.audioContext.state !== "closed") {
      // Allow final audio chunk to process before full cleanup
      setTimeout(() => this.cleanupAsync(), 800);
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

    // Disconnect Web Audio API nodes
    if (this.processor) {
      try { this.processor.disconnect(); } catch { /* ignore */ }
      this.processor = null;
    }
    
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch { /* ignore */ }
      this.gainNode = null;
    }

    if (this.audioContext) {
      try { this.audioContext.close(); } catch { /* ignore */ }
      this.audioContext = null;
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
