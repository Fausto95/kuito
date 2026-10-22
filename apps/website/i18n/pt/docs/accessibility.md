# Acessibilidade

Um único conjunto de props de acessibilidade funciona em todas as vistas, em
ambas as plataformas, com o VoiceOver no iOS e o TalkBack no Android:
`label`, `hint`, `role` (os nomes do ARIA), `live`, `actions` e os factos
`aria-*` do ARIA.

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

| Prop                                                                           | Significado                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `accessible`                                                                   | Torna a vista um único elemento, lido como o seu `label` ou, sem ele, como o texto dos seus filhos.                |
| `label`                                                                        | O que o leitor de ecrã lê.                                                                                         |
| `hint`                                                                         | O que acontece ao ativar, lido após uma pausa.                                                                     |
| `role`                                                                         | O que a vista é, nos nomes do ARIA: `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab`, ... (abaixo).   |
| `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy`, `aria-expanded` | O estado da vista; `aria-checked` pode ser `'mixed'`.                                                              |
| `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`            | Um intervalo, ou um valor textual.                                                                                 |
| `aria-hidden`                                                                  | Os leitores de ecrã saltam a vista e a sua subárvore.                                                              |
| `live`                                                                         | `off`, `polite` ou `assertive`: as alterações ao texto da vista são anunciadas; ver [regiões live](#live-regions). |
| `actions`                                                                      | `[{ name, label? }]`: ações padrão, ou personalizadas listadas pelo seu `label`.                                   |
| `onAction`                                                                     | Chamado com `{ actionName }` quando uma é executada.                                                               |

Um **Pressable é um único elemento**, lido como o texto dos seus filhos, por
isso precisa de algo para ler: dê-lhe um `label`, ou texto entre os seus
filhos. Um Pressable sem nenhum dos dois (um ícone sozinho) é um erro de
build que indica a sua linha.

### Roles

| Role                                                                             | VoiceOver                                             | TalkBack                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `button`, `menuitem`, `radio`, `tab`, `combobox`                                 | Botão                                                 | Button, RadioButton, ou o nome do role      |
| `checkbox`, `switch`                                                             | Botão, com o estado de marcado                        | CheckBox, Switch                            |
| `heading`                                                                        | Cabeçalho (rotor)                                     | Cabeçalho                                   |
| `img`                                                                            | Imagem                                                | ImageView                                   |
| `link`                                                                           | Ligação                                               | "ligação"                                   |
| `slider`, `spinbutton`                                                           | Ajustável (deslizar para cima/baixo)                  | SeekBar, "botão rotativo" (ações de scroll) |
| `searchbox`                                                                      | Campo de pesquisa                                     | EditText                                    |
| `tablist`                                                                        | Barra de separadores: os separadores leem-se "n de m" | "lista de separadores"                      |
| `progressbar`, `timer`                                                           | Atualiza frequentemente                               | ProgressBar, "temporizador"                 |
| `summary`                                                                        | Resumo                                                | "resumo"                                    |
| `alert`, `grid`, `list`, `menu`, `menubar`, `radiogroup`, `scrollbar`, `toolbar` | Sem trait                                             | O nome do role                              |
| `none`, `presentation`                                                           | Nada                                                  | Nada                                        |

Um role fora destes é um erro que indica os suportados. O estado torna-se o
que cada leitor tem para ele: `aria-disabled` esbate o elemento,
`aria-selected` seleciona-o, `aria-checked` é um estado marcável no Android
e "marcado" / "não marcado" (ou "ligado" / "desligado" para um switch) no
iOS, `aria-expanded` é uma ação de expandir ou recolher no Android e
"expandido" / "recolhido" no iOS, e `aria-busy` é lido como "ocupado". Um
intervalo é um intervalo no Android e o seu valor atual no iOS;
`aria-valuetext` prevalece sobre `aria-valuenow` em ambos. Cada facto é uma
prop nativa própria, por isso alterar um atualiza só esse.

### Ações

`activate`, `increment`, `decrement` e `longpress` substituem os gestos do
próprio leitor: duplo toque, deslizar para cima e para baixo num elemento
ajustável no iOS, e o clique, o avançar e recuar no scroll e o clique longo
do TalkBack. `magicTap` e `escape` são gestos do VoiceOver sem equivalente no
TalkBack e não fazem nada no Android. Qualquer outro nome é uma ação
personalizada, no rotor de ações do VoiceOver e no menu de ações do TalkBack,
sob o seu `label`.

No iOS 16, as ações padrão são também ações personalizadas: os handlers do
UIKit para elas precisam do iOS 17. Pela mesma razão, um contentor
`accessible` sem label só é lido a partir dos seus filhos no iOS 17 e
posteriores; dê-lhe um `label` para o iOS 16. Um Pressable lê os seus filhos
em todas as versões.

```tsx
<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
  aria-valuetext={stars.value + ' of 5 stars'}
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

- Um anúncio interrompe a fala em curso; `queue: true` espera por ela (iOS; o
  TalkBack põe sempre em fila).
- `focus` recebe um elemento, como `ref.current`.
- O estado do leitor de ecrã é o VoiceOver no iOS e a exploração por toque
  (TalkBack) no Android. Reduzir movimento é a definição do iOS e o Remover
  animações do Android (uma escala de duração das animações de 0).
- `screenReader` e `reduceMotion` são sinais. A primeira leitura pergunta ao
  lado nativo uma vez e é `null` até ele responder; a resposta e cada
  alteração posterior atualizam ambos, e um valor que se mantém igual não é
  uma alteração.

## Regiões live

`live` anuncia as alterações ao texto de uma vista: `polite` espera pela fala em curso, `assertive` interrompe-a. O Android
tem regiões live nativamente. O UIKit não tem, por isso no iOS o Kuito
observa os Text dentro da região e, assim que um lote de alterações é
aplicado, anuncia o que a região agora lê.

```tsx
<Text live="polite">{status.value}</Text>
```

## Como atravessa a fronteira

Os anúncios, o foco e o pedido de estado são comandos na fila de mutações,
como `focus()` (ver [teclado](keyboard.md#how-it-crosses-the-boundary)).
O estado chega como o evento nativo da aplicação `accessibility.status` com
`{ screenReaderEnabled, reduceMotionEnabled }`; as ações de acessibilidade
chegam como `<id>.accessibilityaction` com `{ actionName }`.

No iOS, o UIKit só calcula as predefinições de acessibilidade de um label ou
de um botão enquanto uma tecnologia de apoio está a correr, por isso o
renderer só escreve uma propriedade quando uma prop a define, e repõe o que
lá estava quando a prop desaparece.
