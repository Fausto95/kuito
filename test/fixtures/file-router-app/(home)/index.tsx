import { Link, Pressable, Text, routes, signal, type RouteOptions } from 'kuito';

export const options: RouteOptions = { title: 'Home' };

export default function Home() {
  const visits = signal(0);

  return (
    <Pressable id="home-visit" onPress={() => visits.value++}>
      <Text id="home-visits">{`${visits.value} visits`}</Text>
      <Link id="to-show" to={routes.show({ id: 42 })}>
        <Text>Open</Text>
      </Link>
      <Link id="to-settings" to={routes.settings()}>
        <Text>Settings</Text>
      </Link>
    </Pressable>
  );
}
