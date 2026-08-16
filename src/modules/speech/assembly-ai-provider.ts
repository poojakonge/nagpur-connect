/* ════════════════════════════════════════════════════════
   AssemblyAI Speech Provider — Streaming v3 + MediaRecorder

   ROOT CAUSE OF PREVIOUS BUG:
   ScriptProcessorNode is DEPRECATED. Desktop Chrome still runs it
   indefinitely, but Android Chrome throttles/stops onaudioprocess
   after ~1-2 seconds (power savings). This caused the stream to
   cut off on all mobile devices while working perfectly on desktop.

   FIX:
   Use MediaRecorder with WebM/Opus encoding instead of AudioContext
   + ScriptProcessorNode. MediaRecorder:
   ✅ Not deprecated — actively maintained
   ✅ Runs on a separate audio thread (not throttled on mobile)
   ✅ Fires ondataavailable reliably with timeslice parameter
   ✅ Outputs Opus natively (no sample rate conversion needed)

   AssemblyAI v3 supports encoding: "opus" (self-describing,
   no sampleRate parameter needed — the format carries its own rate).

   AUDIO PIPELINE:
   getUserMedia (mono)
     → MediaRecorder (audio/webm;codecs=opus, timeslice=250ms)
     → ondataavailable (every 250ms)
     → Blob → ArrayBuffer → transcriber.sendAudio()
     → AssemblyAI wss://streaming.assemblyai.com/v3/ws (encoding=opus)

   TRANSCRIPT ARCHITECTURE (v3 Turn events):
   - includePartialTurns: true → Turn fires on every word update
   - turn.end_of_turn: true   → commit this turn
   - turn.turn_order          → prevents double-commit
   - committedText            → all completed turns joined
   - currentTurnText          → growing text of active turn
   ════════════════════════════════════════════════════════ */

import { StreamingTranscriber } from "assemblyai/streaming";
import {
  type ClientSpeechProvider,
  type RecordingState,
  type SpeechProviderConfig,
} from "./types";

const MAX_RECORDING_MS = 60_000;
/** Interval at which MediaRecorder fires ondataavailable (ms) */
const TIMESLICE_MS = 250;

export class AssemblyAiProvider implements ClientSpeechProvider {
  readonly name = "assemblyai";
  private transcriber: StreamingTranscriber | null = null;

  private micStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private isActive = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  sessionId: string | null = null;

