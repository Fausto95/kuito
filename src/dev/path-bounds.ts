/**
 * An SVG path's bounding box, from its path data: what a gradient in
 * `objectBoundingBox` units spans (src/cli/vector-drawable.ts). Exact: curves
 * are bounded where their derivative is zero and arcs where they turn, not by
 * their control points. Pure.
 */

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SEPARATORS = /[\s,]*/y;

/** How many numbers each command takes per segment. */
const ARITY: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/** The commands of `data`, each with its numbers; an arc's flags are read as one digit each. */
function* commands(data: string): Generator<{ command: string; args: number[] }> {
  let index = 0;
  let command = '';

  const skip = () => {
    SEPARATORS.lastIndex = index;
    SEPARATORS.exec(data);
    index = SEPARATORS.lastIndex;
  };
  const read = (flag: boolean) => {
    skip();

    if (flag) {
      const digit = data[index];

      if (digit !== '0' && digit !== '1') throw new Error(`an arc flag "${digit}" in d="${data}"`);

      index += 1;

      return Number(digit);
    }

    NUMBER.lastIndex = index;

    const match = NUMBER.exec(data);

    if (!match) throw new Error(`d="${data}" at "${data.slice(index, index + 12)}"`);

    index = NUMBER.lastIndex;

    return Number(match[0]);
  };

  for (skip(); index < data.length; skip()) {
    if (/[a-z]/i.test(data[index])) command = data[index++];
    else if (!command || command.toLowerCase() === 'z') throw new Error(`d="${data}"`);

    const arity = ARITY[command.toLowerCase()];

    if (arity === undefined) throw new Error(`the path command ${command}`);

    const args = Array.from({ length: arity }, (_, at) =>
      read(command.toLowerCase() === 'a' && (at === 3 || at === 4)),
    );

    yield { command, args };

    // Coordinates after a moveto are linetos.
    if (command === 'm') command = 'l';
    else if (command === 'M') command = 'L';
  }
}

/** The roots in (0, 1) of a t² + b t + c. */
function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return [];

  const root = Math.sqrt(discriminant);

  return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

const inside = (t: number) => t > 0 && t < 1;

