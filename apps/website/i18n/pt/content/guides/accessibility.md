# Acessibilidade

Um único conjunto de props de acessibilidade funciona em todas as vistas, em ambas as plataformas, com o VoiceOver no iOS e o TalkBack no Android: `label`, `hint`, `role` (os nomes do ARIA), `live`, `actions` e os factos `aria-*` do ARIA.

```tsx
<Pressable
  role="button"
  label="Play"
  hint="Starts the episode"
  aria-disabled={!ready.value}
  onPress={play}
>
  <Image src={icon} />
</Pressable>
```

## Props

- `accessible` torna a vista um único elemento, lido como o seu `label` ou, sem ele, como o texto dos seus filhos.
- `label` é o que o leitor de ecrã lê; `hint` é o que acontece ao ativar, lido após uma pausa.
- `role` é o que a vista é, nos nomes do ARIA: `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab` e mais. Um role fora dos suportados é um erro que os nomeia.
- `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy` e `aria-expanded` são o estado da vista; `aria-valuemin`, `aria-valuemax`, `aria-valuenow` e `aria-valuetext` um intervalo, ou um valor textual.
- `aria-hidden`: os leitores de ecrã saltam a vista e a sua subárvore.
- `actions` lista ações padrão, ou personalizadas pelo seu `label`; `onAction` é chamado com `{ actionName }` quando uma é executada.

Um Pressable é um único elemento, lido como o texto dos seus filhos, por isso precisa de algo para ler: dê-lhe um `label`, ou texto entre os seus filhos. Um Pressable sem nenhum dos dois (um ícone sozinho) é um erro de build que indica a sua linha. Cada facto é uma prop nativa própria, por isso alterar um atualiza só esse.

## Ações

`activate`, `increment`, `decrement` e `longpress` substituem os gestos do próprio leitor: duplo toque, deslizar para cima e para baixo num elemento ajustável no iOS, e o clique, o avançar e recuar no scroll e o clique longo do TalkBack. `magicTap` e `escape` são gestos do VoiceOver sem equivalente no TalkBack. Qualquer outro nome é uma ação personalizada, no rotor de ações do VoiceOver e no menu de ações do TalkBack, sob o seu `label`.

```tsx
<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
  actions={[{ name: 'increment' }, { name: 'decrement' }]}
  onAction={(event) => change(event.actionName === 'increment' ? 1 : -1)}
>
  ...
</HStack>
```

## O módulo accessibility

```tsx
import { watch, accessibility } from 'kuito';

accessibility.announce('12 shows found');
accessibility.announce('Saved', { queue: true });
accessibility.focus(title.current);

accessibility.screenReader.value; // true, false, or null until the platform answers
watch(accessibility.reduceMotion, (calm) => (animations.value = !calm)); // in a component
```

- Um anúncio interrompe a fala em curso; `queue: true` espera por ela (iOS; o TalkBack põe sempre em fila).
- `focus` recebe um elemento, como `ref.current`.
- `screenReader` e `reduceMotion` são sinais. A primeira leitura pergunta ao lado nativo uma vez e é `null` até ele responder; a resposta e cada alteração posterior atualizam ambos.

## Regiões live

`live` anuncia as alterações ao texto de uma vista: `polite` espera pela fala em curso, `assertive` interrompe-a. O Android tem regiões live nativamente; no iOS o Kuito observa os Text dentro da região e, assim que um lote de alterações é aplicado, anuncia o que a região agora lê.

```tsx
<Text live="polite">{status.value}</Text>
```

## Em profundidade

[Acessibilidade](../../../../docs/accessibility.md) cobre como cada role e estado é lido no VoiceOver e no TalkBack, o que o iOS 16 precisa, e como os anúncios e as ações atravessam a fronteira nativa.
