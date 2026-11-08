<#
.SYNOPSIS
  Gera o APK Android do cliente Godot (apps/godot) no Windows, com o Android Studio que já
  está instalado. Uso, na raiz do repositório:

    pnpm android:godot          # gera o APK e instala no celular ligado no USB, se houver

  Com opções, chame o PowerShell direto:

    powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -NoInstall
    powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -ApiUrl http://192.168.0.10:3000

.DESCRIPTION
  1. Baixa o Godot 4.7.2 e os modelos de exportação (uma vez só; ficam em
     %LOCALAPPDATA%\trivia-tora\godot) e confere o SHA-512 de cada arquivo com a lista
     oficial do Godot. O Godot roda em modo portátil: nada muda nas configurações de um
     Godot que você já tenha.
  2. Acha o SDK do Android (o do Android Studio) e o Java (o que vem com o Android Studio).
  3. Grava apps/godot/server.cfg com o endereço da API: por padrão, o IP deste computador na
     rede de casa e a porta 3000 (o mesmo de `pnpm lan`). No jogo, a tela de boas-vindas
     deixa trocar o endereço depois.
  4. Exporta build\android\trivia-tora.apk, assinado com a chave de depuração do Android
     (a do Android Studio, ou uma nova). Serve para instalar e testar; para publicar na
     Play Store é outra chave (veja apps/godot/README.md).
  5. Com um celular ligado no USB (depuração USB ativada), instala com o adb.

  No jogo instalado, os anúncios e as compras são os de demonstração (nada é cobrado), como
  na versão web: a API precisa estar com ADS_MODE e STORE_MODE vazios ou em "demo", que é o
  padrão fora de produção.
#>
param(
  [string]$ApiUrl = "",
  [switch]$NoInstall,
  [string]$AndroidSdk = "",
  [string]$JavaHome = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$GodotVersion = "4.7.2-stable"
$GodotRelease = "https://github.com/godotengine/godot/releases/download/$GodotVersion"
$EditorZip = "Godot_v${GodotVersion}_win64.exe.zip"
$TemplatesFile = "Godot_v${GodotVersion}_export_templates.tpz"
$TemplatesDir = "4.7.2.stable"

$Root = Split-Path -Parent $PSScriptRoot
$Project = Join-Path $Root "apps\godot"
$Tools = Join-Path $env:LOCALAPPDATA "trivia-tora\godot"
$Apk = Join-Path $Project "build\android\trivia-tora.apk"

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host $text -ForegroundColor Red; exit 1 }

# --- 1. Godot e os modelos de exportação ---------------------------------------------------

function Get-Checked($name, $sums) {
  $file = Join-Path $Tools $name
  if (-not (Test-Path $file)) {
    Write-Host "   baixando $name..."
    Invoke-WebRequest -UseBasicParsing -Uri "$GodotRelease/$name" -OutFile "$file.part"
    Move-Item -Force "$file.part" $file
  }
  $pattern = [regex]::Escape($name) + '$'
  $line = $sums | Where-Object { $_ -match $pattern } | Select-Object -First 1
  if (-not $line) { Fail "O arquivo $name não está na lista SHA512-SUMS do Godot $GodotVersion." }
  $expected = ($line -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA512 $file).Hash.ToLower()
  if ($expected -ne $actual) {
    Remove-Item -Force $file
    Fail "O SHA-512 de $name não confere com o oficial (o arquivo foi apagado). Rode de novo."
  }
  return $file
}

Step "Godot $GodotVersion"
New-Item -ItemType Directory -Force $Tools | Out-Null
$godotExe = Get-ChildItem $Tools -Filter "Godot_v${GodotVersion}_win64_console.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$templatesReady = Test-Path (Join-Path $Tools "editor_data\export_templates\$TemplatesDir\android_debug.apk")
if (-not $godotExe -or -not $templatesReady) {
  $sumsFile = Join-Path $Tools "SHA512-SUMS.txt"
  Invoke-WebRequest -UseBasicParsing -Uri "$GodotRelease/SHA512-SUMS.txt" -OutFile $sumsFile
  $sums = Get-Content $sumsFile
  if (-not $godotExe) {
    $zip = Get-Checked $EditorZip $sums
    Expand-Archive -Force $zip $Tools
    $godotExe = Get-ChildItem $Tools -Filter "Godot_v${GodotVersion}_win64_console.exe" | Select-Object -First 1
  }
  if (-not $templatesReady) {
    $tpz = Get-Checked $TemplatesFile $sums
    $unpack = Join-Path $Tools "templates-unpack"
    if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
    # O .tpz é um zip; o Expand-Archive só aceita a extensão .zip.
    $asZip = Join-Path $Tools "templates.zip"
    Copy-Item -Force $tpz $asZip
    Expand-Archive -Force $asZip $unpack
    Remove-Item -Force $asZip
    $dest = Join-Path $Tools "editor_data\export_templates\$TemplatesDir"
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item -Force (Join-Path $unpack "templates\*") $dest
    Remove-Item -Recurse -Force $unpack
  }
}
if (-not $godotExe) { Fail "Não achei o Godot depois de baixar ($Tools)." }
# Modo portátil: o Godot guarda configurações e modelos em editor_data, ao lado dele.
New-Item -ItemType File -Force (Join-Path $Tools "_sc_") | Out-Null
Write-Host "   $($godotExe.FullName)"

