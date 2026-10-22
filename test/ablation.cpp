// Ablation.h: the switchboard KUITO_ABLATE describes, what an elided or
// slowed subsystem does, and what a setting that does not read says.
#include "Ablation.h"
#include "check.h"
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>

using kuito::Ablation;
using kuito::Subsystem;

namespace {

std::string failure(const std::string& spec) {
  try {
    Ablation::parse(spec);
  } catch (const std::invalid_argument& error) { return error.what(); }
  return "";
}

void reading() {
  const Ablation ablation = Ablation::parse("layout:elide,uiEvent:slow4,measure:slow0.5");
  CHECK(ablation.any());
  CHECK(ablation[Subsystem::Layout].elide && ablation[Subsystem::Layout].slowMs == 0);
  CHECK(!ablation[Subsystem::UIEvent].elide && ablation[Subsystem::UIEvent].slowMs == 4);
  CHECK(ablation[Subsystem::Measure].slowMs == 0.5);
  CHECK(!ablation[Subsystem::UIFrame].elide && ablation[Subsystem::UIFrame].slowMs == 0);
  CHECK(ablation.describe() == "layout:elide,measure:slow0.5,uiEvent:slow4");

  CHECK(!Ablation::parse("").any());
  CHECK(failure("layout") == "KUITO_ABLATE: layout has no :elide or :slow<ms>");
  CHECK(failure("paint:elide").find("no subsystem is named paint") != std::string::npos);
  CHECK(failure("layout:fast") == "KUITO_ABLATE: fast is neither elide nor slow<ms>");
  CHECK(failure("layout:slowx") == "KUITO_ABLATE: slowx is not slow<ms>");
  CHECK(failure("applyBatch:elide") == "KUITO_ABLATE: applyBatch can be slowed, not elided");
}

void toggling() {
  const Ablation ablation = Ablation::parse("labelRedraw:elide,uiFrame:slow5");
  int ran = 0;
  CHECK(!kuito::ablated(ablation, Subsystem::LabelRedraw, [&] { return ++ran > 0; }, [] { return false; }));
  CHECK(ran == 0);
  CHECK(kuito::ablated(ablation, Subsystem::Layout, [&] { return ++ran > 0; }, [] { return false; }));
  CHECK(ran == 1);

  const auto started = std::chrono::steady_clock::now();
  kuito::ablated(ablation, Subsystem::UIFrame, [&] { ++ran; }, [] {});
  CHECK(std::chrono::steady_clock::now() - started >= std::chrono::milliseconds(5));
  CHECK(ran == 2);
}

} // namespace

int main() {
  reading();
  toggling();
  std::cout << "KUITO_ABLATION_PASS\n";
  return 0;
}
