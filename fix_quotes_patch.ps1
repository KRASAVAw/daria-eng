$p = 'C:\sss\patch_apply_fix.cjs'
$s = Get-Content -Raw $p
$s = $s.Replace('\"', [string][char]34)
Set-Content -Path $p -Value $s
