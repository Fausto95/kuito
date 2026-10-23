## What's inside

```text
app.tsx                        the routes: a Router with the Home and Explore
                               tabs, and the sheets over them
screens/
  home.tsx                     /                 counter, motion, image
  explore.tsx                  /explore          a List of topics
  topic.tsx                    /explore/:topic   a pushed screen with a live demo
  about.tsx                    /about            a sheet
  sign-in.tsx, sign-up.tsx     /sign-in, /sign-up  account sheets: fields that
                               tell the keyboard and autofill what they hold
components/                    shared components and data
components/demos/              one demo per topic: layout, text and image,
                               state, motion, gestures, async, lists,
                               navigation
tests/
  home.test.tsx                Home's counter on the headless host: npm test
  account.test.tsx             the sign-in and sign-up forms
```

This app uses component routes: `app.tsx` declares every route as a
`<Route>` in one `<Router>`, its tabs as `<Tabs>` and `<Tab>`, and the
`Routes` interface that types `routes.topic({ topic })` and `navigate`. Each
screen's `options` (its title, how it presents) stay in its own file. A new
screen is a file in `screens/`, a `<Route>` in `app.tsx` and a line in
`Routes`. See Kuito's `docs/router.md`.
