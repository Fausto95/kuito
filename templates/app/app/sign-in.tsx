import {
  Pressable,
  Text,
  TextField,
  VStack,
  navigate,
  routes,
  signal,
  type RouteOptions,
  type ScreenProps,
} from 'kuito';
import { signIn } from './_components/account';
import { Button } from './_components/button';
import { field } from './_components/field';
import { colors } from './_components/theme';

// A sheet over everything, as About is. Its fields tell the keyboard and the
// password manager what they hold: an email that is the username, and the
// saved password, which autofill offers.
export const options: RouteOptions = { title: 'Sign in', presentation: 'sheet' };

export default function SignIn({ dismiss }: ScreenProps) {
  const email = signal('');
  const password = signal('');
  const problem = signal<string | null>(null);

  const submit = () => {
    problem.value = signIn(email.value, password.value);

    if (!problem.value) dismiss();
  };

  return (
    <VStack padding={24} gap={12} backgroundColor={colors.card}>
      <Text fontSize={22} fontWeight={700} color={colors.text}>
        Sign in
      </Text>
      <TextField
        {...field}
        label="Email"
        placeholder="Email"
        type="email"
        autoComplete="username"
        enterKeyHint="next"
        value={email}
      />
      <TextField
        {...field}
        label="Password"
        placeholder="Password"
        type="password"
        autoComplete="current-password"
        enterKeyHint="go"
        value={password}
        onSubmit={submit}
      />
      <Text fontSize={14} color={colors.error}>
        {problem.value ?? ''}
      </Text>
      <Button title="Sign in" onPress={submit} />
      <Pressable
        alignItems="center"
        padding={8}
        pressedOpacity={0.6}
        onPress={() => navigate(routes.signUp(), { replace: true })}
      >
        <Text fontSize={16} color={colors.accent}>
          Create an account
        </Text>
      </Pressable>
    </VStack>
  );
}
