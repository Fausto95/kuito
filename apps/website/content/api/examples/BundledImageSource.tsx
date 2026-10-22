// Type an image packaged with the app.
import { Image, type BundledImageSource } from 'kuito';
import cover from './assets/cover.png';

function Cover(props: { source: BundledImageSource }) {
  // An imported image knows its size, so the view keeps its aspect ratio.
  return (
    <Image src={props.source} width="100%" aspectRatio={props.source.width / props.source.height} />
  );
}

<Cover source={cover} />;
