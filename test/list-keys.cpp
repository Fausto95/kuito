#include "ListKeys.h"
#include "check.h"
#include <iostream>
#include <string>
#include <vector>

using kuito::editKeys;
using kuito::KeyChange;
using kuito::KeyEdit;
using kuito::KeyEditError;
using Op = kuito::KeyEdit::Op;

namespace {

/// The keys `edits` leave, read off the order editKeys gives.
std::vector<std::string> edited(const std::vector<std::string> &keys,
                                const std::vector<KeyEdit> &edits) {
  std::vector<std::string> result;
  for (auto source : editKeys(keys, edits).order) {
    result.push_back(source >= 0 ? keys[source] : edits[~source].key);
  }
  return result;
}

/// The message an edit that does not fit throws, or "" when it fits.
std::string rejection(const std::vector<std::string> &keys,
                      const std::vector<KeyEdit> &edits) {
  try {
    editKeys(keys, edits);
  } catch (const KeyEditError &error) {
    return error.what();
  }
  return "";
}

} // namespace

namespace kuito {
bool operator==(const KeyChange &a, const KeyChange &b) {
  return a.op == b.op && a.from == b.from && a.to == b.to;
}
} // namespace kuito

int main() {
  // Each edit applies to the keys the edits before it left; a move's index
  // counts once the key has left its place.
  std::vector<std::string> keys{"a", "b", "c", "d"};
  std::vector<KeyEdit> edits{
      {Op::Remove, 1, "b"}, {Op::Move, 0, "d"}, {Op::Insert, 2, "e"}};
  auto result = editKeys(keys, edits);
  CHECK(result.order == std::vector<std::int32_t>{3, 0, ~2, 2});
  CHECK(edited(keys, edits) == std::vector<std::string>{"d", "a", "e", "c"});
  CHECK(result.changes == std::vector<KeyChange>{{Op::Remove, 1, -1},
                                                 {Op::Move, 2, 0},
                                                 {Op::Insert, -1, 2}});

  // The first keys are insertions at the end.
  CHECK(edited({}, {{Op::Insert, 0, "a"}, {Op::Insert, 1, "b"}}) ==
        std::vector<std::string>{"a", "b"});
  CHECK(editKeys({"a"}, {}).order == std::vector<std::int32_t>{0});

  // A key removed and inserted again in one diff is the inserted one.
  CHECK(editKeys({"a"}, {{Op::Remove, 0, "a"}, {Op::Insert, 0, "a"}}).order ==
        std::vector<std::int32_t>{~1});

  // An edit that does not fit throws, naming it.
  CHECK(rejection({"a"}, {{Op::Insert, 1, "b"}, {Op::Remove, 0, "x"}}) ==
        "cannot remove \"x\" at 0: the list's 2 keys do not have it there");
  CHECK(rejection({"a"}, {{Op::Remove, 1, "a"}}) ==
        "cannot remove \"a\" at 1: the list's 1 keys do not have it there");
  CHECK(rejection({"a"}, {{Op::Remove, -1, "a"}}) ==
        "cannot remove \"a\" at -1: the list's 1 keys do not have it there");
  CHECK(rejection({"a"}, {{Op::Move, 0, "x"}}) ==
        "cannot move \"x\" at 0: the list's 1 keys do not have it there");
  CHECK(rejection({"a"}, {{Op::Move, 1, "a"}}) ==
        "cannot move \"a\" at 1: the list has 0 keys");
  CHECK(rejection({"a"}, {{Op::Insert, 2, "b"}}) ==
        "cannot insert \"b\" at 2: the list has 1 keys");
  CHECK(rejection({"a"}, {{Op::Insert, -1, "b"}}) ==
        "cannot insert \"b\" at -1: the list has 1 keys");
  CHECK(rejection({"a", "b"}, {{Op::Remove, 0, "a"}, {Op::Move, 0, "a"}}) ==
        "cannot move \"a\" at 0: the list's 1 keys do not have it there");

  // Keys are unique: one the list has, or one inserted twice, is rejected.
  CHECK(rejection({"a"}, {{Op::Insert, 1, "a"}}) ==
        "expects unique keys: \"a\" is in the list already");
  CHECK(rejection({}, {{Op::Insert, 0, "a"}, {Op::Insert, 1, "a"}}) ==
        "expects unique keys: \"a\" is in the list already");

  // Keys compare as bytes: an embedded NUL is part of the key.
  CHECK(rejection({std::string("a\0b", 3)}, {{Op::Insert, 1, "a"}}).empty());

  std::cout << "KUITO_LIST_KEYS_PASS\n";
  return 0;
}
