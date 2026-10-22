// Reading an animation spec the JS thread sent: plain data, checked here.

export type Spec = Record<string, unknown>;

export function isSpec(value: unknown): value is Spec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function number(spec: Spec, key: string): number {
  const value = spec[key];

  if (typeof value !== 'number' || !isFinite(value))
    throw new TypeError('Animation ' + String(spec.type) + ' needs a number ' + key);

  return value;
}

export function optionalNumber(spec: Spec, key: string): number | undefined {
  return spec[key] === undefined ? undefined : number(spec, key);
}
