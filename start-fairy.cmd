@echo off
rem Starts the fairy companion (developer build).
rem Double-click this file, or run it from a terminal. Close the window or press Ctrl+C to stop her.
rem
rem It first reloads the fairy's settings from your Windows user environment variables, so a key you saved
rem after Windows started (for example FAIRY_TAVILY_API_KEY for web search) is picked up without a reboot.

for %%V in (FAIRY_TAVILY_API_KEY) do (
  for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v %%V 2^>nul ^| find "%%V"') do set "%%V=%%B"
)

if defined FAIRY_TAVILY_API_KEY (echo Web search: on) else (echo Web search: off ^(no FAIRY_TAVILY_API_KEY^))

cd /d "%~dp0"
call pnpm.cmd dev:tamagotchi
