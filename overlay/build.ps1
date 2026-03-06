# Build BetTracker Overlay – nastaví PATH pro Cargo (Rust) a spustí Tauri build.
# Použijte, pokud v terminálu máte chybu "cargo: program not found".

# Ukončit běžící overlay, aby se exe dal přepsat (jinak "Přístup byl odepřen")
Get-Process -Name "bettracker-overlay", "BetTracker Overlay" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (-not (Test-Path "$cargoBin\cargo.exe")) {
    Write-Host "Cargo nenalezen v $cargoBin"
    Write-Host "Nainstalujte Rust: https://rustup.rs"
    exit 1
}
$env:Path = "$cargoBin;$env:Path"
Set-Location $PSScriptRoot
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx tauri build
