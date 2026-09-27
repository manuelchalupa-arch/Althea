$ErrorActionPreference = 'SilentlyContinue'
$src = 'src'
$pats = @(
  '\.cycle\b',
  'cycleVersions',
  'CycleVersion',
  '\.cycleId\b',
  'weeklySequence',
  'WeeklySequence',
  'weekMap\b',
  'weekKey\b',
  'effectiveFrom',
  'savePlanning',
  'getActiveVersion',
  'buildCycleFrom',
  'getVersionForSession',
  'isPlanningUsed'
)
$hits = @{}
$files = Get-ChildItem -Recurse -Path $src -Include *.ts,*.tsx | Where-Object {
  $_.FullName -notmatch '\.test\.' -and $_.FullName -notmatch 'demoData|migrateLocalStorage|\.demo\.'
}
foreach ($f in $files) {
  $all = Get-Content $f.FullName
  for ($i = 0; $i -lt $all.Count; $i++) {
    $l = $all[$i]
    foreach ($p in $pats) {
      if ($l -match $p) {
        $key = "$($f.Name):$($i + 1)"
        if (-not $hits.ContainsKey($key)) { $hits[$key] = $l.Trim() }
        break
      }
    }
  }
}
$byFile = $hits.GetEnumerator() | Sort-Object Name | Group-Object { ($_.Name -split ':')[0] }
foreach ($g in $byFile) {
  "### $($g.Name)  ($($g.Count) lineas)"
  $g.Group | Select-Object -First 16 | ForEach-Object {
    $num = ($_.Name -split ':')[1]
    "  $num`:$($_.Value)"
  }
  if ($g.Count -gt 16) { "  ... ($($g.Count) - 16 mas)" }
  ''
}