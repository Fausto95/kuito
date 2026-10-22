// CHECK(condition): a C++ test assertion. Unlike assert(), -DNDEBUG does not
// compile it away, so a test built with release flags still checks.
#pragma once
#include <cstdio>
#include <cstdlib>

#define CHECK(...)                                                                                 \
  do {                                                                                             \
    if (!(__VA_ARGS__)) {                                                                          \
      std::fprintf(stderr, "%s:%d: CHECK(%s) failed\n", __FILE__, __LINE__, #__VA_ARGS__);        \
      std::abort();                                                                                \
    }                                                                                              \
  } while (false)
