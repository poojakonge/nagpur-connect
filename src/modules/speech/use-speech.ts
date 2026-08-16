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
  const [providerName, setProviderName] = useState("assemblyai");

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

        // Dedup: skip if identical to last committed segment
        const segments = committedSegmentsRef.current;
        const lastSegment = segments[segments.length - 1];
        if (lastSegment === trimmed) return;

        // Commit
        segments.push(trimmed);
        committedSegmentsRef.current = segments;
        setTranscript(segments.join(" "));
        setInterimTranscript("");
      } else {
        // Partial: display-only, replaces previous partial
        setInterimTranscript(text);
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

    // Try AssemblyAI — check token availability first (fast HEAD check)
    let useAssemblyAI = false;
    try {
      const tokenRes = await fetch("/api/speech/token", {
        signal: AbortSignal.timeout(5000),
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
          useAssemblyAI = true;
        }
      }
    } catch {
      // Token endpoint unavailable — will use browser speech
      console.log("[Speech] AssemblyAI token unavailable, using browser speech");
    }

    // Check if session was cancelled during the async token check
    if (sessionIdRef.current !== newSessionId) {
      setState("idle");
      return;
    }

    if (useAssemblyAI) {
      // Use AssemblyAI — dynamic import to avoid loading on non-supported browsers
      try {
        const { AssemblyAiProvider } = await import("./assembly-ai-provider");
        const provider = new AssemblyAiProvider();
        wireCallbacks(provider);
        providerRef.current = provider;
        setProviderName("assemblyai");

        // Check session again after dynamic import
        if (sessionIdRef.current !== newSessionId) {
          setState("idle");
          return;
        }

        await provider.start({ language, continuous: true, interimResults: true });
        // After start(), the provider's sessionId is set internally.
        // Update our ref to match so callbacks are validated correctly.
        sessionIdRef.current = provider.sessionId;
      } catch (importErr) {
        console.error("[Speech] AssemblyAI import/start failed:", importErr);
        // Fall through to browser speech
        useAssemblyAI = false;
      }
    }

    if (!useAssemblyAI) {
      // Fallback: Browser Web Speech API
      const browser = new BrowserSpeechProvider();
      wireCallbacks(browser);
      providerRef.current = browser;
      setProviderName("browser");

      if (!browser.isSupported) {
        setError(
          "Voice input is not supported in this browser. Please type your report instead."
        );
        setState("error");
        return;
      }

      browser.start({ language, continuous: true, interimResults: true });
      sessionIdRef.current = browser.sessionId;
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
    startRecording,
    stopRecording,
    resetTranscript,
    error,
  };
}
