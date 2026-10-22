#pragma once
// The link table's side of the host boundary (docs/native-modules.md): a
// module function is called by its id, its arguments cross as values typed by
// the function's signature, and only a failure carries a code and a message.
// No JSI here: the platforms' bridges convert these to their own types.
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <variant>
#include <vector>

namespace kuito {

/// Bytes an ArrayBuffer holds, in memory the platform owns: one it made
/// crosses to JavaScript as an ArrayBuffer without a copy, and back the same
/// way. Released on whichever thread lets it go last: the garbage collector
/// may free an ArrayBuffer on a thread of its own.
struct LinkBuffer {
  virtual ~LinkBuffer() = default;
  virtual std::uint8_t* data() = 0;
  virtual std::size_t size() const = 0;
};

/// Memory for `size` bytes JavaScript made, which the platform will own.
using LinkAllocate = std::function<std::shared_ptr<LinkBuffer>(std::size_t size)>;

/// Bytes in C++ memory: where a platform without an allocator gets them.
class LinkBytes final : public LinkBuffer {
public:
  explicit LinkBytes(std::size_t size) : bytes_(size) {}
  std::uint8_t* data() override { return bytes_.data(); }
  std::size_t size() const override { return bytes_.size(); }

private:
  std::vector<std::uint8_t> bytes_;
};

/// A value as it crosses: null, a boolean, a number, a string, bytes, a list,
/// or entries keyed by string. A spec's struct is a list of its fields in the
/// order the spec declares them, an absent one null; its names are in the
/// function's signature, never on the value.
struct LinkValue {
  enum class Kind : unsigned char { Null, Boolean, Number, Text, Bytes, List, Entries };
  Kind kind = Kind::Null;
  bool flag = false;
  double number = 0;
  std::string text;
  std::shared_ptr<LinkBuffer> bytes;
  /// A list's items, or the entries' values.
  std::vector<LinkValue> items;
  /// The entries' keys: `keys[i]` names `items[i]`.
  std::vector<std::string> keys;

  static LinkValue boolean(bool flag) {
    LinkValue value;
    value.kind = Kind::Boolean;
    value.flag = flag;
    return value;
  }

  static LinkValue numeric(double number) {
    LinkValue value;
    value.kind = Kind::Number;
    value.number = number;
    return value;
  }

  static LinkValue string(std::string text) {
    LinkValue value;
    value.kind = Kind::Text;
    value.text = std::move(text);
    return value;
  }

  static LinkValue buffer(std::shared_ptr<LinkBuffer> bytes) {
    if (!bytes) throw std::invalid_argument("Link bytes need a buffer");
    LinkValue value;
    value.kind = Kind::Bytes;
    value.bytes = std::move(bytes);
    return value;
  }

  static LinkValue list(std::vector<LinkValue> items) {
    LinkValue value;
    value.kind = Kind::List;
    value.items = std::move(items);
    return value;
  }

  static LinkValue entries(std::vector<std::string> keys, std::vector<LinkValue> items) {
    if (keys.size() != items.size()) throw std::invalid_argument("Link entries need one key per value");
    LinkValue value;
    value.kind = Kind::Entries;
    value.keys = std::move(keys);
    value.items = std::move(items);
    return value;
  }
};

/// A field of a spec's struct: its name and whether it may be left out.
struct LinkField {
  std::string name;
  bool optional = false;
};

/// A spec type as the generated link table writes it (src/cli/link-signature.ts).
struct LinkType {
  enum class Kind : unsigned char {
    Null,
    Number,
    Text,
    Boolean,
    Json,
    Bytes,
    Enum,
    Nullable,
    Array,
    Record,
    Struct,
    Reference
  };
  Kind kind = Kind::Null;
  /// Nullable, Array and Record: the one type they hold. Struct: each field's, in order.
  std::vector<LinkType> of;
  /// Struct: `fields[i]` names `of[i]`.
  std::vector<LinkField> fields;
  /// Reference: a struct that contains itself, held by its signature's `named`.
  const LinkType* target = nullptr;
};

/// A function's argument types and its result's; an observed member's result
/// is what it sends. Not copyable: references point into `named`, whose
/// entries a move keeps in place.
struct LinkSignature {
  LinkSignature() = default;
  LinkSignature(const LinkSignature&) = delete;
  LinkSignature& operator=(const LinkSignature&) = delete;
  LinkSignature(LinkSignature&&) = default;
  LinkSignature& operator=(LinkSignature&&) = default;

  std::vector<LinkType> arguments;
  LinkType result;
  /// The structs that contain themselves, by name.
  std::unordered_map<std::string, LinkType> named;
};

namespace link {

class SignatureParser {
public:
  explicit SignatureParser(const std::string& text) : text_(text) {}

