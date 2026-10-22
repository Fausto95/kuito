import { signal, type HeaderSearch, type RouteOptions } from 'kuito';

const query = signal('');

const search: HeaderSearch = {
  placeholder: 'Search shows',
  onChange: (text) => (query.value = text),
  onSubmit: (text) => console.log('search for', text),
};

export const options: RouteOptions = { title: 'Shows', header: { largeTitle: true, search } };
