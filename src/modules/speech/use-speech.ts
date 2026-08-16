/* ════════════════════════════════════════════════════════
   useSpeech — React hook for voice input
   Primary: AssemblyAI (if token available)
   Fallback: Browser Web Speech API
   
   Key design decisions:
   - useRef for committed segments to prevent stale closure issues
   - Session ID prevents cross-session pollution
   - Transcript built from committed segments array (not string concat)
   - Partial transcripts are display-only, never committed
   - Each startRecording() creates a clean session
   - NEVER auto-submits to AI
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  BrowserSpeechProvider,
  type ClientSpeechProvider,
  type RecordingState,
} from "./types";

interface UseSpeechReturn {
  state: RecordingState;
  isRecording: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  providerName: string;
  permissionDenied: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export function useSpeech(language = "en-IN"): UseSpeechReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("browser");

  const providerRef = useRef<ClientSpeechProvider | null>(null);
  const initRef = useRef(false);

  /**
   * Committed transcript segments — array of final strings.
   * Using a ref prevents stale closures in onResult callbacks.
   * The transcript state is derived from joining these segments.
   */
  const committedSegmentsRef = useRef<string[]>([]);

  /**
   * Session ID ref — matches the provider's sessionId.
   * Used to ignore late-arriving callbacks from previous sessions.
   */
  const sessionIdRef = useRef<string | null>(null);

  const wireCallbacks = useCallback((provider: ClientSpeechProvider) => {
    provider.onResult = (text: string, isFinal: boolean) => {
      // Guard: ignore results from stale sessions
      if (provider.sessionId !== sessionIdRef.current) return;

      if (isFinal) {
        const trimmed = text.trim();
        if (!trimmed) return;

        // Deduplicate: check last committed segment
        const segments = committedSegmentsRef.current;
        if (segments.length > 0 && segments[segments.length - 1] === trimmed) {
          return; // Skip exact duplicate
        }

        // Commit this segment
        segments.push(trimmed);
        committedSegmentsRef.current = segments;

        // Update transcript state from committed segments
        setTranscript(segments.join(" "));
        setInterimTranscript("");
      } else {
        // Partial/interim — display only, replaces previous interim
        setInterimTranscript(text);
      }
    };

    provider.onError = (err: string) => {
      console.warn(`[Speech] ${provider.name} error:`, err);
      setError(err);
    };

    provider.onStateChange = (newState: RecordingState) => {
      setState(newState);
    };
  }, []);

  // Initialize — try AssemblyAI first, fall back to Browser
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      // Check if AssemblyAI token endpoint is available
      try {
        const res = await fetch("/api/speech/token", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            // AssemblyAI is available — use it as the primary provider
            const { AssemblyAiProvider } = await import("./assembly-ai-provider");
            const aaiProvider = new AssemblyAiProvider();
            wireCallbacks(aaiProvider);
            providerRef.current = aaiProvider;
            setProviderName("assemblyai");
            console.log("[Speech] Using AssemblyAI provider");
            return;
          }
        }
      } catch {
        // AssemblyAI unavailable — fall through to browser
      }

      // Fallback: Browser Web Speech API
      const browser = new BrowserSpeechProvider();
      wireCallbacks(browser);
      providerRef.current = browser;
      setProviderName("browser");
      console.log("[Speech] Using Browser Web Speech API provider");
    }

    init();

    return () => {
      providerRef.current?.abort();
    };
  }, [wireCallbacks]);

  const isSupported =
    typeof window !== "undefined" &&
    !!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      navigator.mediaDevices?.getUserMedia
    );

  const permissionDenied = state === "permission_denied";

  const startRecording = useCallback(() => {
    // Reset all state for a clean new session
    setError(null);
    setInterimTranscript("");
    committedSegmentsRef.current = [];
    setTranscript("");

    // Generate new session ID
    const newSessionId = crypto.randomUUID();
    sessionIdRef.current = newSessionId;

    if (!providerRef.current) {
      // Last resort — create a new browser provider
      const browser = new BrowserSpeechProvider();
      wireCallbacks(browser);
      providerRef.current = browser;
      setProviderName("browser");
    }

    providerRef.current.start({
      language,
      continuous: true,
      interimResults: true,
    });
  }, [language, wireCallbacks]);

  const stopRecording = useCallback(() => {
    providerRef.current?.stop();
    setInterimTranscript("");

    // Final transcript is already built from committed segments
    // No additional processing needed
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    setState("idle");
    committedSegmentsRef.current = [];
    sessionIdRef.current = null;
  }, []);

  return {
    state,
    isRecording: state === "recording",
    transcript,
    interimTranscript,
    isSupported,
    providerName,
    permissionDenied,
    startRecording,
    stopRecording,
    resetTranscript,
    error,
  };
}
