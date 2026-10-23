import {
  Box,
  Image,
  Link,
  Pressable,
  HStack,
  Scroll,
  VStack,
  Symbol,
  Text,
  motion,
  sequence,
  spring,
  signal,
  timing,
  routes,
  type RouteOptions,
} from 'kuito';
import logo from '../../assets/logo.svg';
import { account, signOut } from '../_components/account';
import { Card } from '../_components/card';
import { colors } from '../_components/theme';

export const options: RouteOptions = { title: 'Welcome' };

export default function Home() {
  const count = signal(0);
  const scale = motion(1);
  const turn = motion(0);

  const add = () => {
    count.value++;
    scale.value = sequence(timing({ duration: 120 }).to(1.3), spring({ damping: 8 }).to(1));
    turn.value = spring().to(count.value * 45);
  };

  const reset = () => {
    count.value = 0;
    turn.value = spring().to(0);
  };

  return (
    <Scroll flex={1} backgroundColor={colors.background}>
      <VStack padding={20} gap={16}>
        <Image
          src={{ uri: 'https://picsum.photos/id/1018/1200/675' }}
          aspectRatio={16 / 9}
          borderRadius={20}
          placeholder={colors.accentSoft}
          fadeDuration={250}
        />
        <VStack gap={6}>
          <HStack alignItems="center" gap={10}>
            <Image src={logo} />
            <Text fontSize={28} fontWeight={700} color={colors.text}>
              Welcome to Kuito
            </Text>
          </HStack>
          <Text fontSize={16} color={colors.muted}>
            Edit this screen and save: the change appears in place, with its state kept.
          </Text>
        </VStack>
        <Card title="State and motion">
          <HStack alignItems="center" gap={16}>
            <Box
              width={56}
              height={56}
              borderRadius={16}
              backgroundColor={colors.accent}
              scale={scale}
              rotate={turn}
            />
            <VStack flexShrink={1} gap={2}>
              <Text fontSize={34} fontWeight={700} color={colors.text}>
                {String(count.value)}
              </Text>
              <Text fontSize={14} color={colors.muted}>
                {count.value === 1 ? 'press so far' : 'presses so far'}
              </Text>
            </VStack>
          </HStack>
          <HStack gap={12}>
            <Pressable
              flex={1}
              alignItems="center"
              padding={12}
              borderRadius={12}
              backgroundColor={colors.accent}
              pressedScale={0.97}
              onPress={add}
            >
              <Text fontSize={16} fontWeight={600} color="#ffffff">
                Add one
              </Text>
            </Pressable>
            <Pressable
              flex={1}
              alignItems="center"
              padding={12}
              borderRadius={12}
              backgroundColor={colors.accentSoft}
              pressedOpacity={0.6}
              onPress={reset}
            >
              <Text fontSize={16} fontWeight={600} color={colors.accent}>
                Reset
              </Text>
            </Pressable>
          </HStack>
        </Card>
        <Card title="Account">
          {account.value ? (
            <HStack alignItems="center" gap={12}>
              <Text flex={1} fontSize={17} color={colors.text}>
                {`Signed in as ${account.value.name}`}
              </Text>
              <Pressable pressedOpacity={0.6} onPress={signOut}>
                <Text fontSize={17} color={colors.accent}>
                  Sign out
                </Text>
              </Pressable>
            </HStack>
          ) : (
            <HStack gap={20}>
              <Link to={routes.signIn()}>
                <Text fontSize={17} color={colors.accent}>
                  Sign in
                </Text>
              </Link>
              <Link to={routes.signUp()}>
                <Text fontSize={17} color={colors.accent}>
                  Create an account
                </Text>
              </Link>
            </HStack>
          )}
        </Card>
        <Card title="Next steps">
          <Link to={routes.explore()}>
            <HStack alignItems="center" gap={8}>
              <Symbol name="star" size={18} weight="semibold" tintColor={colors.accent} />
              <Text fontSize={17} color={colors.accent}>
                Explore the components
              </Text>
            </HStack>
          </Link>
          <Link to={routes.about()}>
            <Text fontSize={17} color={colors.accent}>
              About this app
            </Text>
          </Link>
        </Card>
      </VStack>
    </Scroll>
  );
}
