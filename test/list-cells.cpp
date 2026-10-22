#include "ListCells.h"
#include "check.h"
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

using kuito::ListCells;

namespace {

/// The slot `key` shows in, as a renderer asks for it: the one holding it,
/// else one placed for it.
std::int32_t show(ListCells &cells, const std::string &key,
                  const std::vector<std::int32_t> &held = {}) {
  auto found = cells.find(key);
  return found >= 0 ? found : cells.place(key, held);
}

/// A list that has made `count` cells, for keys k0, k1, ..., each made while
/// the ones before it were on screen.
ListCells made(std::size_t count) {
  ListCells cells("list");
  std::vector<std::int32_t> held;
  for (std::size_t n = 0; n < count; ++n)
    held.push_back(show(cells, "k" + std::to_string(n), held));
  return cells;
}

/// Whether placing `key` made a cell rather than reusing one.
bool makes(ListCells &cells, const std::string &key,
           const std::vector<std::int32_t> &held = {}) {
  auto before = cells.count();
  cells.place(key, held);
  return cells.count() == before + 1;
}

} // namespace

int main() {
  constexpr auto spares = ListCells::spares;

  // A new key takes a new cell, named after the list; a key keeps its cell.
  {
    ListCells cells("list");
    auto a = cells.place("a", {});
    CHECK(cells.id(a) == "list:cell-0");
    CHECK(cells.key(a) == std::string("a"));
    CHECK(cells.find("a") == a);
    CHECK(cells.find("b") == -1);
    CHECK(cells.id(cells.place("b", {})) == "list:cell-1");
    CHECK(cells.count() == 2);
  }

  // Below the window's cells and the spares, every new key makes a cell.
  {
    auto cells = made(spares - 1);
    CHECK(makes(cells, "new"));
    CHECK(!makes(cells, "newer"));
  }

  // Past them, a new key takes the least recently used cell and its key goes.
  {
    auto cells = made(spares);
    cells.find("k0");
    auto slot = cells.place("new", {});
    CHECK(cells.id(slot) == "list:cell-1");
    CHECK(cells.key(slot) == std::string("new"));
    CHECK(cells.find("k1") == -1);
    CHECK(cells.count() == spares);
  }

  // A cell on screen, or showing a key the window renders, is not reused.
  {
    auto cells = made(spares + 1);
    cells.setWindow({"k0"});
    CHECK(cells.id(cells.place("new", {cells.find("k1")})) == "list:cell-2");
  }

  // With every cell held, a new one is made.
  {
    auto cells = made(spares);
    std::vector<std::int32_t> held;
    for (std::size_t n = 0; n < spares; ++n)
      held.push_back(cells.find("k" + std::to_string(n)));
    CHECK(makes(cells, "new", held));
  }

  // The window's own cells count: a list rendering many keys keeps spares
  // beyond them.
  {
    auto cells = made(spares + 2);
    cells.setWindow({"k0", "k1", "k2"});
    CHECK(makes(cells, "new"));
  }

  // Placing a key a slot holds is a renderer's mistake.
  {
    ListCells cells("list");
    cells.place("a", {});
    bool threw = false;
    try {
      cells.place("a", {});
    } catch (const std::invalid_argument &) {
      threw = true;
    }
    CHECK(threw);
  }

  // JavaScript's cell joins the slot the list named, or (after a reconnect)
  // makes one; new names skip it.
  {
    ListCells cells("list");
    auto named = cells.place("a", {});
    CHECK(cells.adopt("list:cell-0") == named);

    auto replayed = cells.adopt("list:cell-1");
    CHECK(replayed != named && cells.count() == 2);
    CHECK(cells.id(replayed) == "list:cell-1");
    CHECK(!cells.key(replayed));
    CHECK(cells.id(cells.place("b", {})) == "list:cell-2");
  }

  // A replayed cell joins with the key it shows, unless another holds that
  // key or it has one.
  {
    ListCells cells("list");
    auto a = cells.place("a", {});
    auto replayed = cells.adopt("list:cell-9");
    CHECK(!cells.join(replayed, "a"));
    CHECK(!cells.key(replayed));
    CHECK(cells.join(replayed, "b"));
    CHECK(cells.find("b") == replayed);
    CHECK(!cells.join(a, "c"));
    CHECK(cells.find("c") == -1);
  }

  // A removed cell's key and name go with it, and its number is not reused.
  {
    ListCells cells("list");
    auto a = cells.place("a", {});
    cells.remove(a);
    CHECK(cells.count() == 0);
    CHECK(cells.find("a") == -1);
    CHECK(cells.adopt("list:cell-0") != a);
  }

  // A removed cell no longer counts toward the spares.
  {
    auto cells = made(spares + 1);
    cells.remove(cells.find("k0"));
    CHECK(!makes(cells, "new"));
    CHECK(cells.count() == spares);
  }

  std::cout << "KUITO_LIST_CELLS_PASS\n";
  return 0;
}
