// Handle the outcome of a share sheet.
import { share, type ShareAction } from 'kuito';

const outcomes: Record<ShareAction, string> = { shared: 'Thanks for sharing', dismissed: '' };

const { action } = await share({ message: 'Listen to this', url: 'https://example.com/a/42' });

console.log(outcomes[action]);