  LinkSignature signature() {
    expect('(');
    if (!take(')')) {
      do parsed_.arguments.push_back(type());
      while (take(','));
      expect(')');
    }
    parsed_.result = type();
    if (at_ != text_.size()) fail("ends after the result");
    return std::move(parsed_);
  }

private:
  LinkType type() {
    LinkType parsed;
    const char c = next();
    switch (c) {
    case '_': parsed.kind = LinkType::Kind::Null; return parsed;
    case 'n': parsed.kind = LinkType::Kind::Number; return parsed;
    case 's': parsed.kind = LinkType::Kind::Text; return parsed;
    case 'b': parsed.kind = LinkType::Kind::Boolean; return parsed;
    case 'j': parsed.kind = LinkType::Kind::Json; return parsed;
    case 'x': parsed.kind = LinkType::Kind::Bytes; return parsed;
    case 'e': parsed.kind = LinkType::Kind::Enum; return parsed;
    case '?': return wrapping(LinkType::Kind::Nullable);
    case '[': return wrapping(LinkType::Kind::Array);
    case '%': return wrapping(LinkType::Kind::Record);
    case '{': return structure();
    case '=': {
      // A struct that contains itself: defined once, by name, where it first appears.
      auto label = name();
      if (parsed_.named.count(label)) fail("defines " + label + " twice");
      auto& slot = parsed_.named[label];
      expect('{');
      slot = structure();
      return reference(slot);
    }
    case '^': {
      auto found = parsed_.named.find(name());
      if (found == parsed_.named.end()) fail("refers to a struct it does not define");
      return reference(found->second);
    }
    default: fail(std::string("has no type '") + c + "'");
    }
  }

  LinkType structure() {
    LinkType parsed;
    parsed.kind = LinkType::Kind::Struct;
    if (take('}')) return parsed;
    do {
      LinkField field;
      field.name = name();
      field.optional = take('?');
      expect(':');
      parsed.fields.push_back(std::move(field));
      parsed.of.push_back(type());
    } while (take(','));
    expect('}');
    return parsed;
  }

  static LinkType reference(const LinkType& target) {
    LinkType parsed;
    parsed.kind = LinkType::Kind::Reference;
    parsed.target = &target;
    return parsed;
  }

  LinkType wrapping(LinkType::Kind kind) {
    LinkType parsed;
    parsed.kind = kind;
    parsed.of.push_back(type());
    return parsed;
  }

  std::string name() {
    const auto start = at_;
    while (at_ < text_.size() &&
           (std::isalnum(static_cast<unsigned char>(text_[at_])) || text_[at_] == '_' || text_[at_] == '$'))
      ++at_;
    if (at_ == start) fail("needs a field name");
    return text_.substr(start, at_ - start);
  }

  char next() {
    if (at_ == text_.size()) fail("ends early");
    return text_[at_++];
  }

  bool take(char c) {
    if (at_ < text_.size() && text_[at_] == c) {
      ++at_;
      return true;
    }
    return false;
  }

  void expect(char c) {
    if (!take(c)) fail(std::string("needs '") + c + "'");
  }

  [[noreturn]] void fail(const std::string& what) const {
    throw std::invalid_argument("The link signature " + text_ + " " + what + " at " + std::to_string(at_));
  }

  const std::string& text_;
  std::size_t at_ = 0;
  LinkSignature parsed_;
};

} // namespace link

/// `text`, a signature the generated link table holds: `(s,[j){columns:[s,rows:[[j}`,
/// or with a struct that contains itself, `()=Node{name:s,children:[^Node}`.
inline LinkSignature parseLinkSignature(const std::string& text) { return link::SignatureParser(text).signature(); }

/// A value that does not match its type, or cannot cross: the call fails with `code`.
struct LinkMismatch : std::runtime_error {
  LinkMismatch(std::string code, const std::string& message) : std::runtime_error(message), code(std::move(code)) {}
  std::string code;
};

/// A call that failed: the error's code and message.
struct LinkFailure {
  std::string code;
  std::string message;
};

using LinkResult = std::variant<LinkValue, LinkFailure>;

/// The platform's link table. `call` runs a `js` function on the VM thread
/// and returns its result; `callAsync` returns at once, and the platform later
/// hands the result to `Runtime::settleLinkCall` on the VM thread. `observe`
/// starts or stops an event or a live value, whose values the platform hands
/// to `Runtime::emitLinkEvent` on the VM thread. `signature` is a member's
/// signature as its generated entry writes it, empty for one this shell does
/// not link.
struct LinkHost {
  std::function<LinkResult(int function, std::vector<LinkValue> arguments)> call;
  std::function<void(int function, int call, std::vector<LinkValue> arguments)> callAsync;
  std::function<void(int member, bool observing)> observe;
  std::function<std::string(int member)> signature;
  /// Optional: where bytes JavaScript made are copied to; C++ memory without it.
  LinkAllocate allocate;

  explicit operator bool() const { return call && callAsync && observe && signature; }
};

/// One runtime's signatures, each parsed the first time its member crosses.
/// Read on that runtime's thread only.
class LinkSignatures {
public:
  explicit LinkSignatures(std::function<std::string(int member)> source = {}) : source_(std::move(source)) {}

  /// `member`'s signature, or nullptr when the shell does not link it.
  const LinkSignature* find(int member) {
    auto found = cache_.find(member);
    if (found == cache_.end()) {
      auto text = source_ ? source_(member) : std::string();
      std::optional<LinkSignature> parsed;
      if (!text.empty()) parsed = parseLinkSignature(text);
      found = cache_.emplace(member, std::move(parsed)).first;
    }
    return found->second ? &*found->second : nullptr;
  }

private:
  std::function<std::string(int member)> source_;
  std::unordered_map<int, std::optional<LinkSignature>> cache_;
};

} // namespace kuito
