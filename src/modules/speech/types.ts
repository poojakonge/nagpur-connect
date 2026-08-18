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

    const currentSessionId = this.sessionId;
    const lang = config?.language || "en-IN";

    const initRecognition = () => {
      if (!this.isRecording || this.sessionId !== currentSessionId) return;

      const rec = new SpeechRec();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        if (this.sessionId !== currentSessionId) return;
        this.onStateChange?.("recording");
      };

      rec.onresult = (event: any) => {
        if (this.sessionId !== currentSessionId) return;

        let latestInterim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || "";

          if (result.isFinal) {
            if (i <= this.lastCommittedFinalIndex) continue;

            const trimmed = transcript.trim();
            if (trimmed && trimmed === this.lastFinalText) continue;

            this.lastCommittedFinalIndex = i;
            this.lastFinalText = trimmed;

            if (trimmed) {
              this.onResult?.(trimmed, true);
            }
          } else {
            latestInterim = transcript;
          }
        }

        if (latestInterim) {
          this.onResult?.(latestInterim, false);
        }
      };

      rec.onerror = (event: any) => {
        if (this.sessionId !== currentSessionId) return;

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.isRecording = false;
          this.onStateChange?.("permission_denied");
          this.onError?.("Microphone permission denied. Please allow microphone access.");
        } else if (event.error === "no-speech") {
          // Normal pause during speaking — do not stop or treat as fatal error
        } else if (event.error === "aborted" || event.error === "network") {
          // Intentional abort or transient network retry
        } else {
          console.warn("[Speech] Web Speech API notice:", event.error);
        }
      };

      rec.onend = () => {
        if (this.sessionId !== currentSessionId) return;

        // If user is still actively recording, restart smoothly after a short delay (100ms)
        // to prevent Chrome InvalidStateError
        if (this.isRecording) {
          setTimeout(() => {
            if (this.isRecording && this.sessionId === currentSessionId) {
              try {
                this.recognition = initRecognition();
              } catch (err) {
                console.warn("[Speech] Restart failed:", err);
              }
            }
          }, 100);
          return;
        }

        this.onStateChange?.("idle");
      };

      try {
        rec.start();
      } catch (err) {
        console.warn("[Speech] rec.start error:", err);
      }

      return rec;
    };

    this.recognition = initRecognition();
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
