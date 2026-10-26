/** Release every track, including one that resolves after its dialog closed. */
export function stopCameraStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach(track => track.stop());
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Camera permission was blocked. Allow camera access in your browser’s site settings, then retry. You can also upload a photo or use a USB/Bluetooth scanner.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No camera was found. Connect a webcam or open this page on your phone. Photo upload and hardware scanners still work.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The camera is busy. Close other camera apps or browser tabs, then retry.";
  return "Could not start the camera. Check camera access and your connection, then retry, or use photo upload or a hardware scanner.";
}
