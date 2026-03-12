$path = 'C:\sss\src\components\Results.tsx' 
$lines = Get-Content -Path $path 
$out = New-Object System.Collections.Generic.List[string] 
foreach ($line in $lines) { 
  if ($line.Contains('{message}')) { $out.Add('          {message}'); continue } 
  $out.Add($line) 
} 
Set-Content -Path $path -Value $out 
