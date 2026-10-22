/** Compiled native stylesheets: each class name maps to itself. */
declare module '*.css' {
  const classes: Readonly<Record<string, string>>;

  export default classes;
}
