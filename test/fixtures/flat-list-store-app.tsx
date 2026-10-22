import { List, Pressable, Text, store } from 'kuito';

interface Book {
  title: string;
  liked: boolean;
}

const shelf = store({
  books: ['Dune', 'Emma', 'Ulysses', 'Beloved', 'Middlemarch', 'Kindred'].map((title): Book => ({
    title,
    liked: false,
  })),
});

export default function App() {
  return [
    <Pressable label="like" id="like" onPress={() => (shelf.books[3].liked = true)} />,
    <Pressable
      label="push"
      id="push"
      onPress={() => shelf.books.push({ title: 'Orlando', liked: false })}
    />,
    <Pressable label="reverse" id="reverse" onPress={() => shelf.books.reverse()} />,
    <Pressable
      label="replace"
      id="replace"
      onPress={() => (shelf.books[0] = { title: 'Persuasion', liked: true })}
    />,
    <List
      id="list"
      data={shelf.books}
      renderItem={({ item, index, visible }) => (
        <Pressable onPress={() => (item.liked = !item.liked)}>
          <Text>{index.value + 1 + '. ' + item.title}</Text>
          <Text>{item.liked ? 'liked' : 'not liked'}</Text>
          <Text>{visible.value ? 'on screen' : 'off screen'}</Text>
        </Pressable>
      )}
    />,
  ];
}