# --- 2. SDK do Android e Java --------------------------------------------------------------

Step "SDK do Android e Java"
if (-not $AndroidSdk) {
  foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk"))) {
    if ($c -and (Test-Path (Join-Path $c "platform-tools"))) { $AndroidSdk = $c; break }
  }
}
if (-not $AndroidSdk) { Fail "Não achei o SDK do Android. Abra o Android Studio > More Actions > SDK Manager e instale o SDK; ou rode com -AndroidSdk <pasta>." }
$buildTools = Get-ChildItem (Join-Path $AndroidSdk "build-tools") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools -or -not (Test-Path (Join-Path $buildTools.FullName "apksigner.bat"))) {
  Fail "O SDK em $AndroidSdk não tem build-tools. No Android Studio: SDK Manager > SDK Tools > marque 'Android SDK Build-Tools' e aplique."
}
$adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
if (-not $JavaHome) {
  $candidates = @($env:JAVA_HOME, "$env:ProgramFiles\Android\Android Studio\jbr", "$env:ProgramFiles\Android\Android Studio\jre")
  $candidates += (Get-ChildItem (Join-Path $env:USERPROFILE ".jdks") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object { $_.FullName })
  foreach ($c in $candidates) {
    if ($c -and (Test-Path (Join-Path $c "bin\java.exe"))) { $JavaHome = $c; break }
  }
}
if (-not $JavaHome) { Fail "Não achei o Java. Ele vem com o Android Studio (pasta jbr); ou rode com -JavaHome <pasta>." }
Write-Host "   SDK: $AndroidSdk (build-tools $($buildTools.Name))"
Write-Host "   Java: $JavaHome"
$env:JAVA_HOME = $JavaHome

# Chave de depuração: a do Android Studio, ou uma nova com o keytool do Java.
$keystore = Join-Path $env:USERPROFILE ".android\debug.keystore"
if (-not (Test-Path $keystore)) {
  New-Item -ItemType Directory -Force (Split-Path $keystore) | Out-Null
  & (Join-Path $JavaHome "bin\keytool.exe") -genkeypair -keystore $keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
}

# Configurações do Godot portátil (só as do Android).
$settingsDir = Join-Path $Tools "editor_data"
New-Item -ItemType Directory -Force $settingsDir | Out-Null
$fwd = { param($p) $p -replace '\\', '/' }
$settings = @"
[gd_resource type="EditorSettings" format=3]

[resource]
export/android/android_sdk_path = "$(& $fwd $AndroidSdk)"
export/android/java_sdk_path = "$(& $fwd $JavaHome)"
export/android/debug_keystore = "$(& $fwd $keystore)"
export/android/debug_keystore_user = "androiddebugkey"
export/android/debug_keystore_pass = "android"
"@
foreach ($name in @("editor_settings-4.7.tres", "editor_settings-4.tres")) {
  [IO.File]::WriteAllText((Join-Path $settingsDir $name), $settings, (New-Object Text.UTF8Encoding $false))
}
$env:GODOT_ANDROID_KEYSTORE_DEBUG_PATH = $keystore
$env:GODOT_ANDROID_KEYSTORE_DEBUG_USER = "androiddebugkey"
$env:GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD = "android"

# --- 3. Endereço da API ---------------------------------------------------------------------

Step "Endereço da API"
if (-not $ApiUrl) {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback' -and $_.AddressState -eq 'Preferred' } |
    Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress
  if (-not $ip) { Fail "Não achei o IP deste computador na rede de casa. Rode com -ApiUrl http://<ip>:3000." }
  $ApiUrl = "http://${ip}:3000"
}
$cfg = "[server]`r`n`r`napi_url=`"$ApiUrl`"`r`n"
[IO.File]::WriteAllText((Join-Path $Project "server.cfg"), $cfg, (New-Object Text.UTF8Encoding $false))
Write-Host "   $ApiUrl (o jogo deixa trocar depois, na tela de boas-vindas)"

# --- 4. Exportar ----------------------------------------------------------------------------

Step "Exportando o APK"
New-Item -ItemType Directory -Force (Split-Path $Apk) | Out-Null
& $godotExe.FullName --headless --path $Project --import 2>&1 | Out-Null
& $godotExe.FullName --headless --path $Project --export-debug "Android" $Apk
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Apk)) { Fail "A exportação falhou (mensagens acima)." }
Write-Host ("   {0} ({1:N1} MB)" -f $Apk, ((Get-Item $Apk).Length / 1MB)) -ForegroundColor Green

# --- 5. Instalar ----------------------------------------------------------------------------

if (-not $NoInstall -and (Test-Path $adb)) {
  $devices = & $adb devices | Select-String -Pattern "`tdevice$"
  if ($devices) {
    Step "Instalando no celular"
    & $adb install -r $Apk
  } else {
    Write-Host ""
    Write-Host "Nenhum celular no USB. Para instalar: ative a depuração USB no celular e rode de novo," -ForegroundColor Yellow
    Write-Host "ou copie o APK para o celular e abra (permita instalar de fontes desconhecidas)." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Para jogar: no computador, deixe a API no ar com 'pnpm lan:godot' (mesma rede do celular)."
Write-Host "Se o celular não conectar, libere a porta 3000 no Firewall do Windows (rede privada):"
Write-Host '  New-NetFirewallRule -DisplayName "Trivia Tora (3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private'
