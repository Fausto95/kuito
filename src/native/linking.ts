import Linking from '../../native/modules/linking/linking';

// Opening URLs in other apps, and the links that open this one (docs/linking.md).
// A `<Router linking>` follows incoming links to its routes by itself.

/** Opens `url` in the app that handles it; rejects with `ERR_URL` when none does. */
export const open = Linking.openURL;

/**
 * Whether an installed app handles `url`. iOS answers for schemes the app
 * lists in `LSApplicationQueriesSchemes`, Android for the intents its
 * manifest `<queries>` names; others are false.
 */
export const canOpen = Linking.canOpenURL;

/**
 * The URL that last opened the app, starting with the one it launched with;
 * null when no link opened it. Watched, it follows each link that opens the
 * app while it runs.
 */
export const url = Linking.url;
