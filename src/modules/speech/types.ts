/* ════════════════════════════════════════════════════════
   Speech Provider Types
   Provider-agnostic speech-to-text abstraction
   ════════════════════════════════════════════════════════ */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RecordingState =
  | "idle"
  | "recording"
  | "processing"
  | "error"
  | "permission_denied";

export interface SpeechProviderConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

/** Client-side speech provider interface */
export interface ClientSpeechProvider {
  readonly name: string;
  readonly isSupported: boolean;

  /** Unique ID for the current recording session */
  sessionId: string | null;

  start(config?: SpeechProviderConfig): void;
  stop(): void;
  abort(): void;

  onResult: ((transcript: string, isFinal: boolean) => void) | null;
  onError: ((error: string) => void) | null;
  onStateChange: ((state: RecordingState) => void) | null;
}

// Web Speech API type declarations (not in all TS libs)
type SpeechRecognitionType = any;

/** Browser Web Speech API provider — works offline, no API key needed */
export class BrowserSpeechProvider implements ClientSpeechProvider {
  readonly name = "browser";
  private recognition: SpeechRecognitionType | null = null;
  private isRecording = false;

  /**
   * Track the highest result index we've already committed as final.
   * This prevents the Web Speech API from re-delivering old finals
   * when continuous mode fires onresult with cumulative results.
   */
  private lastCommittedFinalIndex = -1;

  /** Track last final text to deduplicate identical consecutive finals */
  private lastFinalText = "";

  sessionId: string | null = null;

  onResult: ((transcript: string, isFinal: boolean) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onStateChange: ((state: RecordingState) => void) | null = null;

  get isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  start(config?: SpeechProviderConfig): void {
    if (!this.isSupported) {
      this.onError?.("Speech recognition is not supported in this browser");
      return;
    }

    // Prevent duplicate sessions — clean up previous
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }

    // Reset dedup state for new session
    this.lastCommittedFinalIndex = -1;
    this.lastFinalText = "";
    this.sessionId = crypto.randomUUID();
    this.isRecording = true;

    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    this.recognition = new SpeechRec();
    this.recognition.lang = config?.language || "en-IN";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    const currentSessionId = this.sessionId;

    this.recognition.onstart = () => {
      if (this.sessionId !== currentSessionId) return;
      this.onStateChange?.("recording");
    };

    this.recognition.onresult = (event: any) => {
      // Guard: ignore results from stale sessions
      if (this.sessionId !== currentSessionId) return;

      let latestInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          // Skip if we already committed this result index
          if (i <= this.lastCommittedFinalIndex) continue;

          // Skip identical consecutive finals (dedup)
          const trimmed = transcript.trim();
          if (trimmed && trimmed === this.lastFinalText) continue;

          this.lastCommittedFinalIndex = i;
          this.lastFinalText = trimmed;

          if (trimmed) {
            this.onResult?.(trimmed, true);
          }
        } else {
          // For interim results, only use the LATEST one
          latestInterim = transcript;
        }
      }

      // Emit the latest interim (replaces previous interim in UI)
      if (latestInterim) {
        this.onResult?.(latestInterim, false);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (this.sessionId !== currentSessionId) return;

      if (event.error === "not-allowed") {
        this.isRecording = false;
        this.onStateChange?.("permission_denied");
        this.onError?.("Microphone permission denied");
      } else if (event.error === "no-speech") {
        // no-speech is normal during pauses, don't treat as error
      } else if (event.error === "aborted") {
        // Intentional abort
      } else {
        this.onStateChange?.("error");
        this.onError?.(event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.sessionId !== currentSessionId) return;

      // If user is still recording and browser auto-paused after a 1s silence, restart seamlessly
      if (this.isRecording) {
        try {
          this.recognition?.start();
          return;
        } catch {
          // If restart fails, fallback to idle
        }
      }
      this.onStateChange?.("idle");
    };

    try {
      this.recognition.start();
    } catch (err) {
      console.warn("[Speech] recognition.start error:", err);
    }
  }

  stop(): void {
    this.isRecording = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch { /* ignore */ }
    }
    this.onStateChange?.("idle");
  }

  abort(): void {
    this.isRecording = false;
    const rec = this.recognition;
    this.recognition = null;
    this.sessionId = null;
    this.lastCommittedFinalIndex = -1;
    this.lastFinalText = "";

    if (rec) {
      try { rec.abort(); } catch { /* ignore */ }
    }
    this.onStateChange?.("idle");
  }
}
