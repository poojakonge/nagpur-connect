/* ════════════════════════════════════════════════════════
   AssemblyAI Speech Provider — Streaming v3

   AUDIO ARCHITECTURE:
   - getUserMedia (mono, any rate)
   - AudioContext at EXACTLY 16000Hz
   - audioContext.resume() immediately (prevents mobile suspension)
   - createMediaStreamSource() BEFORE async token fetch
     → Keeps the mic stream "live" during setup (some browsers stop
       the stream if nothing reads it for >1-2s)
   - ScriptProcessorNode → Float32→Int16 → sendAudio()
     with a guard flag: audio is only sent after WebSocket connects
   - If AudioContext cannot run at 16000Hz (browser refuses),
     we downsample before sending so AssemblyAI always receives 16kHz.
   - AssemblyAI always told sampleRate: 16000 (hardcoded, not inferred).

   TRANSCRIPT ARCHITECTURE (v3 Turn events):
   - includePartialTurns: true  → Turn fires on every word update
   - turn.end_of_turn: true     → this turn is complete; commit it
   - turn.turn_order            → tracks which turn we last committed
   - committedText              → all completed turns joined
   - currentTurnText            → the growing text of the active turn
   ════════════════════════════════════════════════════════ */

import { StreamingTranscriber } from "assemblyai/streaming";
import {
  type ClientSpeechProvider,
  type RecordingState,
  type SpeechProviderConfig,
} from "./types";

const MAX_RECORDING_MS = 60_000;
/** AssemblyAI v3 always expects 16kHz PCM — we always resample to this. */
const TARGET_SAMPLE_RATE = 16_000;

export class AssemblyAiProvider implements ClientSpeechProvider {
  readonly name = "assemblyai";
  private transcriber: StreamingTranscriber | null = null;

  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private micStream: MediaStream | null = null;
  private isActive = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Unique session ID — prevents stale callbacks from old sessions */
  sessionId: string | null = null;

  private committedText = "";
  private lastCommittedTurnOrder = -1;
  private currentTurnText = "";

