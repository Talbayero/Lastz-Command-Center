param(
  [string]$ProcessName = "Survival",
  [string]$OutputDir = "C:\Users\Teddy A\OneDrive\Escritorio\BOM\pc-captures",
  [int]$Count = 1,
  [int]$IntervalSeconds = 2
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32Capture {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, int nFlags);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function Get-TargetProcess {
  Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
}

function Save-WindowCapture {
  param(
    [System.Diagnostics.Process]$TargetProcess,
    [string]$DestinationPath
  )

  $handle = $TargetProcess.MainWindowHandle
  if ($handle -eq 0) {
    throw "The $($TargetProcess.ProcessName) window is not available."
  }

  [void][Win32Capture]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 200

  $rect = New-Object Win32Capture+RECT
  if (-not [Win32Capture]::GetWindowRect($handle, [ref]$rect)) {
    throw "Unable to read the Last Z window bounds."
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    throw "The Last Z window reported an invalid size."
  }

  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()

  try {
    $printed = [Win32Capture]::PrintWindow($handle, $hdc, 0)
    $graphics.ReleaseHdc($hdc)
    $hdc = [IntPtr]::Zero

    if (-not $printed) {
      $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    }

    $bitmap.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    if ($hdc -ne [IntPtr]::Zero) {
      $graphics.ReleaseHdc($hdc)
    }
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$target = Get-TargetProcess
if (-not $target) {
  throw "Could not find a running $ProcessName window. Open Last Z first and try again."
}

Write-Host "Capturing $Count screenshot(s) from $($target.ProcessName) into $OutputDir" -ForegroundColor Cyan

for ($index = 1; $index -le $Count; $index++) {
  $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $fileName = "lastz_capture_${timestamp}_$index.png"
  $destination = Join-Path $OutputDir $fileName
  Save-WindowCapture -TargetProcess $target -DestinationPath $destination
  Write-Host "Saved $destination" -ForegroundColor Green

  if ($index -lt $Count) {
    Start-Sleep -Seconds $IntervalSeconds
    $target = Get-TargetProcess
    if (-not $target) {
      throw "The Last Z window closed before all captures completed."
    }
  }
}
