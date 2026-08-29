include(FetchContent)

function(padpilot_fetch_dependencies)
  set(FETCHCONTENT_UPDATES_DISCONNECTED ON)

  FetchContent_Declare(
    juce
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 61a03097ec9e01693c87ac71935e97b9714cff1a
    PATCH_COMMAND git apply --ignore-space-change --whitespace=nowarn
      "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/patches/juce-standalone-midi-buffer.patch"
  )

  set(SDL_SHARED OFF CACHE BOOL "" FORCE)
  set(SDL_STATIC ON CACHE BOOL "" FORCE)
  set(SDL_TEST OFF CACHE BOOL "" FORCE)
  set(SDL_TEST_LIBRARY OFF CACHE BOOL "" FORCE)

  FetchContent_Declare(
    SDL2
    GIT_REPOSITORY https://github.com/libsdl-org/SDL.git
    GIT_TAG c98c4fbff6d8f3016a3ce6685bf8f43433c3efcc
  )

  set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
  set(QJS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(QJS_BUILD_WERROR OFF CACHE BOOL "" FORCE)
  set(QJS_BUILD_LIBC OFF CACHE BOOL "" FORCE)

  FetchContent_Declare(
    quickjs
    GIT_REPOSITORY https://github.com/quickjs-ng/quickjs.git
    GIT_TAG 63e9a4b21f91e5777dce4f525105e9317c3a8856
  )

  FetchContent_Declare(
    xxhash
    GIT_REPOSITORY https://github.com/Cyan4973/xxHash.git
    GIT_TAG e626a72bc2321cd320e953a0ccf1584cad60f363
  )

  FetchContent_Declare(
    webview2
    URL https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2903.40
    URL_HASH SHA256=ef128016dd1e51c59178c827ed5b8aa3322c57afa8675d930f8109505542ad74
  )

  set(protobuf_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(protobuf_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
  set(protobuf_WITH_ZLIB OFF CACHE BOOL "" FORCE)
  set(ABSL_PROPAGATE_CXX_STD ON CACHE BOOL "" FORCE)

  FetchContent_Declare(
    protobuf
    GIT_REPOSITORY https://github.com/protocolbuffers/protobuf.git
    GIT_TAG 22d0e265de7d2b3d2e9a00d071313502e7d4cccf
    SOURCE_SUBDIR cmake
  )

  FetchContent_MakeAvailable(juce SDL2 quickjs xxhash webview2 protobuf)

  if(MSVC)
    foreach(fetched_target SDL2-static SDL2main qjs libprotobuf-lite libprotobuf protoc)
      if(TARGET ${fetched_target})
        target_compile_options(${fetched_target} PRIVATE /W0)
      endif()
    endforeach()
  endif()
endfunction()


