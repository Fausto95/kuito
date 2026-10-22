import {
  Button,
  Pressable,
  Route,
  Router,
  HStack,
  SafeArea,
  Scroll,
  VStack,
  Text,
  goBack,
  navigate,
  routes,
  signal,
  type RouteTo,
  Show,
  SystemBars,
  actionSheet,
  alert,
  prompt,
} from 'kuito';

declare module 'kuito' {
  interface Routes {
    systemUI: RouteTo;
    night: RouteTo;
    photo: RouteTo;
  }
}

/**
 * The status bar per screen, the navigation bar, immersive mode, the root
 * background, and every alert(), prompt() and actionSheet() variant. Each answer is logged
 * to the terminal.
 */
export default function App() {
  return (
    <Router>
      <Route name="systemUI" path="/" screen={Home} title="System UI" />
      <Route name="night" path="/night" screen={Night} title="Night" header={false} />
      <Route
        name="photo"
        path="/photo"
        screen={Photo}
        title="Photo"
        header={false}
        systemBars={{ statusBar: { hidden: true, animated: true, transition: 'fade' } }}
      />
    </Router>
  );
}

function Home() {
  const navigationBar = signal(false);
  const immersive = signal(false);
  const homeIndicator = signal(false);
  const background = signal(false);

  return (
    <Scroll backgroundColor="#f4f4f8">
      {/* Declared for this screen; each prop goes back to the shell's when left out. */}
      <SystemBars
        statusBar={{ content: 'dark' }}
        navigationBarColor={navigationBar.value ? '#4b2a8a' : undefined}
        navigationBarButtonStyle={navigationBar.value ? 'light' : undefined}
        homeIndicatorAutoHidden={homeIndicator.value}
        backgroundColor={background.value ? '#1f6f4a' : undefined}
      />
      {/* Mounted last, so the bars it hides win over the ones above. */}
      <Show when={immersive.value}>
        <SystemBars immersive />
      </Show>
      <VStack padding={20} gap={12}>
        <Text fontSize={13} color="#6b6b78">
          STATUS BAR PER SCREEN
        </Text>
        <HStack gap={12}>
          <Button id="night" onPress={() => navigate(routes.night())}>
            Night screen
          </Button>
          <Button id="photo" onPress={() => navigate(routes.photo())}>
            Photo screen
          </Button>
        </HStack>
        <Text fontSize={13} color="#6b6b78">
          SYSTEM BARS
        </Text>
        <HStack gap={12}>
          <Button id="navigation-bar" onPress={() => (navigationBar.value = !navigationBar.value)}>
            {navigationBar.value ? 'Clear nav bar' : 'Purple nav bar'}
          </Button>
          <Button id="immersive" onPress={() => (immersive.value = !immersive.value)}>
            {immersive.value ? 'Leave immersive' : 'Immersive'}
          </Button>
        </HStack>
        <HStack gap={12}>
          <Button id="home-indicator" onPress={() => (homeIndicator.value = !homeIndicator.value)}>
            {homeIndicator.value ? 'Show home indicator' : 'Auto-hide indicator'}
          </Button>
          <Button id="background" onPress={() => (background.value = !background.value)}>
            Root background
          </Button>
        </HStack>
        <Text fontSize={13} color="#6b6b78">
          ALERT
        </Text>
        <HStack gap={12}>
          <Button
            id="alert-ok"
            onPress={async () =>
              console.log('alert', JSON.stringify(await alert({ title: 'Saved' })))
            }
          >
            OK alert
          </Button>
          <Button
            id="alert-destructive"
            onPress={async () => {
              const picked = await alert({
                title: 'Delete episode?',
                message: 'It leaves your downloads.',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Keep' },
                  { text: 'Delete', style: 'destructive' },
                ],
                cancelable: true,
              });

              console.log('alert', picked ? picked.text : 'dismissed');
            }}
          >
            Delete alert
          </Button>
        </HStack>
        <HStack gap={12}>
          <Button
            id="prompt"
            onPress={async () =>
              console.log(
                'prompt',
                JSON.stringify(
                  await prompt({ title: 'Rename list', message: 'A name for this list' }),
                ),
              )
            }
          >
            Prompt
          </Button>
          <Button
            id="prompt-secure"
            onPress={async () =>
              console.log(
                'secure',
                JSON.stringify(
                  await prompt({
                    title: 'Passcode',
                    type: 'password',
                    inputMode: 'numeric',
                  }),
                ),
              )
            }
          >
            Secure
          </Button>
          <Button
            id="prompt-login"
            onPress={async () =>
              console.log(
                'login',
                JSON.stringify(
                  await prompt({
                    title: 'Sign in',
                    message: 'Your TVmaze account',
                    buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign in' }],
                    type: 'login',
                    value: 'ada@example.com',
                    inputMode: 'email',
                  }),
                ),
              )
            }
          >
            Login
          </Button>
        </HStack>
        <Text fontSize={13} color="#6b6b78">
          ACTION SHEET
        </Text>
        <HStack gap={12}>
          <Pressable
            id="sheet"
            onPress={(event) => {
              // An accessibility activation has no location: the sheet centers.
              const anchor =
                event.pageX === undefined || event.pageY === undefined
                  ? undefined
                  : { x: event.pageX, y: event.pageY };

              void actionSheet({
                buttons: [
                  { text: 'Share' },
                  { text: 'Add to list' },
                  { text: 'Delete', style: 'destructive' },
                  { text: 'Cancel', style: 'cancel' },
                ],
                title: 'Episode 4',
                message: 'The Long Night',
                anchor,
              }).then((picked) => console.log('actionSheet', picked?.text ?? null));
            }}
          >
            <Text color="#2f5bd8" fontSize={17}>
              Action sheet
            </Text>
          </Pressable>
          <Button
            id="sheet-plain"
            onPress={async () =>
              console.log(
                'actionSheet plain',
                (
                  await actionSheet({
                    buttons: [
                      { text: 'Copy link' },
                      { text: 'Download', disabled: true },
                      { text: 'Report' },
                    ],
                    tintColor: '#4b2a8a',
                  })
                )?.text ?? null,
              )
            }
          >
            No cancel, disabled
          </Button>
        </HStack>
      </VStack>
    </Scroll>
  );
}

function Night() {
  return (
    <SafeArea flex={1} backgroundColor="#0b0b12">
      <SystemBars statusBar={{ content: 'light', backgroundColor: '#0b0b12', animated: true }} />
      <VStack padding={24} gap={12}>
        <Text color="#ffffff" fontSize={22} fontWeight="bold">
          Night
        </Text>
        <Text color="#c8c8d4">Light status bar text, on a dark status bar on Android.</Text>
        <Button id="night-back" onPress={() => goBack()}>
          Back
        </Button>
      </VStack>
    </SafeArea>
  );
}

function Photo() {
  return (
    <VStack flex={1} backgroundColor="#000000" justifyContent="center" alignItems="center" gap={16}>
      <Text color="#ffffff" fontSize={20}>
        No status bar on this screen
      </Text>
      <Button id="photo-back" onPress={() => goBack()}>
        Back
      </Button>
    </VStack>
  );
}
