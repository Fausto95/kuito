import { Text, type RouteOptions } from 'kuito';

export const options: RouteOptions = { title: 'Home' };

export default function Home() {
  return <Text id="home">home</Text>;
}
