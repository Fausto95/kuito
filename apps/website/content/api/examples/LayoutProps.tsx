import { Box, type KuitoNode, type LayoutProps } from 'kuito';

// Only layout passes through: the frame keeps its own look.
function Frame(props: LayoutProps & { children?: KuitoNode }) {
  return <Box borderWidth={1} borderColor="#d1d1d6" borderRadius={8} {...props} />;
}

<Frame width="50%" aspectRatio={1} margin={8} />;
