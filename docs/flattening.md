# View flattening

A container that only groups and positions its children gets no native view.
It keeps its node in the shared layout tree (`native/shared/layout`), so it
still sizes and places its children; their views join the nearest ancestor
that has a view, shifted by the container's position. Flattening is
automatic: there is no `collapsable` prop. React Native's Fabric does the same
in its differentiator.

## What is layout-only

A node is layout-only when all of these hold:

- Its kind is a plain container: `VStack`, `HStack`, `Box` or `Spacer`.
- Every prop it has is a layout prop in `src/protocol/manifest.ts` (concern
  `layout`, generated into `LAYOUT_PROPS`): padding, margin, size, position,
  and flexbox props.
- It has no event handler (`onPress`, `onScroll`, ...) and no `ref`.
- No prop is an animation (`timing(200).to(0)`, `spring().to(12)`) or driven
  by a motion value on the UI thread (`docs/motion.md`).

Any other prop keeps the view: background, gradient, border, corner radius,
shadow, opacity, transforms, `overflow`, `hidden`, `transition`, `animate`,
`enter`/`exit`, accessibility props. The table
lists what may be flattened rather than what may not, so a new prop keeps its
view unless its manifest entry is a layout prop; `hidden` is one that still
needs a view (`needsView`).

The key decides, not the value: `backgroundColor={on.value ? 'red' : null}` keeps its view while the color is off, so toggling it never creates
and destroys views.

## Where it happens

The kernel decides when it commits a plan; the renderers carry it out. The
kernel is the one place that sees everything that needs a view, since event
handlers, refs and animations never reach the host as props. It also runs the
same rule on both platforms and is tested without a device
(`test/flattening.test.ts`).

The host batch carries it in two records (docs/native-scheduling.md):

- `Create` with its flattened flag set creates a layout-only node.
- `Flatten` gives a committed node its view or takes it away.

## Promotion and demotion

When a commit adds a view-forcing prop to a flattened node, the kernel sends
`setFlattened(id, false)` before the prop. The renderer makes the view, puts
it where the node is in tree order, and moves the node's children's views into
it. A prop set later, from a binding or an element handle's `setProperty`,
promotes the node the same way.

When a commit removes the last view-forcing prop, the kernel clears the props
on the view first, then sends `setFlattened(id, true)`. The renderer moves the
children's views to the nearest ancestor with a view, in the same order, and
removes the view. A node only flattens again at a commit, so a prop that
changes every frame never churns views.

Neither one remounts the children: their native views and state (a field's
text, a scroll position) stay.

## In the renderers

Both renderers keep the same shape:

- Every node has a layout node and a style. A flattened node has no view.
- `place` puts a node's view into its host (the nearest ancestor with a view,
  a Scroll's content, or the root) before the next view in tree order. A
  flattened node places its children's views instead.
- Frames: a flattened node's children are placed at their own frame plus the
  frames of every flattened ancestor up to the host (`applyFramesToChildren`
  on iOS, `KuitoFlexLayout.forEachChildView` on Android).

## Events, hit testing and accessibility

Events don't change. A press goes to the native view that was touched, and
bubbles through the kernel's tree, which includes flattened nodes:
`composedPath()`, `currentTarget` and `parent` are the same as without
flattening. Flattened kinds emit no native events of their own.

Hit testing doesn't change either, with one exception, the same as in Fabric.
UIKit and Android only hit-test a child inside its parent's bounds. A child
that overflows a flattened container can be touched outside that container's
box, as long as it is inside the nearest real ancestor.

Plain containers are not accessibility elements on either platform, and the
views keep their order, so VoiceOver and TalkBack read the same elements in
the same order. A container with accessibility props keeps its view.
