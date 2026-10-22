const state = { count: 2 };

function increment() {
  state.count += 3;
}

increment();
if (state.count !== 5) throw new Error('KUITO_BYTECODE_PROBE_FAIL');
print('KUITO_BYTECODE_PROBE_PASS');
