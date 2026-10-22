#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

namespace kuito {

// The UI kernel ships as Hermes bytecode, ui.hbc, beside the kernel's
// bootstrap.hbc, and a release build's UI bundle as app-ui.hbc beside the
// app's app.hbc. The script that loads each names it by the SHA-1 of its
// source (src/dev/kernel.ts, src/dev/compiler.ts), which hermesc writes into
// the bytecode's header: checking it needs no hashing on the device.

/// Hermes's BytecodeFileHeader: a 64-bit magic and a 32-bit version, then the
/// SHA-1 of the source. test/ui-kernel.test.ts holds this to the pinned hermesc.
inline constexpr std::uint64_t kHermesBytecodeMagic = 0x1F1903C103BC1FC6;
inline constexpr std::size_t kSourceHashOffset = 12;
inline constexpr std::size_t kSourceHashSize = 20;

/// The SHA-1 of the source `bytecode` was compiled from, as lowercase hex;
/// none for anything but Hermes bytecode.
inline std::optional<std::string> bytecodeSourceHash(std::string_view bytecode) {
  std::uint64_t magic = 0;
  if (bytecode.size() >= kSourceHashOffset + kSourceHashSize)
    for (std::size_t i = 0; i < sizeof magic; ++i)
      magic |= static_cast<std::uint64_t>(static_cast<unsigned char>(bytecode[i])) << (8 * i);
  if (magic != kHermesBytecodeMagic) return std::nullopt;
  static constexpr char kDigits[] = "0123456789abcdef";
  std::string hash;
  for (std::size_t i = kSourceHashOffset; i < kSourceHashOffset + kSourceHashSize; ++i) {
    const auto byte = static_cast<unsigned char>(bytecode[i]);
    hash += kDigits[byte >> 4];
    hash += kDigits[byte & 0xf];
  }
  return hash;
}

/// A UI-thread script a shell ships as bytecode, and the script that names it.
struct ShippedScript {
  const char* file;
  const char* what;
  const char* namer;
  const char* beside;
};

inline constexpr ShippedScript kShippedUIKernel{"ui.hbc", "UI kernel", "the kernel", "bootstrap.hbc"};
inline constexpr ShippedScript kShippedUIBundle{"app-ui.hbc", "UI bundle", "the app", "app.hbc"};

/// Throws std::runtime_error, naming both builds, unless `bytecode` is the
/// `script` its namer was built with, by `hash`.
inline void checkShipped(const ShippedScript& script, std::string_view bytecode, const std::string& hash) {
  const auto shipped = bytecodeSourceHash(bytecode);
  if (!shipped)
    throw std::runtime_error(std::string(script.file) + " is not Hermes bytecode (" + std::to_string(bytecode.size()) +
                             " bytes): rebuild the app, which ships the " + script.what + " beside " + script.beside);
  if (*shipped != hash)
    throw std::runtime_error(std::string(script.file) + " is " + script.what + " " + *shipped + ", but " +
                             script.namer + " was built with " + script.what + " " + hash +
                             ": they come from one build, so rebuild the app or ship both in one update");
}

inline void checkUIKernel(std::string_view bytecode, const std::string& hash) {
  checkShipped(kShippedUIKernel, bytecode, hash);
}

inline void checkUIBundle(std::string_view bytecode, const std::string& hash) {
  checkShipped(kShippedUIBundle, bytecode, hash);
}

} // namespace kuito
