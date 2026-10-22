import {
  Pressable,
  HStack,
  SafeArea,
  Scroll,
  VStack,
  Text,
  signal,
  app,
  permissions,
  type PermissionName,
  type PermissionResponse,
} from 'kuito';

const NAMES: PermissionName[] = [
  'camera',
  'microphone',
  'photos',
  'location',
  'locationAlways',
  'notifications',
];

const describe = (response: PermissionResponse) =>
  response.status + (response.canAskAgain ? '' : ' · ask in Settings');

function Button(props: { id: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      id={props.id}
      padding={10}
      borderRadius={8}
      backgroundColor="#2a2a36"
      onPress={() => props.onPress()}
    >
      <Text color="#ffffff">{props.label}</Text>
    </Pressable>
  );
}

/** One permission: its last answer, and buttons to check and request it. */
function Permission(props: { name: PermissionName }) {
  const answer = signal('not checked');
  const show = (response: PermissionResponse) => {
    answer.value = describe(response);
    console.log('permissions ' + props.name + ': ' + JSON.stringify(response));
  };

  return (
    <VStack gap={8} padding={14} borderRadius={12} backgroundColor="#16161e">
      <Text id={props.name + '-status'} color="#ffffff">
        {props.name + ': ' + answer.value}
      </Text>
      <HStack gap={10}>
        <Button
          id={props.name + '-check'}
          label="Check"
          onPress={() => void permissions.check(props.name).then(show)}
        />
        <Button
          id={props.name + '-request'}
          label="Request"
          onPress={() => void permissions.request(props.name).then(show)}
        />
      </HStack>
    </VStack>
  );
}

/** Checks and requests each permission the permissions module knows. */
export default function App() {
  return (
    <SafeArea flex={1} backgroundColor="#0b0b10">
      <Scroll>
        <VStack gap={12} padding={20}>
          <Text color="#ffffff" fontSize={24} fontWeight={700}>
            permissions
          </Text>
          {NAMES.map((name) => (
            <Permission name={name} />
          ))}
          <Button
            id="open-settings"
            label="Open Settings"
            onPress={() => void app.openSettings()}
          />
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
