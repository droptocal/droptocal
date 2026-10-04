import type { ExtractionSource } from './types';

/**
 * The words in a photo, read on the phone (TextRecognitionPlugin, ML Kit).
 *
 * Used in front of the free API: text costs a fraction of a picture to send
 * and to read, and only the words leave the phone. A browser has no such
 * reader, and there the picture goes as it is.
 */
interface TextRecognition {
  read(o: { data: string }): Promise<{ text: string }>;
}

const plugin = (): TextRecognition | undefined =>
  (globalThis as { Capacitor?: { Plugins?: { TextRecognition?: TextRecognition } } }).Capacitor?.Plugins
    ?.TextRecognition;

export const canReadOnDevice = (): boolean => plugin() !== undefined;

/** Less than this per picture is not a poster's worth of words: a photo of a
 *  drawing, or one too blurred to read. The picture itself goes instead. */
const ENOUGH = 25;

/**
 * The source with each picture replaced by the words read from it. A picture
 * that yields too little is kept as a picture, for the model to look at.
 */
export async function readOnDevice(source: ExtractionSource): Promise<ExtractionSource> {
  const reader = plugin();
  if (!reader || source.images.length === 0) return source;

  const texts: string[] = [];
  const kept: string[] = [];
  for (const [i, image] of source.images.entries()) {
    let text = '';
    try {
      text = (await reader.read({ data: image })).text.trim();
    } catch {
      /* unreadable here: the model gets the picture */
    }
    if (text.length >= ENOUGH) {
      const which = source.images.length > 1 ? ` ${i + 1}` : '';
      texts.push(`--- words read from picture${which} (rows rebuilt; " | " separates columns) ---\n${text}`);
    } else {
      kept.push(image);
    }
  }
  if (texts.length === 0) return source;
  return {
    ...source,
    text: [source.text.trim(), ...texts].filter(Boolean).join('\n\n'),
    images: kept,
  };
}
