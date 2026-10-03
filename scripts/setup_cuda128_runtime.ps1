$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRuntime = Join-Path $projectRoot "voice-engine\GPT-SoVITS-windows\GPT-SoVITS-v3lora-20250228\runtime"
$targetRoot = Join-Path $projectRoot "voice-engine\cuda128-runtime"
$logPath = Join-Path $projectRoot "voice-engine\cuda128-setup.log"

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

try {
    Write-Log "CUDA 12.8 runtime setup started."

    if (-not (Test-Path -LiteralPath (Join-Path $targetRoot "python.exe"))) {
        Write-Log "Copying base runtime to $targetRoot"
        New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null

        $sourceResolved = (Resolve-Path -LiteralPath $sourceRuntime).Path
        $targetResolved = [IO.Path]::GetFullPath($targetRoot)
        if (-not $targetResolved.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Target runtime path is outside the project."
        }
        if (-not $sourceResolved.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Source runtime path is outside the project."
        }

        Get-ChildItem -LiteralPath $sourceResolved -Force |
            Copy-Item -Destination $targetResolved -Recurse -Force
    }

    $python = Join-Path $targetRoot "python.exe"
    Write-Log "Base runtime copy completed."
    Write-Log "Installing CUDA 12.8 PyTorch packages."
    & $python -m pip install --upgrade "typing-extensions>=4.10.0" *>> $logPath
    & $python -m pip install --upgrade `
        "torch==2.7.1+cu128" `
        "torchvision==0.22.1+cu128" `
        "torchaudio==2.7.1+cu128" `
        --index-url https://download.pytorch.org/whl/cu128 *>> $logPath
    Write-Log "CUDA 12.8 PyTorch package installation completed."

    Write-Log "Verifying CUDA 12.8 and RTX 5070 sm_120 support."
    & $python -c "import torch; print('torch', torch.__version__); print('cuda', torch.version.cuda); print('available', torch.cuda.is_available()); print('arch', torch.cuda.get_arch_list()); print('device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'); assert torch.cuda.is_available(); assert 'sm_120' in torch.cuda.get_arch_list()"
    if ($LASTEXITCODE -ne 0) {
        throw "CUDA runtime verification failed."
    }
    Write-Log "CUDA 12.8 runtime setup completed successfully."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
