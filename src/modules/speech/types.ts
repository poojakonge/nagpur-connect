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

  /** Accumulated final text from previous recognition instances in this session */
  private sessionHistoryText = "";
  /** Final text from the currently active recognition instance */
  private currentInstanceFinalText = "";

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

    // Reset session state
    this.sessionHistoryText = "";
    this.currentInstanceFinalText = "";
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

        let instanceFinal = "";
        let instanceInterim = "";

        // Iterate through all results in the current recognition buffer
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = (res[0]?.transcript || "").trim();
          if (!text) continue;

          if (res.isFinal) {
            instanceFinal = instanceFinal ? `${instanceFinal} ${text}` : text;
          } else {
            instanceInterim = instanceInterim ? `${instanceInterim} ${text}` : text;
          }
        }

        this.currentInstanceFinalText = instanceFinal;

        const totalFinal = [this.sessionHistoryText, instanceFinal].filter(Boolean).join(" ").trim();
        const totalDisplay = [totalFinal, instanceInterim].filter(Boolean).join(" ").trim();

        if (instanceInterim) {
          // Send live progressive preview
          this.onResult?.(totalDisplay, false);
        } else if (instanceFinal) {
          // Commit clean final sentence
          this.onResult?.(totalFinal, true);
        }
      };

      rec.onerror = (event: any) => {
        if (this.sessionId !== currentSessionId) return;

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.isRecording = false;
          this.onStateChange?.("permission_denied");
          this.onError?.("Microphone permission denied. Please allow microphone access.");
        } else if (event.error === "no-speech") {
          // Normal pause during speaking — do not stop
        } else if (event.error === "aborted" || event.error === "network") {
          // Intentional abort or transient network retry
        } else {
          console.warn("[Speech] Web Speech API notice:", event.error);
        }
      };

      rec.onend = () => {
        if (this.sessionId !== currentSessionId) return;

        // Save finalized text from this instance into session history
        if (this.currentInstanceFinalText) {
          this.sessionHistoryText = [this.sessionHistoryText, this.currentInstanceFinalText].filter(Boolean).join(" ").trim();
          this.currentInstanceFinalText = "";
        }

        // Auto-restart across pauses if user is still recording
        if (this.isRecording) {
          setTimeout(() => {
            if (this.isRecording && this.sessionId === currentSessionId) {
              try {
                this.recognition = initRecognition();
              } catch (err) {
                console.warn("[Speech] Restart failed:", err);
              }
            }
          }, 80);
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
    this.sessionHistoryText = "";
    this.currentInstanceFinalText = "";

    if (rec) {
      try { rec.abort(); } catch { /* ignore */ }
    }
    this.onStateChange?.("idle");
  }
}
