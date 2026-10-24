#!/usr/bin/env pwsh

# Bundles the jobs Worker with "wrangler deploy --dry-run" and checks that nothing Next-only got in.
#
# The jobs Worker runs outside Next, so OpenNext and Next itself must never reach its bundle. The
# check reads esbuild's metafile and fails on any input from @opennextjs or next.
#
# Usage: ./scripts/jobs-bundle.ps1 [-Json] [-Help]
#
# Exit codes: 0 bundled cleanly, 1 the bundle failed or pulls in Next-only code, 2 the check could
# not run.

[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'common.ps1')

if ($Help) {
    Write-Output @'
Usage: jobs-bundle.ps1 [OPTIONS]

Bundles the jobs Worker (jobs/wrangler.jsonc) with a dry-run deploy, reports its upload size, and
fails if the bundle contains @opennextjs or next modules. Nothing is uploaded.

OPTIONS:
  -Json              Emit a JSON object instead of text
  -Help              Show this help message

EXIT CODES:
  0  the jobs Worker bundles without Next-only code
  1  the bundle failed, or it contains Next-only code
  2  the check could not run
'@
    exit $script:ExitPass
}

$wranglerPath = 'node_modules/wrangler/bin/wrangler.js'
$toolchainError = Test-Toolchain -RelativePath $wranglerPath
if ($toolchainError) {
    Write-CheckResult -Name 'jobs-bundle' -Status 'ERROR' -Summary $toolchainError -AsJson:$Json
    exit $script:ExitError
}

$outDirectory = Join-Path (Get-RepoRoot) '.wrangler/jobs-bundle-check'
$metafilePath = Join-Path $outDirectory 'meta.json'
if (Test-Path -LiteralPath $metafilePath) {
    Remove-Item -LiteralPath $metafilePath -Force
}

$dryRun = Invoke-NodeTool -RelativePath $wranglerPath -ToolArgs @('deploy', '--dry-run', '-c', 'jobs/wrangler.jsonc', '--outdir', $outDirectory, '--metafile', $metafilePath)
if ($dryRun.ExitCode -ne 0 -or $dryRun.StdOut -notmatch 'Total Upload:\s+(?<size>[\d.]+)\s+(?<unit>KiB|MiB)') {
    $lines = @("$($dryRun.StdErr)`n$($dryRun.StdOut)" -split '\r?\n' | Where-Object { $_ -match 'error|✘' })
    $detail = if ($lines.Count -gt 0) { $lines[0].Trim() } else { "wrangler exited with code $($dryRun.ExitCode)" }
    Write-CheckResult -Name 'jobs-bundle' -Status 'FAIL' -Summary 'bundle failed' -Issues @($detail) -AsJson:$Json
    exit $script:ExitIssues
}
$sizeKiB = [double]$Matches['size']
if ($Matches['unit'] -eq 'MiB') {
    $sizeKiB *= 1024
}
$summary = 'size={0:N2}KiB' -f $sizeKiB

try {
    $inputs = @((Get-Content -LiteralPath $metafilePath -Raw | ConvertFrom-Json).inputs.PSObject.Properties.Name)
}
catch {
    Write-CheckResult -Name 'jobs-bundle' -Status 'ERROR' -Summary 'the esbuild metafile is missing or unreadable' -AsJson:$Json
    exit $script:ExitError
}

$nextOnly = @($inputs | Where-Object { $_ -match 'node_modules/(@opennextjs|next)/' })
if ($nextOnly.Count -gt 0) {
    $issues = @($nextOnly | Select-Object -First 5 | ForEach-Object { "Next-only module in the jobs bundle: $_" })
    Write-CheckResult -Name 'jobs-bundle' -Status 'FAIL' -Summary $summary -Issues $issues -AsJson:$Json
    exit $script:ExitIssues
}

Write-CheckResult -Name 'jobs-bundle' -Status 'PASS' -Summary $summary -AsJson:$Json
exit $script:ExitPass
