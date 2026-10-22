// Imported images: the compiler bundles each into both shells and makes the
// import a source with the image's size (docs/assets.md).
declare module '*.png' {
  const source: import('./props.generated').BundledImageSource;

  export default source;
}

declare module '*.jpg' {
  const source: import('./props.generated').BundledImageSource;

  export default source;
}

declare module '*.jpeg' {
  const source: import('./props.generated').BundledImageSource;

  export default source;
}

declare module '*.svg' {
  const source: import('./props.generated').BundledImageSource;

  export default source;
}

declare module '*.pdf' {
  const source: import('./props.generated').BundledImageSource;

  export default source;
}

// An SVG read into shapes when the app compiles: a Drawing's `src`
// (docs/drawing.md). It bundles no image into the shells.
declare module '*.svg?drawing' {
  const drawing: import('../native/drawing').DrawingSource;

  export default drawing;
}
