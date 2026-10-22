function add(a, b) {
  return a + b;
}

if (add(20, 22) !== 42) throw new Error('KUITO_AOT_PROBE_FAIL');
print('KUITO_AOT_PROBE_PASS');
