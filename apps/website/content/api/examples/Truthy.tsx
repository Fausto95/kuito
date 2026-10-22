// Type content rendered for a present value.
import { Show, Text, signal, type Truthy } from 'kuito';

type User = { name: string } | null;

const user = signal<User>(null);

// The branch callback gets the user without `null`: no check needed inside.
const greet = (signedIn: Truthy<User>) => <Text>Hello, {signedIn.name}</Text>;

<Show when={user.value} fallback={<Text>Sign in</Text>}>
  {greet}
</Show>;
