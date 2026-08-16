/* ════════════════════════════════════════════════════════
   AssemblyAI Speech Provider — Streaming v3
   Real-time voice-to-text via AssemblyAI Streaming v3 API

   PREVIOUS BUGS FIXED:
   1. Used RealtimeTranscriber (v2 API: wss://api.assemblyai.com/v2/realtime/ws)
      which has different event names and behaves differently on mobile.
      Fixed: Migrated to StreamingTranscriber (v3: wss://streaming.assemblyai.com/v3/ws)

   2. Token endpoint used POST /v2/realtime/token (v2).
      Fixed: Token endpoint now uses GET /v3/token.

   3. MediaRecorder sends WebM/Opus container, NOT raw PCM16.
      AssemblyAI Streaming v3 rejects non-PCM audio and closes the WebSocket.
      Fixed: AudioContext + ScriptProcessorNode extracts raw Float32 and
      converts to Int16 (PCM16, 16kHz, mono, little-endian) before sending.

   4. v2 event names (FinalTranscript / PartialTranscript / message_type)
      are WRONG for v3. v3 uses: Begin, Turn (with turn_is_formatted field),
      and Termination events.
      Fixed: Using v3 event names via the StreamingTranscriber SDK class.

   AUDIO PIPELINE:
   getUserMedia (16kHz mono)
     → AudioContext.createScriptProcessor (4096 samples ≈ 256ms chunks)
     → Float32 → Int16 conversion
     → transcriber.sendAudio(Int16Array.buffer)  [distinct, non-cumulative]
     → AssemblyAI wss://streaming.assemblyai.com/v3/ws
   ════════════════════════════════════════════════════════ */

import { StreamingTranscriber } from "assemblyai/streaming";
import {
  type ClientSpeechProvider,
  type RecordingState,
  type SpeechProviderConfig,
} from "./types";

const MAX_RECORDING_MS = 60_000;

export class AssemblyAiProvider implements ClientSpeechProvider {
  readonly name = "assemblyai";
  private transcriber: StreamingTranscriber | null = null;

  // Audio pipeline for raw PCM16
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private micStream: MediaStream | null = null;
  private isActive = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Unique session ID — prevents stale callbacks from old sessions */
  sessionId: string | null = null;

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
    const currentSessionId = this.sessionId;
    const sessionShort = currentSessionId.slice(0, 8);

    console.log(`[Speech][${sessionShort}] Session started`);

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
        console.error(`[Speech][${sessionShort}] Mic permission error: ${errName}`);
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

      const track = stream.getAudioTracks()[0];
      console.log(`[Speech][${sessionShort}] Mic granted — tracks: ${stream.getAudioTracks().length}, readyState: ${track?.readyState}, enabled: ${track?.enabled}, UA: ${navigator.userAgent.slice(0, 80)}`);

