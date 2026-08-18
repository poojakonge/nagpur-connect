/* ════════════════════════════════════════════════════════
   useSpeech — React hook for voice input
   
   KEY FIX: Previously, the provider was chosen ONCE at mount.
   If the AssemblyAI token fetch failed at cold start, the hook
   was permanently locked to BrowserSpeechProvider for the rest
   of the session — even if AssemblyAI became available later.
   
   NEW DESIGN: Provider is selected LAZILY on each startRecording().
   This means:
   - First tap: tries AssemblyAI, falls back to browser if unavailable
   - Second tap: tries AssemblyAI again (cold start might have warmed up)
   - Error states are surfaced per-session, not globally
   
   Transcript rules:
   - Partial transcripts: display-only, replaced by next partial
   - Final transcripts: committed to segments array, never appended again
   - Each startRecording() creates a completely clean session
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  isMobile: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
  error: string | null;
}

/**
 * Detect Android / mobile browsers that cannot sustain a real-time
 * AssemblyAI WebSocket stream. These devices use the batch-record path.
 */
function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function useSpeech(language = "en-IN"): UseSpeechReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("assemblyai");
  // Stable across renders — computed once on mount
  const isMobile = useMemo(() => detectMobile(), []);

  const providerRef = useRef<ClientSpeechProvider | null>(null);

  /**
   * Committed transcript segments — array of final strings.
   * Ref prevents stale closures in onResult callbacks.
   */
  const committedSegmentsRef = useRef<string[]>([]);

  /**
   * Session ID — matches the provider's sessionId.
   * Used to discard late-arriving callbacks from old sessions.
   */
  const sessionIdRef = useRef<string | null>(null);

  const wireCallbacks = useCallback((provider: ClientSpeechProvider) => {
    provider.onResult = (text: string, isFinal: boolean) => {
      // Guard: discard if provider session doesn't match our tracked session
      if (provider.sessionId !== sessionIdRef.current) return;

      if (isFinal) {
        const trimmed = text.trim();
        if (!trimmed) return;

        if (provider.name === "assemblyai") {
          // AssemblyAI v3 emits full accumulated turn text
          committedSegmentsRef.current = [trimmed];
          setTranscript(trimmed);
          setInterimTranscript("");
        } else {
          // Browser Web Speech API & Mobile Recorder emit separate sentences per pause!
          // Append new segment so speech after 1s pauses is seamlessly preserved
          const existing = committedSegmentsRef.current;
          if (existing.length === 0 || existing[existing.length - 1] !== trimmed) {
            committedSegmentsRef.current = [...existing, trimmed];
          }
          const accumulated = committedSegmentsRef.current.join(" ");
          setTranscript(accumulated);
          setInterimTranscript("");
        }
      } else {
        // Partial: show accumulated committed text + current interim
        if (provider.name === "assemblyai") {
          setInterimTranscript(text);
        } else {
          const committed = committedSegmentsRef.current.join(" ");
          const displayInterim = committed ? `${committed} ${text}` : text;
          setInterimTranscript(displayInterim);
        }
      }
    };

    provider.onError = (err: string) => {
      console.warn(`[Speech] ${provider.name} error:`, err);
      setError(err);
    };

    provider.onStateChange = (newState: RecordingState) => {
      setState(newState);
      if (newState === "recording") {
        setError(null); // Clear previous errors on successful start
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      providerRef.current?.abort();
      providerRef.current = null;
    };
  }, []);

  const isSupported =
    typeof window !== "undefined" &&
    !!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      navigator.mediaDevices?.getUserMedia
    );

  const permissionDenied = state === "permission_denied";

  /**
   * Start recording — LAZY init: tries AssemblyAI on every call.
   * If AssemblyAI token unavailable, falls back to browser speech.
   */
  const startRecording = useCallback(async () => {
    // Reset state for clean new session
    setError(null);
    setInterimTranscript("");
    committedSegmentsRef.current = [];
    setTranscript("");
    setState("processing");

    // Generate new session ID
    const newSessionId = crypto.randomUUID();
    sessionIdRef.current = newSessionId;

    // Abort any existing provider first
    if (providerRef.current) {
      providerRef.current.abort();
      providerRef.current = null;
    }

    // ── MOBILE PATH ─────────────────────────────────────────
    // Android Chrome cannot sustain a real-time AssemblyAI WebSocket
    // stream (audio pipeline gets throttled after ~1-2s by the OS).
    // Mobile devices use MobileRecorderProvider instead:
    //   record complete audio → batch-transcribe on stop.
    if (isMobile) {
      try {
        const { MobileRecorderProvider } = await import("./mobile-recorder-provider");
        const provider = new MobileRecorderProvider();
        wireCallbacks(provider);
        providerRef.current = provider;
        setProviderName("mobile-recorder");

        if (sessionIdRef.current !== newSessionId) {
          setState("idle");
          return;
        }

        await provider.start({ language });
        sessionIdRef.current = provider.sessionId;
      } catch (err) {
        console.error("[Speech] MobileRecorderProvider failed:", err);
        setError("Could not start recording. Please try again.");
        setState("error");
      }
      return;
    }

    // ── DESKTOP PATH ────────────────────────────────────────
    // 1. If Browser Speech API is natively supported (Chrome, Edge, Safari, Opera),
    //    use it for zero-latency, unbreakable real-time streaming speech recognition.
    const browser = new BrowserSpeechProvider();
    if (browser.isSupported) {
      try {
        wireCallbacks(browser);
        providerRef.current = browser;
        setProviderName("browser");

        if (sessionIdRef.current !== newSessionId) {
          setState("idle");
          return;
        }

        browser.start({ language, continuous: true, interimResults: true });
        sessionIdRef.current = browser.sessionId;
        return;
      } catch (browserErr) {
        console.warn("[Speech] Native browser speech failed to start, falling back to audio recorder:", browserErr);
      }
    }

    // 2. Fallback for browsers without native Web Speech API (e.g. Firefox)
    //    Record via MediaRecorder and transcribe with Groq Whisper Large v3 Turbo.
    try {
      const { MobileRecorderProvider } = await import("./mobile-recorder-provider");
      const provider = new MobileRecorderProvider();
      wireCallbacks(provider);
      providerRef.current = provider;
      setProviderName("recorder-ai");

      if (sessionIdRef.current !== newSessionId) {
        setState("idle");
        return;
      }

      await provider.start({ language });
      sessionIdRef.current = provider.sessionId;
    } catch (recorderErr) {
      console.error("[Speech] Audio recording fallback failed:", recorderErr);
      setError("Voice input is not supported in this browser. Please type your report instead.");
      setState("error");
    }
  }, [language, wireCallbacks, isMobile]);

  const stopRecording = useCallback(() => {
    providerRef.current?.stop();
    setInterimTranscript("");
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
    isMobile,
    startRecording,
    stopRecording,
    resetTranscript,
    error,
  };
}
