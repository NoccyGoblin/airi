@echo off
rem Builds the phone app and puts it where the phone page offers it: fairy-data\phone\fairy-phone.apk.
rem It needs the toolchain in tools\ (Java JDK 21, Android SDK 35, sherpa-onnx). See README.md.

setlocal
set "REPO=%~dp0..\.."
set "JAVA_HOME=%REPO%\tools\jdk"
set "ANDROID_HOME=%REPO%\tools\android-sdk"
rem The signing key lives with the companion's data, so a new build installs over the old app.
set "ANDROID_USER_HOME=%REPO%\fairy-data\android"

cd /d "%~dp0"

rem The wake word model (sherpa-onnx KWS zipformer zh-en 3M): the small int8 files only.
set "KWS=%REPO%\tools\sherpa\sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20"
set "ASSETS=%REPO%\tools\sherpa\assets\kws"
if not exist "%ASSETS%" mkdir "%ASSETS%"
copy /y "%KWS%\encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx" "%ASSETS%\encoder.onnx" >nul || exit /b 1
copy /y "%KWS%\decoder-epoch-13-avg-2-chunk-16-left-64.onnx" "%ASSETS%\decoder.onnx" >nul || exit /b 1
copy /y "%KWS%\joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx" "%ASSETS%\joiner.onnx" >nul || exit /b 1
copy /y "%KWS%\tokens.txt" "%ASSETS%\tokens.txt" >nul || exit /b 1

> local.properties echo sdk.dir=%ANDROID_HOME:\=/%
call "%~dp0gradlew.bat" assembleDebug --no-daemon || exit /b 1

if not exist "%REPO%\fairy-data\phone" mkdir "%REPO%\fairy-data\phone"
copy /y "app\build\outputs\apk\debug\app-debug.apk" "%REPO%\fairy-data\phone\fairy-phone.apk" >nul
echo Built fairy-data\phone\fairy-phone.apk
