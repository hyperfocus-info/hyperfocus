if(MSVC)
  add_compile_options(/permissive- /W4 /Zc:__cplusplus /utf-8)
  add_compile_definitions(NOMINMAX WIN32_LEAN_AND_MEAN)
endif()

option(PADPILOT_ENABLE_TESTS "Enable PadPilot tests" OFF)
