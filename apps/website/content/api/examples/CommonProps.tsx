import { Text, type CommonProps } from 'kuito';

// A badge that takes every prop a view takes (layout, styles, accessibility,
// gestures) and passes them on.
function Badge(props: CommonProps & { count: number }) {
  const { count, ...view } = props;

  return (
    <Text
      {...view}
      backgroundColor="#ff3b30"
      color="#ffffff"
      borderRadius={9}
      paddingLeft={6}
      paddingRight={6}
    >
      {String(count)}
    </Text>
  );
}

<Badge count={3} position="absolute" top={-4} right={-4} />;
