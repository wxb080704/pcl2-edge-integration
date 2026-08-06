@echo off
setlocal enabledelayedexpansion
echo === PCL2 Edge Integration Setup ===
echo.

:: Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found

:: Create launcher batch (Native Messaging path cannot take arguments)
echo @echo off > "C:\Users\a\AppData\Roaming\reasonix\global-workspace\pcl2-edge-integration\native-host\run-host.bat"
echo node "C:\Users\a\AppData\Roaming\reasonix\global-workspace\pcl2-edge-integration\native-host\pcl2-download-host.js" >> "C:\Users\a\AppData\Roaming\reasonix\global-workspace\pcl2-edge-integration\native-host\run-host.bat"
echo [OK] Launcher created

:: Register Native Messaging Host
if not exist "C:\Users\a\AppData\Local\Microsoft\Edge\User Data\NativeMessagingHosts" mkdir "C:\Users\a\AppData\Local\Microsoft\Edge\User Data\NativeMessagingHosts"

echo.
echo ================================================
echo   Step 1: Load extension in Edge
echo   1. Open Edge -^> edge://extensions
echo   2. Enable Developer Mode
echo   3. Click "Load unpacked"
echo   4. Select: C:\Users\a\AppData\Roaming\reasonix\global-workspace\pcl2-edge-integration\edge-extension
echo   5. Copy the Extension ID from the card
echo ================================================
echo.

set /p EXT_ID="Paste Extension ID: "
if "%EXT_ID%"=="" (
    echo [ERROR] Extension ID is required
    pause
    exit /b 1
)

:: Write manifest with correct allowed_origins
> "C:\Users\a\AppData\Local\Microsoft\Edge\User Data\NativeMessagingHosts\com.pcl2.downloader.json" (
    echo {
    echo   "name": "com.pcl2.downloader",
    echo   "description": "PCL2 Multi-threaded Download Engine - Native Messaging Host",
    echo   "path": "C:\Users\a\AppData\Roaming\reasonix\global-workspace\pcl2-edge-integration\native-host\run-host.bat",
    echo   "type": "stdio",
    echo   "allowed_origins": [
    echo     "chrome-extension://%EXT_ID%/",
    echo     "chrome-extension://%EXT_ID%/*"
    echo   ]
    echo }
)
echo [OK] Manifest registered

:: Verify
echo.
echo ================================================
echo   Setup Complete!
echo ================================================
echo.
echo   Extension ID: %EXT_ID%
echo   Manifest: C:\Users\a\AppData\Local\Microsoft\Edge\User Data\NativeMessagingHosts\com.pcl2.downloader.json
echo.
echo   Now click any download link in Edge - PCL2 engine will catch it.
echo.
pause