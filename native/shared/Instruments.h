#pragma once
// Whether this build counts its main-thread work (docs/performance.md#cost-counters).
// On in development builds, where iOS's Debug defines DEBUG and both shells'
// debug builds define KUITO_INSPECTOR, and on the headless host; release
// shells define neither, so the counting compiles out. A build that wants
// it either way defines KUITO_INSTRUMENTS itself.
#ifndef KUITO_INSTRUMENTS
#if (defined(DEBUG) && DEBUG) || (defined(KUITO_INSPECTOR) && KUITO_INSPECTOR) || defined(__wasm__)
#define KUITO_INSTRUMENTS 1
#else
#define KUITO_INSTRUMENTS 0
#endif
#endif
