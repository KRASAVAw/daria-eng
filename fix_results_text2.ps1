$path = 'C:\sss\src\components\Results.tsx' 
$lines = Get-Content -Path $path 
$out = New-Object System.Collections.Generic.List[string] 
$msg = '\u041c\u043e\u043b\u043e\u043e\u0434\u0435\u0446, \u0414\u0430\u0448\u0430! \u0422\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0430 \u0442\u0435\u0441\u0442. \u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0438 \u0441\u0432\u043e\u0438 \u043e\u0442\u0432\u0435\u0442\u044b \u043d\u0438\u0436\u0435, \u0440\u0430\u0434\u0443\u0439\u0441\u044f \u0438 \u043d\u0435 \u0433\u0440\u0443\u0441\u0442\u0438!' 
$q = [char]34 
foreach ($line in $lines) { 
  if ($line -match '\s*let message =') { continue } 
  if ($line -match '\s*if \(percentage') { continue } 
  if ($line -match '\s*else if \(percentage') { continue } 
  if ($line -match '\\{message\\}') { $out.Add('          {message}'); continue } 
  $out.Add($line) 
  if ($line -match '\s*const percentage =') { $out.Add('  const message = ' + $q + $msg + $q + ';') } 
} 
Set-Content -Path $path -Value $out 
