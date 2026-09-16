/**
 * SmartPharm Speech Recognition Client Wrapper
 * Uses browser Web Speech API with Indian English (en-IN) acoustic prioritization.
 */

export interface SpeechController {
  stop: () => void;
  abort: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export function startSpeechRecognition(
  onResult: (transcript: string) => void,
  onError: (error: string) => void,
  onEnd: () => void
): SpeechController | null {
  if (typeof window === "undefined") return null;

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    onError("Web Speech API is not supported in this browser. Please use text input.");
    return null;
  }

  try {
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "en-IN"; // Prioritize Indian English pronunciations
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (event.results && event.results.length > 0) {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      onError(event.error || "Speech recognition encountered an error.");
    };

    recognition.onend = () => {
      onEnd();
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch (_) {}
      },
      abort: () => {
        try {
          recognition.abort();
        } catch (_) {}
      },
    };
  } catch (err: any) {
    onError(err.message || "Failed to initialize microphone.");
    return null;
  }
}