      if (this.sessionId !== currentSessionId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.micStream = stream;

      // ── Step 2: Get v3 temporary token ────────────────
      let token: string;
      try {
        const res = await fetch("/api/speech/token", {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Token failed: HTTP ${res.status}`);
        }
        const data = await res.json();
        token = data.token;
        if (!token) throw new Error("Empty token received from server");
        console.log(`[Speech][${sessionShort}] v3 token received (length: ${token.length})`);
      } catch (tokenErr) {
        console.error(`[Speech][${sessionShort}] Token fetch failed:`, tokenErr);
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

      // ── Step 3: Create StreamingTranscriber (v3) ──────
      // v3 endpoint: wss://streaming.assemblyai.com/v3/ws
      // v3 events: Begin, Turn (partial/final), Termination
      this.transcriber = new StreamingTranscriber({
        token,
        sampleRate: 16_000,
        // encoding defaults to pcm_s16le (what we send)
        includePartialTurns: true,   // get interim transcript updates
        // keyterms replaces wordBoost in v3
        keyterms: [
          "Nagpur", "NMC", "pothole", "waterlogging", "garbage",
          "Wardha", "Dharampeth", "Hingna", "Kamptee",
        ],
      });

      // v3 event: 'open' fires when the server sends the Begin frame
      this.transcriber.on("open", (beginEvent) => {
        if (this.sessionId !== currentSessionId) return;
        console.log(`[Speech][${sessionShort}] WebSocket OPEN — session_id: ${(beginEvent as any)?.session_id}`);
        this.onStateChange?.("recording");
      });

      // v3 event: 'turn' — fires for both partial and final turns
      // turn.turn_is_formatted === true → end of turn (final/formatted)
      // turn.turn_is_formatted === false → partial/interim update
      this.transcriber.on("turn", (turn) => {
        if (this.sessionId !== currentSessionId) return;
        if (!turn.transcript) return;

        const isFinal = turn.turn_is_formatted === true;
        console.log(`[Speech][${sessionShort}] Turn — isFinal: ${isFinal}, text: "${turn.transcript.slice(0, 60)}"`);

        this.onResult?.(turn.transcript, isFinal);
      });

      this.transcriber.on("error", (error: Error) => {
        if (this.sessionId !== currentSessionId) return;
        console.error(`[Speech][${sessionShort}] StreamingTranscriber error:`, error.message);
        this.onError?.("Speech recognition encountered an error. Please try again.");
        this.onStateChange?.("error");
        this.cleanupAsync();
      });

      this.transcriber.on("close", (code: number, reason: string) => {
        if (this.sessionId !== currentSessionId) return;
        console.warn(`[Speech][${sessionShort}] WebSocket CLOSED — code: ${code}, reason: "${reason}"`);
        if (this.isActive) {
          this.onStateChange?.("idle");
          this.isActive = false;
        }
      });

      try {
        await this.transcriber.connect();
      } catch (connErr) {
        console.error(`[Speech][${sessionShort}] Failed to connect to AssemblyAI v3:`, connErr);
        this.onError?.("Could not connect to speech service. Check your internet connection.");
        this.onStateChange?.("error");
        await this.cleanupAsync();
        return;
      }

      if (this.sessionId !== currentSessionId) {
        await this.cleanupAsync();
        return;
      }

      // ── Step 4: Start raw PCM16 audio pipeline ─────────
      // AudioContext extracts Float32 samples directly from the mic.
      // We convert Float32 → Int16 and send raw PCM16 (16kHz, mono).
      // This is the ONLY encoding AssemblyAI v3 accepts by default.
      // MediaRecorder outputs WebM/Opus which the v3 API rejects.

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });

      const source = this.audioContext.createMediaStreamSource(this.micStream);

      // 4096 samples at 16kHz = ~256ms per chunk
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      let chunkCount = 0;
      this.processor.onaudioprocess = (e) => {
        if (this.sessionId !== currentSessionId || !this.transcriber) return;

        const inputData = e.inputBuffer.getChannelData(0); // Float32, 4096 samples
        const pcm16 = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        chunkCount++;
        if (chunkCount <= 5 || chunkCount % 20 === 0) {
          // Log first 5 chunks and every 20th after (production-safe, no secrets)
          console.log(`[Speech][${sessionShort}] Chunk #${chunkCount} → ${pcm16.byteLength} bytes PCM16`);
        }

        try {
          this.transcriber.sendAudio(pcm16.buffer);
        } catch {
          // WebSocket may have closed — ignore
        }
      };

      // GainNode with gain=0 prevents mic audio from playing through speakers.
      // processor MUST connect to destination for onaudioprocess to fire on Safari/Chrome.
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      source.connect(this.processor);
      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // ── Step 5: Auto-stop safety timer ────────────────
      this.timeoutId = setTimeout(() => {
        if (this.sessionId !== currentSessionId) return;
        console.log(`[Speech][${sessionShort}] Max recording duration reached`);
        this.stop();
      }, MAX_RECORDING_MS);

      console.log(`[Speech][${sessionShort}] Recording pipeline active — AudioContext sampleRate: ${this.audioContext.sampleRate}Hz`);

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
    console.log(`[Speech][${(this.sessionId || "").slice(0, 8)}] stop() called — allowing 800ms for final audio`);

    if (this.audioContext && this.audioContext.state !== "closed") {
      // Allow final PCM chunk to be processed and sent before cleanup
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
    const sessionShort = (this.sessionId || "").slice(0, 8);
    this.isActive = false;
    this.sessionId = null;

    // 1. Disconnect Web Audio nodes first (stop sending audio)
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

    // 2. Release microphone tracks
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    // 3. Close transcriber WebSocket last
    if (this.transcriber) {
      try {
        this.transcriber.close(false);
      } catch {
        // Already closed — fine
      }
      this.transcriber = null;
    }

    console.log(`[Speech][${sessionShort}] Session cleaned up`);
    this.onStateChange?.("idle");
  }
}
