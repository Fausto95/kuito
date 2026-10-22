import { Link, Text, routes, type RouteOptions } from 'kuito';
import { evaluated } from '../_record/evaluated';

evaluated('index');

export const options: RouteOptions = { title: 'Home' };

export default function Home() {
  return (
    <>
      <Link id="to-show" to={routes.show({ id: 42 })}>
        <Text>Open</Text>
      </Link>
      <Link id="to-settings" to={routes.settings()}>
        <Text>Settings</Text>
      </Link>
    </>
  );
}
