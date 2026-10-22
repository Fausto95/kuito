import Share, {
  type ShareAction as SpecShareAction,
  type ShareResult as SpecShareResult,
} from '../../native/modules/share/share';

export type ShareContent = {
  message?: string;
  /** iOS shares it as a URL; Android appends it to the message. */
  url?: string;
  /** Android: the subject, as an email's. */
  title?: string;
};

export type ShareOptions = {
  /** Android: the chooser's title. */
  dialogTitle?: string;
  /** iOS: the subject, as an email's. */
  subject?: string;
  /** iOS: activity types to leave out, as `com.apple.UIKit.activity.AirDrop`. */
  excludedActivityTypes?: string[];
};

export type ShareAction = SpecShareAction;

export type ShareResult = SpecShareResult;

/**
 * Shows the system share sheet: UIActivityViewController on iOS, the Android
 * Sharesheet on Android (docs/share.md). Resolves when the sheet closes:
 * shared, with what, or dismissed.
 */
export function share(content: ShareContent, options: ShareOptions = {}): Promise<ShareResult> {
  if (content.message === undefined && content.url === undefined)
    return Promise.reject(new TypeError('share() needs a message or a url'));

  return Share.share({ ...content, ...options });
}
