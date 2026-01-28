@echo off
cls
color 0B
echo ========================================
echo   SUNSET ERP - Starting Server
echo ========================================
echo.
echo [INFO] Compilando TypeScript...
call npx tsc src/main.ts src/app.module.ts --outDir dist --module commonjs --target ES2021 --esModuleInterop --emitDecoratorMetadata --experimentalDecorators

if errorlevel 1 (
    echo.
    echo [ERROR] Compilacion fallida!
    pause
    exit /b 1
)

echo [OK] Compilacion exitosa
echo.
echo [INFO] Iniciando servidor...
echo  Server: http://localhost:3000
echo.
call node dist/main.js
