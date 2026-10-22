# Kuito documentation

Start with [Create your first app](apps.md), then [Build a screen](primitives.md).

The website and this directory use the same guides. API signatures and component
props are generated from the public TypeScript exports during the website build.

## Find a task

| I want to…                             | Read                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Create and run an app                  | [First app](apps.md), [CLI](cli.md)                                                                 |
| Arrange views and style a screen       | [Components](primitives.md), [Styles](styles.md), [Units](css-units.md)                             |
| Update the UI when data changes        | [State](reactivity.md), [Conditional UI](control-flow.md)                                           |
| Load data and handle errors            | [Async work](async.md), [HTTP and Web APIs](web-apis.md)                                            |
| Navigate between screens               | [Navigation](navigation.md)                                                                         |
| Render a feed                          | [Lists](lists.md)                                                                                   |
| Animate a view or respond to a gesture | [Motion](motion.md)                                                                                 |
| Save data locally                      | [Storage](storage.md), [Database](database.md), [Files](file-system.md), [Secrets](secure-store.md) |
| Make the app accessible                | [Accessibility](accessibility.md), [Localization](localization.md)                                  |
| Test and debug a screen                | [Testing](testing.md), [DevTools](devtools.md), [LogBox](logbox.md)                                 |
| Add native code                        | [Native modules](native-modules.md), [Package a module](module-packaging.md)                        |
| Understand the implementation          | [Architecture](architecture.md)                                                                     |

## Contribute to the docs

Write for someone completing a task: say when to use the feature, show a complete
example, explain its behavior, then cover constraints and related APIs. Keep
parameters and props in the generated reference so they stay aligned with code.

Run the website's coverage, snippet, link and build checks before submitting a
change. See [the website contributor guide](../apps/website/README.md).
