@echo off
rem Builds the phone app and puts it where the phone page offers it: fairy-data\phone\fairy-phone.apk.
rem It needs the toolchain in tools\ (Java JDK 21, Android SDK 35). See README.md.

setlocal
set "REPO=%~dp0..\.."
set "JAVA_HOME=%REPO%\tools\jdk"
set "ANDROID_HOME=%REPO%\tools\android-sdk"
rem The signing key lives with the companion's data, so a new build installs over the old app.
set "ANDROID_USER_HOME=%REPO%\fairy-data\android"

cd /d "%~dp0"
> local.properties echo sdk.dir=%ANDROID_HOME:\=/%
call "%~dp0gradlew.bat" assembleDebug --no-daemon || exit /b 1

if not exist "%REPO%\fairy-data\phone" mkdir "%REPO%\fairy-data\phone"
copy /y "app\build\outputs\apk\debug\app-debug.apk" "%REPO%\fairy-data\phone\fairy-phone.apk" >nul
echo Built fairy-data\phone\fairy-phone.apk
