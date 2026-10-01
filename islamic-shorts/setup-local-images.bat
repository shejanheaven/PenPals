@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Free local image generation (needs an NVIDIA graphics card, 6 GB+ VRAM)
echo  =======================================================================
where nvidia-smi >nul 2>nul || (
  echo  No NVIDIA graphics card driver found - this option will not work on this PC.
  echo  Use the free Pollinations images ^(default^) or free Cloudflare keys instead.
  pause
  exit /b 1
)
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
if not exist ".venv\Scripts\python.exe" call setup.bat
echo  Installing PyTorch with CUDA (about 3 GB)...
".venv\Scripts\python.exe" -m pip install torch --index-url https://download.pytorch.org/whl/cu128 || ".venv\Scripts\python.exe" -m pip install torch --index-url https://download.pytorch.org/whl/cu126 || (echo  PyTorch install failed. & pause & exit /b 1)
".venv\Scripts\python.exe" -m pip install -r requirements-local-images.txt || (echo  Install failed. & pause & exit /b 1)
".venv\Scripts\python.exe" -c "import torch; print('  CUDA available:', torch.cuda.is_available())"
echo.
echo  Done. The image model (~12 GB) downloads automatically the first time you make a video.
echo  To always use it, put IMAGE_PROVIDER=local in .env
pause
