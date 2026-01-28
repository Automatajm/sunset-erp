@echo off
cls
color 0A
echo ========================================
echo   SUNSET ERP - Development Server
echo ========================================
echo.
echo  Server: http://localhost:3000
echo  Watching: src/**/*.ts
echo.
call npm run dev
