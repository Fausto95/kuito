// The app's routes, declared as components (Kuito's docs/router.md): the
// Home and Explore tabs, and the sheets shown over them. Each screen's
// options, its title and how it presents, come from its own file.
import { Route, Router, Tab, Tabs, type RouteTo } from 'kuito';
import About, { options as about } from './screens/about';
import Color, { options as color, type Result as ColorResult } from './screens/color';
import Explore, { options as explore } from './screens/explore';
import Home, { options as home } from './screens/home';
import SignIn, { options as signIn } from './screens/sign-in';
import SignUp, { options as signUp } from './screens/sign-up';
import Topic, { options as topic, type Params as TopicParams } from './screens/topic';

// What `routes` and `navigate` accept: each route's params and the result
// its screen hands back.
declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    explore: RouteTo;
    topic: RouteTo<TopicParams>;
    about: RouteTo;
    color: RouteTo<{}, ColorResult>;
    signIn: RouteTo;
    signUp: RouteTo;
  }
}

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="home" title="Home" icon={{ ios: 'house', android: 'home' }}>
          <Route name="index" path="/" screen={Home} {...home} />
        </Tab>
        <Tab name="explore" title="Explore" icon={{ ios: 'square.grid.2x2', android: 'grid_view' }}>
          <Route name="explore" path="/explore" screen={Explore} {...explore} />
          <Route name="topic" path="/explore/:topic" screen={Topic} {...topic} />
        </Tab>
      </Tabs>
      <Route name="about" path="/about" screen={About} {...about} />
      <Route name="color" path="/color" screen={Color} {...color} />
      <Route name="signIn" path="/sign-in" screen={SignIn} {...signIn} />
      <Route name="signUp" path="/sign-up" screen={SignUp} {...signUp} />
    </Router>
  );
}