  /** True when stop() is called by the user, so close handler doesn't double-emit */
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
      console.warn("[Speech] Already active, ignoring start");
      return;
    }
    if (!this.isSupported) {
      this.onError?.("Microphone not supported on this device.");
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
    const s = currentSessionId.slice(0, 8); // short ID for logs

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
            sampleRate: { ideal: TARGET_SAMPLE_RATE }, // Hint, not enforced
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
      // STEP 2 — AudioContext + MediaStreamSource (IMMEDIATELY)
      //
      // We wire the mic stream to an AudioContext RIGHT NOW, before
      // the async token fetch and WebSocket connect. This is critical:
      // some mobile browsers stop the audio track after ~1-2s if nothing
      // is actively reading from it. createMediaStreamSource() keeps it alive.
      //
      // We request 16kHz. If the browser refuses (native rate ≠ 16kHz),
      // we resample in onaudioprocess to always send correct 16kHz audio.
      // ══════════════════════════════════════════════════
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: TARGET_SAMPLE_RATE });
      const actualRate = this.audioContext.sampleRate;
      console.log(`[Speech][${s}] AudioContext sampleRate: ${actualRate}Hz (target: ${TARGET_SAMPLE_RATE}Hz)`);

      // Resume BEFORE anything else — mobile browsers create AudioContexts suspended
      if (this.audioContext.state === "suspended") {
        console.log(`[Speech][${s}] AudioContext suspended — resuming`);
        await this.audioContext.resume();
      }
      console.log(`[Speech][${s}] AudioContext state: "${this.audioContext.state}"`);

      // Monitor for mid-session suspension (battery saver, tab switch)
      this.audioContext.onstatechange = () => {
        const state = this.audioContext?.state;
        console.log(`[Speech][${s}] AudioContext → "${state}"`);
        if (state === "suspended" && this.isActive && this.sessionId === currentSessionId) {
          console.warn(`[Speech][${s}] AudioContext suspended mid-session — auto-resuming`);
          this.audioContext?.resume().catch(() => {});
        }
      };

      // Connect source to keep the mic track alive
      const source = this.audioContext.createMediaStreamSource(this.micStream);

      // Create the processor now but gate audio sending behind a flag.
      // Audio flows through immediately (keeping stream alive) but PCM is
      // only sent to AssemblyAI after the WebSocket is connected.
      let wsReady = false;
      let chunkCount = 0;
      // Resample ratio: if AudioContext is 44100Hz but we want 16000Hz, ratio = 2.75625
      const resampleRatio = actualRate / TARGET_SAMPLE_RATE;

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        // Gate: only send after WebSocket is connected
        if (!wsReady || this.sessionId !== currentSessionId || !this.transcriber) return;

        const input = e.inputBuffer.getChannelData(0); // Float32 at actualRate

        let pcm16: Int16Array;
        if (resampleRatio === 1) {
          // AudioContext already at 16kHz — direct conversion
          pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
        } else {
          // Resample to 16kHz via nearest-neighbour (fast, sufficient for ASR)
          const outLen = Math.floor(input.length / resampleRatio);
          pcm16 = new Int16Array(outLen);
          for (let i = 0; i < outLen; i++) {
            const srcIdx = Math.min(Math.round(i * resampleRatio), input.length - 1);
            const s = Math.max(-1, Math.min(1, input[srcIdx]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
        }

        chunkCount++;
        if (chunkCount <= 5 || chunkCount % 40 === 0) {
          console.log(`[Speech][${s}] Chunk #${chunkCount} → ${pcm16.byteLength}B @16kHz`);
        }

        try {
          this.transcriber.sendAudio(pcm16.buffer);
        } catch {
          /* WebSocket may have closed — ignore silently */
        }
      };

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0; // Silent — don't echo mic through speakers
      source.connect(this.processor);
      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      // Audio pipeline is now live — mic track will stay alive

      if (this.sessionId !== currentSessionId) {
        await this.cleanupAsync();
        return;
      }

      // ══════════════════════════════════════════════════
      // STEP 3 — Get v3 temporary token
      // (mic stream is kept alive by createMediaStreamSource above)
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
      // Always 16000Hz — regardless of what actualRate was.
      // We handle resampling in the ScriptProcessorNode above.
      // ══════════════════════════════════════════════════
      this.transcriber = new StreamingTranscriber({
        token,
        sampleRate: TARGET_SAMPLE_RATE, // ALWAYS 16000 — never pass native rate
        includePartialTurns: true,
        connectTimeout: 10_000,
        keyterms: [
          "Nagpur", "NMC", "pothole", "waterlogging", "garbage",
          "Wardha", "Dharampeth", "Hingna", "Kamptee",
        ],
      });

      // open fires on Begin frame
      this.transcriber.on("open", (beginEvent) => {
        if (this.sessionId !== currentSessionId) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`[Speech][${s}] OPEN — session_id: ${(beginEvent as any)?.session_id}`);
        // Unlock audio sending NOW that WebSocket is connected
        wsReady = true;
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

        // Unexpected close (not from user pressing Stop) — flush partial as final
        if (this.isActive && !this.isStopping) {
          const saved = this.committedText || this.currentTurnText
            ? [this.committedText, this.currentTurnText].filter(Boolean).join(" ").trim()
            : "";
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
        // wsReady = true is set in the 'open' handler above
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
    const saved = this.committedText || this.currentTurnText
      ? [this.committedText, this.currentTurnText].filter(Boolean).join(" ").trim()
      : "";
    if (saved) {
      console.log(`[Speech][${(this.sessionId || "").slice(0, 8)}] stop() — saving: "${saved.slice(0, 60)}"`);
      this.onResult?.(saved, true);
    }

    // Brief delay so the final PCM chunk can reach AssemblyAI
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
    const id = (this.sessionId || "").slice(0, 8);
    this.isActive = false;
    this.isStopping = false;
    this.sessionId = null;
    this.committedText = "";
    this.lastCommittedTurnOrder = -1;
    this.currentTurnText = "";

    if (this.audioContext) this.audioContext.onstatechange = null;

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
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.transcriber) {
      try { this.transcriber.close(false); } catch { /* ignore */ }
      this.transcriber = null;
    }

    console.log(`[Speech][${id}] CLEANED UP`);
    this.onStateChange?.("idle");
  }
}
