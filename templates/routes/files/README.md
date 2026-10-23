## What's inside

```text
app/
  _layout.tsx                  the tab bar: Home and Explore
  (home)/index.tsx             /                 counter, motion, image
  (explore)/explore.tsx        /explore          a List of topics
  (explore)/explore/[topic].tsx /explore/:topic  a pushed screen with a live demo
  about.tsx                    /about            a sheet
  sign-in.tsx, sign-up.tsx     /sign-in, /sign-up  account sheets: fields that
                               tell the keyboard and autofill what they hold
  _components/                 not routes: shared components and data
  _components/demos/           one demo per topic: layout, text and image,
                               state, motion, gestures, async, lists,
                               navigation
tests/
  home.test.tsx                Home's counter on the headless host: npm test
  account.test.tsx             the sign-in and sign-up forms
```

This app uses file routes: every `.tsx` file in `app/` is a route; `(group)` directories are the tabs
`_layout.tsx` declares, `[name]` is a parameter, and files under `_` are not
routes. See Kuito's `docs/navigation.md`.