export function pathBounds(data: string): Bounds | null {
  let bounds: Bounds | null = null;
  let [x, y] = [0, 0];
  let [startX, startY] = [0, 0];
  // The last control point, which S and T reflect; null after any other command.
  let control: { kind: 'cubic' | 'quadratic'; x: number; y: number } | null = null;

  const include = (px: number, py: number) => {
    bounds = bounds
      ? [
          Math.min(bounds[0], px),
          Math.min(bounds[1], py),
          Math.max(bounds[2], px),
          Math.max(bounds[3], py),
        ]
      : [px, py, px, py];
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const at = (t: number, p0: number, p1: number, p2: number, p3: number) =>
      (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;

    for (const [p0, p1, p2, p3] of [
      [x, x1, x2, x3],
      [y, y1, y2, y3],
    ])
      for (const t of roots(p3 - 3 * p2 + 3 * p1 - p0, 2 * (p2 - 2 * p1 + p0), p1 - p0).filter(
        inside,
      ))
        include(at(t, x, x1, x2, x3), at(t, y, y1, y2, y3));

    include(x3, y3);
  };
  const quadratic = (x1: number, y1: number, x2: number, y2: number) => {
    const at = (t: number, p0: number, p1: number, p2: number) =>
      (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2;

    for (const [p0, p1, p2] of [
      [x, x1, x2],
      [y, y1, y2],
    ]) {
      const t = (p0 - p1) / (p0 - 2 * p1 + p2);

      if (inside(t)) include(at(t, x, x1, x2), at(t, y, y1, y2));
    }

    include(x2, y2);
  };

  for (const { command, args } of commands(data)) {
    const relative = command === command.toLowerCase() && command !== 'z';
    const dx = relative ? x : 0;
    const dy = relative ? y : 0;

    switch (command.toLowerCase()) {
      case 'm':
        [x, y] = [args[0] + dx, args[1] + dy];
        [startX, startY] = [x, y];
        control = null;
        include(x, y);
        continue;
      case 'l':
        [x, y] = [args[0] + dx, args[1] + dy];
        control = null;
        include(x, y);
        continue;
      case 'h':
        x = args[0] + dx;
        control = null;
        include(x, y);
        continue;
      case 'v':
        y = args[0] + dy;
        control = null;
        include(x, y);
        continue;
      case 'c': {
        const [x1, y1, x2, y2, x3, y3] = [
          args[0] + dx,
          args[1] + dy,
          args[2] + dx,
          args[3] + dy,
          args[4] + dx,
          args[5] + dy,
        ];

        cubic(x1, y1, x2, y2, x3, y3);
        control = { kind: 'cubic', x: x2, y: y2 };
        [x, y] = [x3, y3];
        continue;
      }
      case 's': {
        const [x1, y1]: [number, number] =
          control?.kind === 'cubic' ? [2 * x - control.x, 2 * y - control.y] : [x, y];
        const [x2, y2, x3, y3] = [args[0] + dx, args[1] + dy, args[2] + dx, args[3] + dy];

        cubic(x1, y1, x2, y2, x3, y3);
        control = { kind: 'cubic', x: x2, y: y2 };
        [x, y] = [x3, y3];
        continue;
      }
      case 'q': {
        const [x1, y1, x2, y2] = [args[0] + dx, args[1] + dy, args[2] + dx, args[3] + dy];

        quadratic(x1, y1, x2, y2);
        control = { kind: 'quadratic', x: x1, y: y1 };
        [x, y] = [x2, y2];
        continue;
      }
      case 't': {
        const [x1, y1]: [number, number] =
          control?.kind === 'quadratic' ? [2 * x - control.x, 2 * y - control.y] : [x, y];
        const [x2, y2] = [args[0] + dx, args[1] + dy];

        quadratic(x1, y1, x2, y2);
        control = { kind: 'quadratic', x: x1, y: y1 };
        [x, y] = [x2, y2];
        continue;
      }
      case 'a': {
        const [x2, y2] = [args[5] + dx, args[6] + dy];

        arc(x, y, args[0], args[1], args[2], args[3] === 1, args[4] === 1, x2, y2, include);
        control = null;
        [x, y] = [x2, y2];
        continue;
      }
      case 'z':
        [x, y] = [startX, startY];
        control = null;
    }
  }

  return bounds;
}

/**
 * An endpoint arc's extremes, through its center parameterization (SVG 1.1,
 * appendix F.6.5): the angles where x or y turns, within its sweep.
 */
function arc(
  x1: number,
  y1: number,
  rxGiven: number,
  ryGiven: number,
  degrees: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
  include: (x: number, y: number) => void,
) {
  include(x2, y2);

  let [rx, ry] = [Math.abs(rxGiven), Math.abs(ryGiven)];

  // A zero radius, or no distance to cover, is a straight line.
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return;

  const phi = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [mx, my] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const [px, py] = [cos * mx + sin * my, -sin * mx + cos * my];
  // Radii too small to reach the endpoint grow until they just do.
  const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry);

  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];

  const numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
  const denominator = rx * rx * py * py + ry * ry * px * px;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const [qx, qy] = [(factor * rx * py) / ry, (-factor * ry * px) / rx];
  const [cx, cy] = [cos * qx - sin * qy + (x1 + x2) / 2, sin * qx + cos * qy + (y1 + y2) / 2];
  const angle = (ux: number, uy: number) => Math.atan2(uy, ux);
  const start = angle((px - qx) / rx, (py - qy) / ry);
  let delta = angle((-px - qx) / rx, (-py - qy) / ry) - start;

  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;

  const point = (theta: number) =>
    include(
      cx + rx * cos * Math.cos(theta) - ry * sin * Math.sin(theta),
      cy + rx * sin * Math.cos(theta) + ry * cos * Math.sin(theta),
    );
  const within = (theta: number) => {
    // theta's turn measured from the start, in the sweep's direction.
    const turn =
      ((((theta - start) * Math.sign(delta)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    return turn < Math.abs(delta);
  };
  const turningX = Math.atan2(-ry * sin, rx * cos);
  const turningY = Math.atan2(ry * cos, rx * sin);

  for (const theta of [turningX, turningX + Math.PI, turningY, turningY + Math.PI])
    if (within(theta)) point(theta);
}
