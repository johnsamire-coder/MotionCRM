Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  STARTING MOTIONCRM ENTERPRISE STACK   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n[1/2] Starting Fastify Core Backend (:4000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\MotionCRM\backend'; npm run dev"

Write-Host "[2/2] Starting React Frontend Cockpit (:3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\MotionCRM\frontend'; npm run dev"

Write-Host "`n>>> Both Services are booting!" -ForegroundColor Yellow
Write-Host ">>> Frontend: http://localhost:3000 (or http://localhost:5173)" -ForegroundColor Yellow
Write-Host ">>> Backend API: http://localhost:4000/health" -ForegroundColor Yellow