  private committedText = "";
  private lastCommittedTurnOrder = -1;
  private currentTurnText = "";
  private isStopping = false;

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
      console.warn("[Speech] Already active, ignoring start");
      return;
    }
    if (!this.isSupported) {
      this.onError?.("Microphone or MediaRecorder not supported on this device.");
      return;
    }

    await this.cleanupAsync();

    this.isActive = true;
    this.isStopping = false;
    this.sessionId = crypto.randomUUID();
    this.committedText = "";
    this.lastCommittedTurnOrder = -1;
    this.currentTurnText = "";
    const currentSessionId = this.sessionId;
    const s = currentSessionId.slice(0, 8);

    console.log(`[Speech][${s}] START`);
    this.onStateChange?.("processing");

    try {
      // ══════════════════════════════════════════════════
      // STEP 1 — Microphone
      // ══════════════════════════════════════════════════
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (permErr: unknown) {
        const name = permErr instanceof Error ? permErr.name : String(permErr);
        console.error(`[Speech][${s}] Mic error: ${name}`);
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          this.onStateChange?.("permission_denied");
          this.onError?.("Microphone permission denied. Please allow access in your browser settings.");
        } else if (name === "NotFoundError") {
          this.onStateChange?.("error");
          this.onError?.("No microphone found.");
        } else if (name === "NotReadableError") {
          this.onStateChange?.("error");
          this.onError?.("Microphone is in use by another app.");
        } else {
          this.onStateChange?.("error");
          this.onError?.(`Microphone error: ${name}`);
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

      const track = stream.getAudioTracks()[0];
      console.log(`[Speech][${s}] Mic OK — readyState: ${track?.readyState}`);

      // ══════════════════════════════════════════════════
      // STEP 2 — Start MediaRecorder IMMEDIATELY
      //
      // MediaRecorder keeps the mic stream alive and runs on
      // a separate audio thread that is NOT throttled on Android.
      // We start recording NOW (before token fetch and WebSocket)
      // to prevent the browser from stopping the mic track.
      //
      // Audio data is buffered until wsReady=true, then sent.
      // ══════════════════════════════════════════════════
      const mimeType = this.selectMimeType();
      console.log(`[Speech][${s}] MediaRecorder mimeType: ${mimeType}`);

      this.recorder = new MediaRecorder(stream, { mimeType });
      let wsReady = false;
      let chunkCount = 0;
      // Buffer chunks until WebSocket is ready
      const pendingChunks: ArrayBuffer[] = [];

      this.recorder.ondataavailable = async (event) => {
        if (this.sessionId !== currentSessionId || !event.data.size) return;

        chunkCount++;
        const buffer = await event.data.arrayBuffer();

        if (chunkCount <= 5 || chunkCount % 20 === 0) {
          console.log(`[Speech][${s}] Chunk #${chunkCount} → ${buffer.byteLength}B (wsReady: ${wsReady})`);
        }

        if (wsReady && this.transcriber) {
          // Send any buffered chunks first
          while (pendingChunks.length > 0) {
            const pending = pendingChunks.shift()!;
            try { this.transcriber.sendAudio(pending); } catch { /* ws closed */ }
          }
          // Then send the current chunk
          try {
            this.transcriber.sendAudio(buffer);
          } catch {
            /* WebSocket may have closed — ignore */
          }
        } else {
          // Buffer until WebSocket is ready
          pendingChunks.push(buffer);
        }
      };

      this.recorder.onerror = (event) => {
        console.error(`[Speech][${s}] MediaRecorder error:`, event);
        this.onError?.("Audio recording error. Please try again.");
        this.onStateChange?.("error");
        this.cleanupAsync();
      };

      this.recorder.onstop = () => {
        console.log(`[Speech][${s}] MediaRecorder stopped`);
      };

      // Start recording with timeslice — fires ondataavailable every 250ms
      this.recorder.start(TIMESLICE_MS);
      console.log(`[Speech][${s}] MediaRecorder STARTED (timeslice: ${TIMESLICE_MS}ms)`);

      // ══════════════════════════════════════════════════
      // STEP 3 — Get v3 temporary token
      // (MediaRecorder keeps the mic alive during this async call)
      // ══════════════════════════════════════════════════
      let token: string;
      try {
        const res = await fetch("/api/speech/token", {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Token HTTP ${res.status}`);
        }
        const data = await res.json();
        token = data.token;
        if (!token) throw new Error("Empty token");
        console.log(`[Speech][${s}] v3 token OK`);
      } catch (tokenErr) {
        console.error(`[Speech][${s}] Token error:`, tokenErr);
        this.onError?.(
          tokenErr instanceof Error && tokenErr.name === "TimeoutError"
            ? "Speech service timed out."
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

      // ══════════════════════════════════════════════════
      // STEP 4 — Create StreamingTranscriber (v3)
      //
      // encoding: "opus" → AssemblyAI reads the sample rate
      // and codec info from the WebM/Opus container headers.
      // No sampleRate parameter needed.
      // ══════════════════════════════════════════════════
      this.transcriber = new StreamingTranscriber({
        token,
        encoding: "opus",
        // sampleRate omitted — opus is self-describing
        includePartialTurns: true,
        connectTimeout: 10_000,
        keyterms: [
          "Nagpur", "NMC", "pothole", "waterlogging", "garbage",
          "Wardha", "Dharampeth", "Hingna", "Kamptee",
        ],
      });

      // 'open' fires when server sends the Begin frame
      this.transcriber.on("open", (beginEvent) => {
        if (this.sessionId !== currentSessionId) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`[Speech][${s}] OPEN — session_id: ${(beginEvent as any)?.session_id}`);
        // NOW unlock audio sending — flush any buffered chunks
        wsReady = true;
        if (this.transcriber && pendingChunks.length > 0) {
          console.log(`[Speech][${s}] Flushing ${pendingChunks.length} buffered chunks`);
          while (pendingChunks.length > 0) {
            const pending = pendingChunks.shift()!;
            try { this.transcriber.sendAudio(pending); } catch { break; }
          }
        }
        this.onStateChange?.("recording");
      });

      // v3 Turn: full text of the current turn on every update
      this.transcriber.on("turn", (turn) => {
        if (this.sessionId !== currentSessionId) return;
        if (!turn.transcript) return;

        const { turn_order, end_of_turn, transcript } = turn;

        if (end_of_turn) {
          if (turn_order !== this.lastCommittedTurnOrder) {
            this.committedText = this.committedText
              ? `${this.committedText} ${transcript.trim()}`
              : transcript.trim();
            this.lastCommittedTurnOrder = turn_order;
            this.currentTurnText = "";
            console.log(`[Speech][${s}] Turn #${turn_order} committed: "${transcript.slice(0, 60)}"`);
            this.onResult?.(this.committedText, true);
          }
        } else {
          this.currentTurnText = transcript.trim();
          const display = this.committedText
            ? `${this.committedText} ${this.currentTurnText}`
            : this.currentTurnText;
          this.onResult?.(display, false);
        }
      });

      this.transcriber.on("error", (error: Error) => {
        if (this.sessionId !== currentSessionId) return;
        console.error(`[Speech][${s}] Error:`, error.message);
        this.onError?.("Speech recognition error. Please try again.");
        this.onStateChange?.("error");
        this.cleanupAsync();
      });

      this.transcriber.on("close", (code: number, reason: string) => {
        if (this.sessionId !== currentSessionId) return;
        console.warn(`[Speech][${s}] CLOSED — code: ${code}, reason: "${reason}"`);

        // Unexpected close — flush partial as final
        if (this.isActive && !this.isStopping) {
          const saved = [this.committedText, this.currentTurnText]
            .filter(Boolean).join(" ").trim();
          if (saved) {
            console.log(`[Speech][${s}] Unexpected close — saving: "${saved.slice(0, 60)}"`);
            this.onResult?.(saved, true);
          }
          this.onStateChange?.("idle");
          this.isActive = false;
        }
      });

      // ══════════════════════════════════════════════════
      // STEP 5 — Connect WebSocket
      // ══════════════════════════════════════════════════
      try {
        await this.transcriber.connect();
        // wsReady = true is set in the 'open' handler
      } catch (connErr) {
        console.error(`[Speech][${s}] Connect failed:`, connErr);
        this.onError?.("Could not connect to speech service.");
        this.onStateChange?.("error");
        await this.cleanupAsync();
        return;
      }

      if (this.sessionId !== currentSessionId) {
        await this.cleanupAsync();
        return;
      }

      // ══════════════════════════════════════════════════
      // STEP 6 — Safety timeout
      // ══════════════════════════════════════════════════
      this.timeoutId = setTimeout(() => {
        if (this.sessionId !== currentSessionId) return;
        console.log(`[Speech][${s}] Max duration reached`);
        this.stop();
      }, MAX_RECORDING_MS);

      console.log(`[Speech][${s}] RECORDING ACTIVE`);

    } catch (err) {
      console.error("[Speech] Unexpected error:", err);
      this.onError?.(err instanceof Error ? err.message : "Failed to start");
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

    this.isStopping = true;

    // Flush any partial transcript so user's speech is never lost
    const saved = [this.committedText, this.currentTurnText]
      .filter(Boolean).join(" ").trim();
    if (saved) {
      console.log(`[Speech][${(this.sessionId || "").slice(0, 8)}] stop() — saving: "${saved.slice(0, 60)}"`);
      this.onResult?.(saved, true);
    }

    // Stop MediaRecorder first (triggers final ondataavailable), then cleanup
    if (this.recorder && this.recorder.state !== "inactive") {
      try { this.recorder.stop(); } catch { /* ignore */ }
    }

    // Brief delay for final audio chunk to reach AssemblyAI
    setTimeout(() => this.cleanupAsync(), 500);
  }

  abort(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.cleanupAsync();
  }

  /**
   * Select the best supported MIME type for MediaRecorder.
   * Prefer WebM/Opus (Chrome/Android/Edge) > OGG/Opus (Firefox) > default.
   */
  private selectMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return ""; // Let browser decide
  }

  private async cleanupAsync(): Promise<void> {
    const id = (this.sessionId || "").slice(0, 8);
    this.isActive = false;
    this.isStopping = false;
    this.sessionId = null;
    this.committedText = "";
    this.lastCommittedTurnOrder = -1;
    this.currentTurnText = "";

    // 1. Stop MediaRecorder
    if (this.recorder) {
      if (this.recorder.state !== "inactive") {
        try { this.recorder.stop(); } catch { /* ignore */ }
      }
      this.recorder = null;
    }

    // 2. Release microphone tracks
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    // 3. Close WebSocket last
    if (this.transcriber) {
      try { this.transcriber.close(false); } catch { /* ignore */ }
      this.transcriber = null;
    }

    console.log(`[Speech][${id}] CLEANED UP`);
    this.onStateChange?.("idle");
  }
}
