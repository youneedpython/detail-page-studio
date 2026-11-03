Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot

function Invoke-NativeStep {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string] $Command,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Arguments
    )

    Write-Host ""
    Write-Host "==> $Name"

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        $ExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($ExitCode -ne 0) {
        throw "$Name failed with exit code $ExitCode"
    }
}

# 승인된 Node.js Version은 .nvmrc를 기준으로 한다. 불일치 시 경고만 출력한다.
$ExpectedNode = (Get-Content (Join-Path $Root ".nvmrc") -TotalCount 1).Trim()
$ActualNode = (node --version).TrimStart("v")
if ($ActualNode -ne $ExpectedNode) {
    Write-Warning "Node.js $ActualNode is in use, but .nvmrc expects $ExpectedNode (CI uses $ExpectedNode)."
}
else {
    Write-Host "Node.js $ActualNode (matches .nvmrc)"
}

$Tests = Get-ChildItem (Join-Path $Root "scripts/orchestrator") -Filter "*.test.mjs" | ForEach-Object { "scripts/orchestrator/$($_.Name)" }
Invoke-NativeStep "Harness orchestrator test" $Root "node" "--test" @Tests

Invoke-NativeStep "Install app dependencies" $Root "npm" "ci"
Invoke-NativeStep "App lint" $Root "npm" "run" "lint"
Invoke-NativeStep "App typecheck" $Root "npm" "run" "typecheck"
Invoke-NativeStep "App test" $Root "npm" "test"
Invoke-NativeStep "App build" $Root "npm" "run" "build"

Write-Host ""
Write-Host "Local verification passed."
