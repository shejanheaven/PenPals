# Islamic Shorts - one-step free install + first batch of videos.
#
# Paste this single line into PowerShell:
#   irm https://raw.githubusercontent.com/shejanheaven/PenPals/refs/heads/claude/compassionate-ramanujan-7hzji4/islamic-shorts/install-and-run.ps1 | iex
#
# It installs the app to Desktop\Islamic Shorts App, picks a FREE image source
# (Pollinations without an account, or your NVIDIA graphics card), and makes the
# videos in plans\2026-10-01-batch-1.json with the free Microsoft Edge voice.

$Repo   = "https://github.com/shejanheaven/PenPals.git"
$Branch = "claude/compassionate-ramanujan-7hzji4"
$Plan   = "plans\2026-10-01-batch-1.json"
$Root   = Join-Path ([Environment]::GetFolderPath("Desktop")) "Islamic Shorts App"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`n$msg" -ForegroundColor Red; return }

Step "Getting the app"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git is not installed: https://git-scm.com/download/win"; return }
if (Test-Path (Join-Path $Root ".git")) {
    git -C $Root pull --ff-only
} else {
    git clone --depth 1 --branch $Branch $Repo $Root
}
$App = Join-Path $Root "islamic-shorts"
if (-not (Test-Path (Join-Path $App "make_video.py"))) { Fail "Download failed - check your internet connection and run the line again."; return }
Set-Location $App

Step "Setting up Python (first time takes a few minutes)"
$Python = Join-Path $App ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3 -m venv .venv }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { python -m venv .venv }
    else { Fail "Python is not installed: https://www.python.org/downloads/ (tick 'Add python.exe to PATH')"; return }
}
if (-not (Test-Path $Python)) { Fail "Could not create the Python environment."; return }
& $Python -m pip install --upgrade pip --quiet --disable-pip-version-check
& $Python -m pip install -r requirements.txt --quiet --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { Fail "Installing the Python libraries failed (see the messages above)."; return }
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

Step "Checking the free services"
& $Python make_video.py --check

Step "Choosing a free image source"
$probe = @'
import requests
try:
    r = requests.get("https://image.pollinations.ai/prompt/ancient%20mosque%20at%20dawn",
                     params={"width": 512, "height": 896, "nologo": "true", "model": "flux",
                             "seed": 7}, timeout=180)
    ok = r.status_code == 200 and r.headers.get("content-type", "").startswith("image/") \
        and len(r.content) > 20000
    print("OK" if ok else "NO %s %s" % (r.status_code, r.headers.get("content-type")))
except Exception as exc:
    print("NO %s" % exc)
'@
$probeResult = ($probe | & $Python -) | Select-Object -Last 1
$Images = "draft"
if ($probeResult -eq "OK") {
    $Images = "pollinations"
    Write-Host "Free Pollinations images work (no account needed)."
} elseif (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    Write-Host "Pollinations is not available ($probeResult). Using your NVIDIA graphics card instead."
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    & $Python -m pip install torch --index-url https://download.pytorch.org/whl/cu128 --quiet
    if ($LASTEXITCODE -ne 0) { & $Python -m pip install torch --index-url https://download.pytorch.org/whl/cu126 --quiet }
    & $Python -m pip install -r requirements-local-images.txt --quiet
    $cuda = (& $Python -c "import torch; print(torch.cuda.is_available())") | Select-Object -Last 1
    if ($cuda -eq "True") { $Images = "local" }
}
if ($Images -eq "draft") {
    Write-Host "No free image source worked on this PC ($probeResult)." -ForegroundColor Yellow
    Write-Host "Making DRAFT videos (real voice and captions, stand-in pictures)." -ForegroundColor Yellow
    Write-Host "For real pictures: add free Cloudflare keys to .env (see README), then run:" -ForegroundColor Yellow
    Write-Host "  .venv\Scripts\python.exe make_video.py --project latest --free" -ForegroundColor Yellow
}

Step "Making the videos - this takes roughly 20-40 minutes, leave this window open"
if ($Images -eq "draft") {
    & $Python make_video.py --plan $Plan --free --draft
} else {
    & $Python make_video.py --plan $Plan --free --images $Images
}

Step "Done"
Write-Host "Your videos are in: $(Join-Path $App 'output')" -ForegroundColor Green
Write-Host "Each folder has the video, post.txt (caption + hashtags), cover.jpg and storyboard.jpg."
Write-Host "To fix a scene later:  .venv\Scripts\python.exe make_video.py --project latest --redo 3,7 --free --images $Images"
Start-Process explorer.exe (Join-Path $App "output")
