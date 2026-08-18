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

        setTranscript(trimmed);
        setInterimTranscript("");
      } else {
        // Live partial/interim words
        setInterimTranscript(text.trim());
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

    // ── PRIMARY TIER: Native Browser Speech API (Chrome, Edge, Safari, Android Chrome) ──
    // Zero-latency, real-time live streaming speech recognition without network lag.
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

    // ── SECONDARY TIER: High-Accuracy AI Speech Recorder (Groq Whisper) ──
    // Fallback for browsers without native Web Speech API (Firefox, custom WebViews)
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
  }, [language, wireCallbacks]);

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
