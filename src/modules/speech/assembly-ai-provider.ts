/* ════════════════════════════════════════════════════════
   AssemblyAI Speech Provider — Streaming v3

   CRITICAL ARCHITECTURE NOTE:
   In AssemblyAI Streaming v3 with includePartialTurns: true,
   each Turn event contains the FULL transcript of the current turn
   (not just the new words). The same turn_order fires multiple times:

   turn_order=1, end_of_turn=false: "Teri"
   turn_order=1, end_of_turn=false: "Teri Nazron"
   turn_order=1, end_of_turn=false: "Teri Nazron Ne"
   turn_order=1, end_of_turn=true:  "Teri Nazron Ne."   ← COMMITTED

   turn_order=2, end_of_turn=false: "Mujhe"
   turn_order=2, end_of_turn=true:  "Mujhe Bata Diya."  ← COMMITTED

   So:
   - We track which turn_order we last COMMITTED.
   - On each Turn event: use the full transcript as the current turn's text.
   - Only when end_of_turn=true: mark that turn as committed.
   - The interim display = committed text + current turn text.
   - The final emitted transcript is committed text only.

   AUDIO PIPELINE:
   getUserMedia (mono)
     → AudioContext (native sample rate — read AFTER creation)
     → ScriptProcessorNode (4096 samples)
     → Float32 → Int16 conversion
     → transcriber.sendAudio(Int16.buffer)   [distinct, non-cumulative]
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

  /**
   * Transcript state across turns.
   * committedText: text from all COMPLETED (end_of_turn=true) turns joined.
   * lastCommittedTurnOrder: the turn_order of the last committed turn.
   * currentTurnText: the growing text of the CURRENT (in-progress) turn.
   */
  private committedText = "";
  private lastCommittedTurnOrder = -1;
  private currentTurnText = "";

  /**
   * Set to true when stop() is called intentionally (user pressed Stop).
   * Prevents the close handler from double-emitting the partial transcript.
   */
  private isStopping = false;

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

    // Full cleanup of any lingering session
    await this.cleanupAsync();

    this.isActive = true;
    this.sessionId = crypto.randomUUID();
    this.committedText = "";
    this.lastCommittedTurnOrder = -1;
    this.currentTurnText = "";
    const currentSessionId = this.sessionId;
    const sessionShort = currentSessionId.slice(0, 8);

    console.log(`[Speech][${sessionShort}] Session START`);

    try {
      this.onStateChange?.("processing");

      // ── Step 1: Microphone ─────────────────────────────
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
        const errName = permErr instanceof Error ? permErr.name : String(permErr);
        console.error(`[Speech][${sessionShort}] Mic error: ${errName}`);
        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          this.onStateChange?.("permission_denied");
          this.onError?.("Microphone permission denied. Please allow access in your browser settings.");
        } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          this.onStateChange?.("error");
          this.onError?.("No microphone found on this device.");
        } else if (errName === "NotReadableError") {
          this.onStateChange?.("error");
          this.onError?.("Microphone is in use by another app.");
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

      const track = stream.getAudioTracks()[0];
      console.log(`[Speech][${sessionShort}] Mic OK — readyState: ${track?.readyState}`);

      // ── Step 2: AudioContext — detect ACTUAL sample rate ──
      // We MUST read the real sample rate BEFORE creating StreamingTranscriber,
      // because on Android/iOS the browser may not honour sampleRate: 16000.
      // Sending audio at 48000Hz while telling AssemblyAI 16000Hz causes it
      // to interpret audio 3x faster → garbled / premature cutoff.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      // Request 16000Hz. The browser may honour it or use its native rate.
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      const actualSampleRate = this.audioContext.sampleRate;

      // CRITICAL: Mobile browsers (Android Chrome, iOS Safari) often create
      // AudioContexts in a SUSPENDED state due to autoplay policies.
      // If suspended, onaudioprocess fires for a brief moment then stops,
      // causing AssemblyAI to receive 1-2s of audio then silence → session close.
      // We must explicitly resume before starting audio capture.
      if (this.audioContext.state === "suspended") {
        console.log(`[Speech][${sessionShort}] AudioContext suspended on creation — resuming...`);
        await this.audioContext.resume();
      }
      console.log(`[Speech][${sessionShort}] AudioContext state: "${this.audioContext.state}", sampleRate: ${actualSampleRate}Hz`);

      // Monitor for future suspensions (battery saver, tab switch, etc.)
      this.audioContext.onstatechange = () => {
        const state = this.audioContext?.state;
        console.log(`[Speech][${sessionShort}] AudioContext state → "${state}"`);
        if (state === "suspended" && this.isActive && this.sessionId === currentSessionId) {
          console.warn(`[Speech][${sessionShort}] AudioContext suspended mid-session — attempting auto-resume`);
          this.audioContext?.resume().catch(() => {});
        }
      };

      // ── Step 3: Get v3 temporary token ────────────────────
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
        console.log(`[Speech][${sessionShort}] v3 token OK`);
      } catch (tokenErr) {
        console.error(`[Speech][${sessionShort}] Token error:`, tokenErr);
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

      // ── Step 4: Create StreamingTranscriber (v3) ──────────
      // sampleRate = what the AudioContext ACTUALLY uses (not assumed 16000)
      // connectTimeout = 10s to accommodate slow mobile connections
      // includePartialTurns = true for live transcript display
      // formatTurns = false (we handle text ourselves)
      this.transcriber = new StreamingTranscriber({
        token,
        sampleRate: actualSampleRate,
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
        console.log(`[Speech][${sessionShort}] OPEN — session_id: ${(beginEvent as any)?.session_id}`);
        this.onStateChange?.("recording");
      });

      /**
       * v3 Turn event — THE CRITICAL HANDLER.
       *
       * With includePartialTurns: true, AssemblyAI fires Turn events continuously
       * as the user speaks. For a single utterance "Teri Nazron Ne":
       *
       *   { turn_order: 1, end_of_turn: false, transcript: "teri" }
       *   { turn_order: 1, end_of_turn: false, transcript: "teri nazron" }
       *   { turn_order: 1, end_of_turn: false, transcript: "teri nazron ne" }
       *   { turn_order: 1, end_of_turn: true,  transcript: "Teri Nazron Ne." }
       *
       * The transcript field always contains THE FULL TEXT OF THE CURRENT TURN.
       * We must NOT treat each event as a separate segment to append!
       * We track turn_order to know when we move to a new turn.
       *
       * Old code was using turn_is_formatted as the commit signal,
       * which caused "Teri Teri Nazron Teri Nazron Ne" duplication.
       */
      this.transcriber.on("turn", (turn) => {
        if (this.sessionId !== currentSessionId) return;
        if (!turn.transcript) return;

        const { turn_order, end_of_turn, transcript } = turn;

        if (end_of_turn) {
          // This turn is COMPLETE. Commit its text once.
          if (turn_order !== this.lastCommittedTurnOrder) {
            // Append this turn to committed text
            this.committedText = this.committedText
              ? `${this.committedText} ${transcript.trim()}`
              : transcript.trim();
            this.lastCommittedTurnOrder = turn_order;
            this.currentTurnText = "";

            console.log(`[Speech][${sessionShort}] Turn #${turn_order} COMMITTED: "${transcript.slice(0, 60)}"`);
            // Emit the full correct transcript as final
            this.onResult?.(this.committedText, true);
          }
        } else {
          // Partial update for the current turn.
          // Replace currentTurnText (don't append!).
          this.currentTurnText = transcript.trim();

          // For display: show committed text + current partial
          const displayText = this.committedText
            ? `${this.committedText} ${this.currentTurnText}`
            : this.currentTurnText;

          this.onResult?.(displayText, false);
        }
      });

      this.transcriber.on("error", (error: Error) => {
        if (this.sessionId !== currentSessionId) return;
        console.error(`[Speech][${sessionShort}] Error:`, error.message);
        this.onError?.("Speech recognition encountered an error. Please try again.");
        this.onStateChange?.("error");
        this.cleanupAsync();
      });

      this.transcriber.on("close", (code: number, reason: string) => {
        if (this.sessionId !== currentSessionId) return;
        console.warn(`[Speech][${sessionShort}] CLOSED — code: ${code}, reason: "${reason}"`);

        // If the close was NOT triggered by the user pressing Stop,
        // this is an unexpected disconnect. Flush any uncommitted transcript
        // as a final so the user's speech is never silently lost.
        if (this.isActive && !this.isStopping) {
          const anyText = this.committedText || this.currentTurnText
            ? (this.committedText
              ? (this.currentTurnText
                ? `${this.committedText} ${this.currentTurnText}`
                : this.committedText)
              : this.currentTurnText)
            : "";
          if (anyText.trim()) {
            console.log(`[Speech][${sessionShort}] Unexpected close — flushing partial as final: "${anyText.slice(0, 60)}"`);
            this.onResult?.(anyText.trim(), true);
          }
          this.onStateChange?.("idle");
          this.isActive = false;
        }
      });

      try {
        await this.transcriber.connect();
      } catch (connErr) {
        console.error(`[Speech][${sessionShort}] Connect failed:`, connErr);
        this.onError?.("Could not connect to speech service. Check your internet connection.");
        this.onStateChange?.("error");
        await this.cleanupAsync();
        return;
      }

      if (this.sessionId !== currentSessionId) {
        await this.cleanupAsync();
        return;
      }

      // ── Step 5: Wire AudioContext → ScriptProcessor → sendAudio ──
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      // 4096 samples = ~256ms at 16kHz, ~93ms at 44100Hz (still acceptable)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      let chunkCount = 0;
      this.processor.onaudioprocess = (e) => {
        if (this.sessionId !== currentSessionId || !this.transcriber) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        chunkCount++;
        if (chunkCount <= 5 || chunkCount % 40 === 0) {
          console.log(`[Speech][${sessionShort}] Chunk #${chunkCount} → ${pcm16.byteLength}B`);
        }

        try {
          this.transcriber.sendAudio(pcm16.buffer);
        } catch {
          // WebSocket may have closed — ignore
        }
      };

      // GainNode at 0 prevents mic echo; processor must connect to destination
      // for onaudioprocess to fire reliably on Android Chrome / iOS Safari.
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      source.connect(this.processor);
      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // ── Step 6: Safety timeout ─────────────────────────────
      this.timeoutId = setTimeout(() => {
        if (this.sessionId !== currentSessionId) return;
        console.log(`[Speech][${sessionShort}] Max recording time reached`);
        this.stop();
      }, MAX_RECORDING_MS);

      console.log(`[Speech][${sessionShort}] Recording ACTIVE — sampleRate: ${actualSampleRate}Hz`);

    } catch (err) {
      console.error("[Speech] Unexpected error:", err);
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

    // Mark as intentional stop so the close handler doesn't double-emit partial
    this.isStopping = true;

    // Flush any in-progress partial turn as a final before cleanup.
    // This ensures the user's last words are always captured even if
    // AssemblyAI hasn't sent end_of_turn=true yet.
    const partialText = this.committedText || this.currentTurnText
      ? (this.committedText
        ? (this.currentTurnText
          ? `${this.committedText} ${this.currentTurnText}`
          : this.committedText)
        : this.currentTurnText)
      : "";

    if (partialText.trim()) {
      console.log(`[Speech][${(this.sessionId || "").slice(0, 8)}] stop() — flushing: "${partialText.slice(0, 60)}"`);
      this.onResult?.(partialText.trim(), true);
    }

    // Give 800ms for the final PCM chunk to be sent before closing
    setTimeout(() => this.cleanupAsync(), 800);
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
    this.isStopping = false;
    this.sessionId = null;
    this.committedText = "";
    this.lastCommittedTurnOrder = -1;
    this.currentTurnText = "";

    // 1. Disconnect Web Audio nodes (stops audio flow to AssemblyAI)
    if (this.audioContext) {
      this.audioContext.onstatechange = null; // Remove listener before closing
    }
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
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    // 3. Close WebSocket last
    if (this.transcriber) {
      try { this.transcriber.close(false); } catch { /* already closed */ }
      this.transcriber = null;
    }

    console.log(`[Speech][${sessionShort}] Session CLEANED UP`);
    this.onStateChange?.("idle");
  }
}
