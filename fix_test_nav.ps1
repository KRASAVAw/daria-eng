$path = 'C:\sss\src\components\Test.tsx' 
$lines = Get-Content -Path $path 
$out = New-Object System.Collections.Generic.List[string] 
$replacePromptNext = $false 
$skipState = $false 
$skipHandle = $false 
$skipBottom = $false 
$insertedSyncEffect = $false 
$ru = '\u0414\u0410\u0428\u0410, \u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u0440\u0443\u0441\u0441\u043a\u043e\u043c \u044f\u0437\u044b\u043a\u0435' 
$en = '\u0414\u0410\u0428\u0410, \u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u043e\u043c \u044f\u0437\u044b\u043a\u0435' 
foreach ($line in $lines) { 
  if ($skipBottom) { 
