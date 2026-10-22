import { Text, TextField, VStack, signal, type RouteOptions, type ScreenProps } from 'kuito';
import { PASSWORD_LENGTH, signUp } from './_components/account';
import { Button } from './_components/button';
import { field } from './_components/field';
import { colors } from './_components/theme';

export const options: RouteOptions = { title: 'Create account', presentation: 'sheet' };

const BIO_LENGTH = 160;

export default function SignUp({ dismiss }: ScreenProps) {
  const name = signal('');
  const email = signal('');
  const password = signal('');
  const bio = signal('');
  const problem = signal<string | null>(null);

  const submit = () => {
    problem.value = signUp(name.value, email.value, password.value);

    if (!problem.value) dismiss();
  };

  return (
    <VStack padding={24} gap={12} backgroundColor={colors.card}>
      <Text fontSize={22} fontWeight={700} color={colors.text}>
        Create account
      </Text>
      <TextField
        {...field}
        label="Name"
        placeholder="Name"
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="next"
        value={name}
      />
      <TextField
        {...field}
        label="Email"
        placeholder="Email"
        type="email"
        autoComplete="email"
        enterKeyHint="next"
        value={email}
      />
      {/* new-password: the password manager offers to make one, and saves it. */}
      <TextField
        {...field}
        label="New password"
        placeholder={`Password, ${PASSWORD_LENGTH} characters or more`}
        type="password"
        autoComplete="new-password"
        enterKeyHint="next"
        value={password}
      />
      {/* lines wraps the text and grows with it, from two lines to four. */}
      <TextField
        {...field}
        label="About you"
        placeholder="A few words about you"
        lines={{ min: 2, max: 4 }}
        maxLength={BIO_LENGTH}
        value={bio}
      />
      <Text fontSize={13} color={colors.muted} alignSelf="flex-end">
        {`${bio.value.length} / ${BIO_LENGTH}`}
      </Text>
      <Text fontSize={14} color={colors.error}>
        {problem.value ?? ''}
      </Text>
      <Button title="Create account" onPress={submit} />
    </VStack>
  );
}
