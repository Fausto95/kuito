import Clipboard from '../../native/modules/clipboard/clipboard';

/**
 * Whether the clipboard holds text, without reading it, so iOS shows no
 * paste prompt. Followed while watched, in this app and others.
 */
export const hasText = Clipboard.hasText;

/** The clipboard's text, or `''`. iOS may ask the user to allow the paste. */
export const readText = Clipboard.readText;

export const writeText = Clipboard.writeText;
