import { Route, Router, Text, goBack, navigate, signal, Show, SystemBars } from 'kuito';

// The test drives the APIs as an app would, from inside the kernel.
Object.assign(globalThis, { SystemBars, navigate, goBack });

function Home() {
  const hidden = signal(false);
  const shown = signal(false);
  const bars = signal(false);
  const immersive = signal(false);
  const style = signal<'dark' | 'light'>('dark');

  Object.assign(globalThis, {
    setHidden(value: boolean) {
      hidden.value = value;
    },
    setHomeStyle(value: 'dark' | 'light') {
      style.value = value;
    },
    showBars(value: boolean) {
      bars.value = value;
    },
    setImmersive(value: boolean) {
      immersive.value = value;
    },
    showStatusBar(value: boolean) {
      shown.value = value;
    },
  });

  return (
    <>
      <SystemBars statusBar={{ content: style.value }} />
      <Show when={hidden.value}>
        <SystemBars statusBar={{ hidden: true, animated: true, transition: 'slide' }} />
      </Show>
      <Show when={bars.value}>
        <SystemBars
          backgroundColor="#101014"
          navigationBarColor="#ffffff"
          navigationBarButtonStyle="dark"
          immersive={immersive.value}
        />
      </Show>
      <Show when={shown.value}>
        <SystemBars statusBar={{ hidden: false }} />
      </Show>
      <Text>home</Text>
    </>
  );
}

function Night() {
  return (
    <>
      <SystemBars statusBar={{ content: 'light', backgroundColor: '#000' }} />
      <Text>night</Text>
    </>
  );
}

function Photo() {
  return <Text>photo</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" />
      <Route name="night" path="/night" screen={Night} title="Night" />
      <Route
        name="photo"
        path="/photo"
        screen={Photo}
        title="Photo"
        systemBars={{ statusBar: { content: 'light', hidden: true } }}
      />
    </Router>
  );
}
