// Type an event emitted by a module view.
import { defineModule, view, type NativeViewEvent } from 'kuito';

// modules/rating/rating.ts: a native star rating view and the event it sends.
export type RatingEvent = NativeViewEvent<'rate', { stars: number }>;

export type RatingProps = {
  stars?: number;
  onRate?: (event: RatingEvent) => void;
};

export default defineModule('Rating', {
  view: view<RatingProps>({ events: ['rate'] }),
  ios: { class: 'RatingModule' },
  android: { class: 'com.example.myapp.modules.rating.RatingModule' },
});
