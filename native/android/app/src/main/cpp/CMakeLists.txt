cmake_minimum_required(VERSION 3.22)
project(kuito_mobile LANGUAGES CXX)

# The C++ every layout pass and touch runs (native/ios/project.yml lists the same).
set(KUITO_FRAME_PATH_SOURCES
  ../../../../../shared/UIRuntime.cpp
  ../../../../../shared/ViewTable.cpp
  ../../../../../shared/layout/FlexLayout.cpp
  ../../../../../shared/layout/Flexbox.cpp
  ../../../../../shared/layout/Absolute.cpp
  ../../../../../shared/layout/Balance.cpp
  ../../../../../shared/layout/KuitoLayoutStyle.cpp
  ../../../../../shared/gestures/GestureRelations.cpp
  ../../../../../shared/gestures/GestureArbiter.cpp
  ../../../../../shared/gestures/GestureEvents.cpp)

add_library(kuito_mobile SHARED
  KuitoJNI.cpp
  KuitoLayoutJNI.cpp
  KuitoInspectorJNI.cpp
  KuitoImageJNI.cpp
  KuitoGesturesJNI.cpp
  KuitoPathDataJNI.cpp
  KuitoListCellsJNI.cpp
  KuitoListKeysJNI.cpp
  KuitoFrameLedgerJNI.cpp
  KuitoAblationJNI.cpp
  ../../../../../shared/KuitoRuntime.cpp
  ../../../../../shared/Http.cpp
  ../../../../../shared/Standard.cpp
  ../../../../../shared/Socket.cpp
  ../../../../../shared/Inspector.cpp
  ${KUITO_FRAME_PATH_SOURCES})
target_compile_features(kuito_mobile PRIVATE cxx_std_17)

# -O2 in every build type: at a Debug build's -O0 the engine's share of a
# layout pass is many times what users get. A source's options come after
# the build type's flags, so they win. KUITO_NATIVE_DEBUG, which the CLI sets
# from the environment (docs/performance.md#native-optimization), leaves them at
# the build type's level to step through in a debugger.
if(NOT KUITO_NATIVE_DEBUG)
  set_source_files_properties(${KUITO_FRAME_PATH_SOURCES} PROPERTIES COMPILE_OPTIONS -O2)
endif()
target_include_directories(kuito_mobile PRIVATE ../../../../../shared)
find_package(hermes-engine REQUIRED CONFIG)

# libhermesvm.so needs a libjsi.so and leaves it out of its AAR, so we build it from
# JSI's sources. jsi/ is Hermes's API/jsi at the commit jsi/jsi/VERSION names: keep it
# at native/hermes.json's release or the ABI Hermes was built against drifts. VERSION
# stays out of the include root, where it would shadow <version> on macOS.
add_library(jsi SHARED jsi/jsi/jsi.cpp)
target_compile_features(jsi PRIVATE cxx_std_17)
target_compile_options(jsi PRIVATE -Wno-non-virtual-dtor)
target_include_directories(jsi PUBLIC jsi)

target_link_libraries(kuito_mobile PRIVATE hermes-engine::hermesvm jsi android log)

# Hermes's CDP agent for Chrome DevTools (docs/devtools.md). hermes-android's
# debug AAR is built with the debugger, which changes its headers' layout; the
# release AAR has no debugger, so release builds compile none of the inspector.
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  target_compile_definitions(kuito_mobile PRIVATE KUITO_INSPECTOR=1 HERMES_ENABLE_DEBUGGER=1)
  # Cost replay for the renderer tests (docs/devtools.md#cost-replay).
  target_sources(kuito_mobile PRIVATE KuitoReplayJNI.cpp)
endif()
