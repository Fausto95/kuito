#include "UIKernel.h"
#include "check.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>

using kuito::bytecodeSourceHash;
using kuito::checkUIBundle;
using kuito::checkUIKernel;

namespace {
const std::string kHash = "30915022b224a4f4e3dc4d4efc557a4c98b72737";

/// A Hermes bytecode header as hermesc writes it: magic, version, then the
/// source's SHA-1.
std::string header(const std::string &hash) {
  std::string bytes = {'\xc6', '\x1f', '\xbc', '\x03', '\xc1', '\x03',
                       '\x19', '\x1f', '\x63', 0,      0,      0};
  for (std::size_t i = 0; i < hash.size(); i += 2)
    bytes += static_cast<char>(std::stoi(hash.substr(i, 2), nullptr, 16));
  return bytes + std::string(64, '\0');
}

using Check = void (*)(std::string_view, const std::string &);

std::string failure(const std::string &bytecode, const std::string &hash,
                    Check check = checkUIKernel) {
  try {
    check(bytecode, hash);
  } catch (const std::runtime_error &error) {
    return error.what();
  }
  return "";
}
} // namespace

int main(int argc, char **argv) {
  CHECK(bytecodeSourceHash(header(kHash)) == kHash);
  CHECK(failure(header(kHash), kHash).empty());

  // Another build's UI kernel: the message names both, and what to do.
  const auto other = std::string(40, 'a');
  const auto mismatch = failure(header(other), kHash);
  CHECK(mismatch.find(other) != std::string::npos);
  CHECK(mismatch.find(kHash) != std::string::npos);
  CHECK(mismatch.find("ui.hbc") != std::string::npos);
  CHECK(mismatch.find("rebuild") != std::string::npos);

  // Missing, cut short or source: not bytecode at all.
  CHECK(failure("", kHash).find("not Hermes bytecode") != std::string::npos);
  CHECK(
      failure(header(kHash).substr(0, 20), kHash).find("not Hermes bytecode") !=
      std::string::npos);
  CHECK(failure("globalThis.__kuitoUI = {};", kHash)
            .find("not Hermes bytecode") != std::string::npos);

  // The app's UI bundle, shipped beside app.hbc, is checked the same way and
  // named as itself.
  CHECK(failure(header(kHash), kHash, checkUIBundle).empty());
  const auto stale = failure(header(other), kHash, checkUIBundle);
  CHECK(stale.find("app-ui.hbc") != std::string::npos);
  CHECK(stale.find(other) != std::string::npos);
  CHECK(stale.find(kHash) != std::string::npos);
  CHECK(stale.find("rebuild") != std::string::npos);
  CHECK(failure("", kHash, checkUIBundle)
            .find("app-ui.hbc is not Hermes bytecode") != std::string::npos);

  // The pinned hermesc's own output, when the test has one.
  if (argc == 3) {
    std::ifstream file(argv[1], std::ios::binary);
    const std::string bytecode{std::istreambuf_iterator<char>(file),
                               std::istreambuf_iterator<char>()};
    CHECK(bytecodeSourceHash(bytecode) == argv[2]);
    CHECK(failure(bytecode, argv[2]).empty());
  }

  std::cout << "KUITO_UI_KERNEL_PASS\n";
  return 0;
}
