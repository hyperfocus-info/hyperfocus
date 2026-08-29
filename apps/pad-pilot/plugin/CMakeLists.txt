cmake_minimum_required(VERSION 3.25)

project(PadPilot VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_WARN_DEPRECATED OFF CACHE BOOL "Suppress CMake deprecation warnings from fetched dependencies" FORCE)
set(CMAKE_SUPPRESS_DEVELOPER_WARNINGS 1 CACHE INTERNAL "Suppress CMake developer warnings from fetched dependencies")

if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

include(cmake/pad-pilot-options.cmake)
include(cmake/dependencies.cmake)

padpilot_fetch_dependencies()

add_executable(padpilot-updater
  updater/padpilot-updater-main.cpp
  updater/plugin-update-security.cpp
)

target_link_libraries(padpilot-updater
  PRIVATE
    juce::juce_core
    shell32
)

if(PADPILOT_ENABLE_TESTS)
  add_executable(padpilot-updater-tests
    updater/padpilot-updater-tests-main.cpp
    updater/plugin-update-security.cpp
    updater/plugin-update-utils.cpp
  )

  add_executable(padpilot-native-tests
    audio/convolver-module-graph.cpp
    audio/convolver-node.cpp
    audio/delay-node.cpp
    audio/modulation-node.cpp
    audio/parametric-eq-node.cpp
    audio/reverb-node.cpp
    audio/reverse-node.cpp
    runtime/padpilot-native-tests-main.cpp
    runtime/backend-log.cpp
    runtime/controller-config.cpp
    runtime/module-store.cpp
    runtime/managed-file-store.cpp
    runtime/preset-store.cpp
    runtime/storage-path-safety.cpp
    runtime/plugin-state-wire.cpp
    runtime/web-navigation-policy.cpp
    runtime/keystroke-sender.cpp
    runtime/quick-js-host.cpp
    runtime/script-host.cpp
    runtime/fx-chain-proto.cpp
    runtime/fx-graph-native-tests.cpp
    runtime/analyzer-proto.cpp
    runtime/analyzer-runtime.cpp
    runtime/recut-proto.cpp
    runtime/recut-runtime.cpp
    runtime/sample-capability-proto.cpp
    generated/proto/analyzer.pb.cc
    generated/proto/capability.pb.cc
    generated/proto/bridge.pb.cc
    generated/proto/fx-chain.pb.cc
    generated/proto/recut.pb.cc
  )

  target_include_directories(padpilot-updater-tests
    PRIVATE
      ${CMAKE_CURRENT_SOURCE_DIR}
  )

  target_include_directories(padpilot-native-tests
    PRIVATE
      ${CMAKE_CURRENT_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/generated/proto
  )

  target_link_libraries(padpilot-updater-tests
    PRIVATE
      juce::juce_core
      juce::juce_cryptography
      juce::juce_events
      crypt32
      bcrypt
  )

  target_link_libraries(padpilot-native-tests
    PRIVATE
      juce::juce_core
      juce::juce_cryptography
      juce::juce_audio_formats
      juce::juce_audio_processors
      juce::juce_dsp
      protobuf::libprotobuf-lite
      qjs
      crypt32
      bcrypt
      user32
  )

  if(MSVC)
    target_compile_options(padpilot-native-tests PRIVATE /wd4324 /external:W0)
    set_source_files_properties(
      generated/proto/analyzer.pb.cc
      generated/proto/capability.pb.cc
      generated/proto/bridge.pb.cc
      generated/proto/fx-chain.pb.cc
      generated/proto/recut.pb.cc
      PROPERTIES
        COMPILE_OPTIONS "/wd4267;/wd5054"
    )
  endif()
endif()

juce_add_plugin(PadPilot
  COMPANY_NAME "Hyperfocus"
  BUNDLE_ID "com.hyperfocus.padpilot"
  PLUGIN_MANUFACTURER_CODE "PdPl"
  PLUGIN_CODE "Pp01"
  FORMATS VST3 Standalone
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT TRUE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE
  PRODUCT_NAME "PadPilot"
)

if(WIN32 AND DEFINED BUN_EXECUTABLE AND BUN_EXECUTABLE MATCHES "[/\\\\]Temp[/\\\\]bun-node-[^/\\\\]+[/\\\\]bun\\.exe$")
  unset(BUN_EXECUTABLE CACHE)
  unset(BUN_EXECUTABLE)
endif()

if(WIN32)
  find_program(BUN_EXECUTABLE NAMES bun.cmd bun.exe bun)
else()
  find_program(BUN_EXECUTABLE NAMES bun)
endif()
if(BUN_EXECUTABLE)
  set(PADPILOT_EMBEDDED_UI_DIR "${CMAKE_CURRENT_BINARY_DIR}/embedded-ui")
  set(PADPILOT_EMBEDDED_UI_INDEX "${PADPILOT_EMBEDDED_UI_DIR}/index.html")
  set(PADPILOT_EMBEDDED_UI_MAIN "${PADPILOT_EMBEDDED_UI_DIR}/main.js")
  set(PADPILOT_EMBEDDED_UI_CSS "${PADPILOT_EMBEDDED_UI_DIR}/main.css")
  file(GLOB_RECURSE PADPILOT_UI_BUILD_INPUTS CONFIGURE_DEPENDS LIST_DIRECTORIES false
    "${CMAKE_CURRENT_SOURCE_DIR}/../ui/src/*"
    "${CMAKE_CURRENT_SOURCE_DIR}/../ui/public/*"
    "${CMAKE_CURRENT_SOURCE_DIR}/../utils/*"
  )
  list(APPEND PADPILOT_UI_BUILD_INPUTS
    "${CMAKE_CURRENT_SOURCE_DIR}/../ui/index.html"
    "${CMAKE_CURRENT_SOURCE_DIR}/../bunfig.toml"
    "${CMAKE_CURRENT_SOURCE_DIR}/../package.json"
    "${CMAKE_CURRENT_SOURCE_DIR}/../bun.lock"
    "${CMAKE_CURRENT_SOURCE_DIR}/../tsconfig.base.json"
    "${CMAKE_CURRENT_SOURCE_DIR}/../tsconfig.json"
    "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/build-ui.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/bounded-file.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/directory-snapshot.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/directory-transaction.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/ui-build-contract.ts"
  )
  add_custom_command(
    OUTPUT "${PADPILOT_EMBEDDED_UI_INDEX}" "${PADPILOT_EMBEDDED_UI_MAIN}" "${PADPILOT_EMBEDDED_UI_CSS}"
    COMMAND ${BUN_EXECUTABLE} run "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/build-ui.ts"
      --embedded
      --output-directory "${PADPILOT_EMBEDDED_UI_DIR}"
      "$<$<CONFIG:Release>:--minify>"
    DEPENDS ${PADPILOT_UI_BUILD_INPUTS}
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/.."
    COMMENT "Building UI assets with Bun"
    VERBATIM
  )
  add_custom_target(BuildUI DEPENDS
    "${PADPILOT_EMBEDDED_UI_INDEX}"
    "${PADPILOT_EMBEDDED_UI_MAIN}"
    "${PADPILOT_EMBEDDED_UI_CSS}"
  )
else()
  message(FATAL_ERROR "Bun is required to build PadPilot's embedded UI.")
endif()

juce_generate_juce_header(PadPilot)

file(GLOB_RECURSE PADPILOT_UI_PUBLIC_FILES CONFIGURE_DEPENDS LIST_DIRECTORIES false
  "${CMAKE_CURRENT_SOURCE_DIR}/../ui/public/*"
)

juce_add_binary_data(PadPilotAssets
  SOURCES
    ../ui/index.html
    "${PADPILOT_EMBEDDED_UI_MAIN}"
    "${PADPILOT_EMBEDDED_UI_CSS}"
    ${PADPILOT_UI_PUBLIC_FILES}
)

add_dependencies(PadPilotAssets BuildUI)

target_sources(PadPilot
  PRIVATE
    audio/convolver-module-graph.cpp
    audio/convolver-node.cpp
    audio/delay-node.cpp
    audio/modulation-node.cpp
    audio/parametric-eq-node.cpp
    audio/reverb-node.cpp
    audio/reverse-node.cpp
    generated/proto/analyzer.pb.cc
    generated/proto/capability.pb.cc
    generated/proto/bridge.pb.cc
    generated/proto/fx-chain.pb.cc
    generated/proto/recut.pb.cc
    core/pad-pilot-editor-analyzer.cpp
    core/pad-pilot-editor-bridge.cpp
    core/pad-pilot-editor-file-import.cpp
    core/pad-pilot-editor-internal.cpp
    core/pad-pilot-editor.cpp
    core/pad-pilot-processor.cpp
    core/pad-pilot-processor-automation.cpp
    core/pad-pilot-processor-bridge.cpp
    core/pad-pilot-processor-internal.cpp
    core/pad-pilot-processor-modules.cpp
    core/pad-pilot-processor-persistence.cpp
    core/pad-pilot-processor-runtime.cpp
    updater/plugin-update-security.cpp
    updater/plugin-update-utils.cpp
    runtime/analyzer-proto.cpp
    runtime/analyzer-runtime.cpp
    runtime/backend-log.cpp
    runtime/controller-config.cpp
    runtime/fx-chain-proto.cpp
    runtime/input-thread.cpp
    runtime/keystroke-sender.cpp
    runtime/managed-file-store.cpp
    runtime/module-store.cpp
    runtime/preset-store.cpp
    runtime/storage-path-safety.cpp
    runtime/plugin-state-wire.cpp
    runtime/web-navigation-policy.cpp
    runtime/sample-capability-proto.cpp
    runtime/recut-proto.cpp
    runtime/recut-runtime.cpp
    runtime/quick-js-host.cpp
    runtime/script-host.cpp
)

if(MSVC)
  target_compile_options(PadPilot PRIVATE /wd4324 /external:W0)
  set_source_files_properties(
    generated/proto/analyzer.pb.cc
    generated/proto/capability.pb.cc
    generated/proto/bridge.pb.cc
    generated/proto/fx-chain.pb.cc
    generated/proto/recut.pb.cc
    PROPERTIES
      COMPILE_OPTIONS "/wd4267;/wd5054"
  )
endif()

target_include_directories(PadPilot
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/generated/proto
)

FetchContent_GetProperties(protobuf)
if(protobuf_POPULATED)
  if(PADPILOT_ENABLE_TESTS)
    target_include_directories(padpilot-native-tests
      SYSTEM PRIVATE
        "${protobuf_SOURCE_DIR}/src"
        "${protobuf_BINARY_DIR}"
    )
  endif()
  target_include_directories(PadPilot
    SYSTEM PRIVATE
      "${protobuf_SOURCE_DIR}/src"
      "${protobuf_BINARY_DIR}"
  )
endif()

FetchContent_GetProperties(webview2)
if(webview2_POPULATED)
  target_include_directories(PadPilot PRIVATE "${webview2_SOURCE_DIR}/build/native/include")
endif()

FetchContent_GetProperties(quickjs)
if(quickjs_POPULATED)
  if(PADPILOT_ENABLE_TESTS)
    target_include_directories(padpilot-native-tests SYSTEM PRIVATE "${quickjs_SOURCE_DIR}")
  endif()
  target_include_directories(PadPilot SYSTEM PRIVATE "${quickjs_SOURCE_DIR}")
endif()

FetchContent_GetProperties(xxhash)
if(xxhash_POPULATED)
  if(PADPILOT_ENABLE_TESTS)
    target_sources(padpilot-native-tests PRIVATE "${xxhash_SOURCE_DIR}/xxhash.c")
    target_include_directories(padpilot-native-tests SYSTEM PRIVATE "${xxhash_SOURCE_DIR}")
  endif()
  target_sources(PadPilot PRIVATE "${xxhash_SOURCE_DIR}/xxhash.c")
  target_include_directories(PadPilot SYSTEM PRIVATE "${xxhash_SOURCE_DIR}")
endif()

target_compile_definitions(PadPilot
  PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    PADPILOT_WINDOWS_MIN_SDK=19041
)

target_link_libraries(PadPilot
  PRIVATE
    PadPilotAssets
    bcrypt
    crypt32
    juce::juce_audio_utils
    juce::juce_audio_formats
    juce::juce_cryptography
    juce::juce_dsp
    SDL2::SDL2-static
    qjs
    protobuf::libprotobuf-lite
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags
)

if(WIN32)
  add_dependencies(PadPilot_VST3 padpilot-updater)
  add_dependencies(PadPilot_Standalone padpilot-updater)
  if(BUN_EXECUTABLE)
    add_custom_command(TARGET PadPilot_VST3 POST_BUILD
      COMMAND ${BUN_EXECUTABLE}
        run
        "${CMAKE_CURRENT_SOURCE_DIR}/../scripts/deploy-ui.ts"
        --project-root "${CMAKE_CURRENT_SOURCE_DIR}/.."
        --ui-source "${PADPILOT_EMBEDDED_UI_DIR}"
        --bundle-contents "$<TARGET_FILE_DIR:PadPilot_VST3>/.."
      COMMENT "Building and deploying UI assets into PadPilot.vst3 bundle"
    )
  else()
    message(WARNING "bun was not found in PATH. PadPilot UI assets will not be auto-deployed into the VST3 bundle.")
  endif()
  add_custom_command(TARGET PadPilot_VST3 POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:PadPilot_VST3>/../Resources/updater"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "$<TARGET_FILE:padpilot-updater>" "$<TARGET_FILE_DIR:PadPilot_VST3>/../Resources/updater/padpilot-updater.exe"
    COMMENT "Deploying updater helper into PadPilot.vst3 bundle"
  )
  add_custom_command(TARGET PadPilot_Standalone POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "$<TARGET_FILE:padpilot-updater>" "$<TARGET_FILE_DIR:PadPilot_Standalone>/padpilot-updater.exe"
    COMMENT "Deploying updater helper next to PadPilot standalone"
  )
endif()
