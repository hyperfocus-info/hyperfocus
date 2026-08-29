if(NOT DEFINED PADPILOT_SRC_DIR OR NOT DEFINED PADPILOT_DST_DIR)
  message(FATAL_ERROR "PADPILOT_SRC_DIR and PADPILOT_DST_DIR must be provided.")
endif()

execute_process(
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${PADPILOT_DST_DIR}"
  RESULT_VARIABLE make_dir_result
)

if(NOT make_dir_result EQUAL 0)
  message(WARNING "PadPilot post-build copy skipped (cannot create destination): ${PADPILOT_DST_DIR}")
  return()
endif()

execute_process(
  COMMAND "${CMAKE_COMMAND}" -E copy_directory "${PADPILOT_SRC_DIR}" "${PADPILOT_DST_DIR}"
  RESULT_VARIABLE copy_result
)

if(NOT copy_result EQUAL 0)
  if(WIN32)
    string(REPLACE "'" "''" escaped_cmake_command "${CMAKE_COMMAND}")
    string(REPLACE "'" "''" escaped_src "${PADPILOT_SRC_DIR}")
    string(REPLACE "'" "''" escaped_dst "${PADPILOT_DST_DIR}")
    set(ps_command
      "$ErrorActionPreference='Stop'; "
      "Start-Process -FilePath '${escaped_cmake_command}' -ArgumentList @('-E','make_directory','${escaped_dst}') -Verb RunAs -Wait; "
      "Start-Process -FilePath '${escaped_cmake_command}' -ArgumentList @('-E','copy_directory','${escaped_src}','${escaped_dst}') -Verb RunAs -Wait"
    )

    execute_process(
      COMMAND powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${ps_command}"
      RESULT_VARIABLE elevated_copy_result
    )

    if(elevated_copy_result EQUAL 0)
      message(STATUS "PadPilot post-build copy completed via elevated permissions.")
    else()
      message(WARNING "PadPilot post-build copy skipped (insufficient permissions or elevation denied): ${PADPILOT_DST_DIR}")
    endif()
  else()
    message(WARNING "PadPilot post-build copy skipped (insufficient permissions or locked files): ${PADPILOT_DST_DIR}")
  endif()
endif()
