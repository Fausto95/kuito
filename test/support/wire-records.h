// Batches for the C++ tests, written as src/runtime/wire.ts writes them.
#pragma once
#include "Mutation.h"
#include "Wire.h"
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace kuito::test {

/// Writes records as src/runtime/wire.ts does: little-endian, packed.
class Records {
public:
  Records& op(Op op) { return u8(static_cast<std::uint8_t>(op)); }
  Records& u8(std::uint8_t value) {
    bytes.push_back(value);
    return *this;
  }
  Records& u16(std::uint16_t value) {
    for (int shift = 0; shift < 16; shift += 8) bytes.push_back(static_cast<std::uint8_t>(value >> shift));
    return *this;
  }
  Records& u32(std::uint32_t value) {
    for (int shift = 0; shift < 32; shift += 8) bytes.push_back(static_cast<std::uint8_t>(value >> shift));
    return *this;
  }
  Records& f64(double value) {
    std::uint64_t bits;
    std::memcpy(&bits, &value, sizeof bits);
    for (int shift = 0; shift < 64; shift += 8) bytes.push_back(static_cast<std::uint8_t>(bits >> shift));
    return *this;
  }
  Records& text(std::string value) {
    strings.push_back(std::move(value));
    return u32(static_cast<std::uint32_t>(strings.size() - 1));
  }

  Records& create(std::uint32_t id, std::uint32_t parent, const char* kind, const char* label, bool flat = false) {
    return op(Op::Create).u32(id).u32(parent).text(kind).text(label).u8(flat ? 1 : 0);
  }
  Records& remove(std::uint32_t id) { return op(Op::Remove).u32(id); }
  Records& move(std::uint32_t id, std::uint32_t parent, std::uint32_t index) {
    return op(Op::Move).u32(id).u32(parent).u32(index);
  }
  Records& prop(std::uint32_t id, PropKey key) { return op(Op::Prop).u32(id).u16(static_cast<std::uint16_t>(key)); }
  Records& named(std::uint32_t id, const char* name) { return op(Op::Prop).u32(id).u16(0xffff).text(name); }
  /// One edit of a key diff, after the diff's tag and count.
  Records& edit(std::uint8_t edit, std::uint32_t index, const char* key) { return u8(edit).u32(index).text(key); }

  std::vector<Mutation> decode() const { return kuito::decodeBatch(bytes.data(), bytes.size(), strings); }

  std::vector<std::uint8_t> bytes;
  std::vector<std::string> strings;
};

// Value tags, as src/runtime/wire.ts writes them.
// Json (5) is only what recordings made before plain data hold.
constexpr std::uint8_t Null = 0, Number = 1, False = 2, True = 3, Text = 4, Json = 5, Keys = 6, Struct = 7,
                       List = 8;
// Key edits, as src/runtime/wire.ts writes them.
constexpr std::uint8_t Insert = 0, Remove = 1, MoveKey = 2;

} // namespace kuito::test
