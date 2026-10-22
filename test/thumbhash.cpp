// Prints what native/shared/ThumbHash.h makes of each argument: `invalid`, or
// the preview's width, height and RGBA bytes on one line. test/thumbhash.test.ts
// compares them with the reference decoder's.
#include "ThumbHash.h"
#include <cstdio>

int main(int argc, char** argv) {
  for (int i = 1; i < argc; i++) {
    auto hash = kuito::ThumbHash::parse(argv[i]);

    if (!hash) {
      std::printf("invalid\n");
      continue;
    }

    auto preview = hash->decode();

    std::printf("%d %d", preview.width, preview.height);
    for (auto byte : preview.rgba) std::printf(" %d", byte);
    std::printf("\n");
  }
  return 0;
}
