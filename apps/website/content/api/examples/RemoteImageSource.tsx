import { Image, type RemoteImageSource } from 'kuito';

const avatar = (token: string): RemoteImageSource => ({
  uri: 'https://api.example.com/me/avatar',
  headers: { Authorization: `Bearer ${token}` },
});

<Image src={avatar('abc123')} width={48} height={48} borderRadius={24} />;
