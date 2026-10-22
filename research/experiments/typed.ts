// Direct typed-input probe: intentionally uses a very small supported-looking subset.
// No Oxc type stripping before invoking shermes -parse-ts.
function add(left: number, right: number): number {
  return left + right;
}

const result: number = add(20, 22);

if (result !== 42) {
  throw new Error('KUITO_TYPED_PROBE_FAIL');
}

print('KUITO_TYPED_PROBE_PASS');
