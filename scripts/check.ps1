#!/usr/bin/env pwsh

# Runs every quality check (format, lint, typecheck, jobs bundle, unit tests) and prints one compact
# block.
#
# End-to-end tests are deliberately excluded: they need a browser and an HTTP server. Run
# ./scripts/e2e.ps1 for those.
#
# Usage: ./scripts/check.ps1 [-Fix] [-Json] [-MaxIssues <n>] [-Help]
#
# Exit codes: 0 everything passed, 1 at least one check found issues, 2 a check could not run.

[CmdletBinding()]
param(
    [switch]$Fix,
    [switch]$Json,
    [int]$MaxIssues = 50,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'common.ps1')

if ($Help) {
    Write-Output @'
Usage: check.ps1 [OPTIONS]

Runs format, lint, typecheck, the jobs Worker bundle and the unit tests in one pass, reporting
each on its own line.
End-to-end tests are not included - run e2e.ps1 for those.

OPTIONS:
  -Fix               Rewrite formatting and apply auto-fixable lint fixes first
  -Json              Emit a JSON object instead of text
  -MaxIssues <n>     Maximum issues to list per check (default 50)
  -Help              Show this help message

EXIT CODES:
  0  every check passed
  1  at least one check found issues
  2  at least one check could not run
'@
    exit $script:ExitPass
}

$checks = @(
    @{ Script = 'format.ps1'; FixSwitch = 'Write' },
    @{ Script = 'lint.ps1'; FixSwitch = 'Fix' },
    @{ Script = 'typecheck.ps1'; FixSwitch = $null },
    @{ Script = 'jobs-bundle.ps1'; FixSwitch = $null },
    @{ Script = 'test.ps1'; FixSwitch = $null }
)

$results = @()
$worstExitCode = $script:ExitPass

foreach ($check in $checks) {
    $scriptPath = Join-Path $PSScriptRoot $check.Script
    $parameters = @{ Json = $true }
    if ($Fix -and $check.FixSwitch) {
        $parameters[$check.FixSwitch] = $true
    }

    $output = & $scriptPath @parameters
    $exitCode = $LASTEXITCODE

    if ($exitCode -gt $worstExitCode) {
        $worstExitCode = $exitCode
    }

    $results += ($output | ConvertFrom-Json)
}

if ($Json) {
    [pscustomobject]@{
        check   = 'check'
        status  = if ($worstExitCode -eq $script:ExitPass) { 'PASS' } elseif ($worstExitCode -eq $script:ExitIssues) { 'FAIL' } else { 'ERROR' }
        results = $results
    } | ConvertTo-Json -Depth 6 -Compress
    exit $worstExitCode
}

foreach ($result in $results) {
    Write-CheckResult -Name $result.check -Status $result.status -Summary $result.summary -Issues @($result.issues) -MaxIssues $MaxIssues
}

exit $worstExitCode
