// Profile photos are shown at most ~100 px wide, so 512 px is plenty even on 3x screens.
// A phone camera photo (3–8 MB) comes out around 40–120 KB, which keeps uploads fast on mobile data
// and keeps S3 storage and transfer small.
const PROFILE_PHOTO_SIZE = 512;
const JPEG_QUALITY = 0.7;

// Minimal shape of expo-image-manipulator, declared here so this file compiles even before the
// package is installed (it is loaded at runtime with require()).
type ImageManipulatorModule = {
  manipulateAsync: (
    uri: string,
    actions: { resize: { width?: number; height?: number } }[],
    options: { compress: number; format: string; base64?: boolean },
  ) => Promise<{ uri: string; base64?: string }>;
  SaveFormat: { JPEG: string };
};

export type CompressedImage = { uri: string; base64: string | null };

/**
 * Resizes and re-encodes an image as JPEG, returning its file URI and base64 data. If
 * expo-image-manipulator is not installed or the native module is missing (an old development build),
 * returns the original (base64 from the picker is used then); the backend still rejects anything over 2 MB.
 */
export async function compressProfilePhoto(uri: string, width: number, height: number, fallbackBase64?: string | null): Promise<CompressedImage> {
  try {
    const { manipulateAsync, SaveFormat } = require('expo-image-manipulator') as ImageManipulatorModule;
    // Shrink the longer side only; never upscale small images
    const resize =
      width >= height
        ? { width: Math.min(width || PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE) }
        : { height: Math.min(height || PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE) };
    const result = await manipulateAsync(uri, [{ resize }], { compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
    return { uri: result.uri, base64: result.base64 ?? fallbackBase64 ?? null };
  } catch (e: any) {
    console.warn('Image compression unavailable, uploading original:', e?.message ?? e);
    return { uri, base64: fallbackBase64 ?? null };
  }
}