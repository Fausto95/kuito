import { alert, type AlertButtonStyle } from 'kuito';

const choice = (text: string, style: AlertButtonStyle) => ({ text, style });

const picked = await alert({
  title: 'Delete this draft?',
  buttons: [choice('Cancel', 'cancel'), choice('Delete', 'destructive')],
});

if (picked?.style === 'destructive') console.log('deleted');
