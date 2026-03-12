$ru = '\u0414\u0410\u0428\u0410, \u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u0440\u0443\u0441\u0441\u043a\u043e\u043c \u044f\u0437\u044b\u043a\u0435' 
$en = '\u0414\u0410\u0428\u0410, \u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u043e\u043c \u044f\u0437\u044b\u043a\u0435'
$final = '\u041c\u043e\u043b\u043e\u043e\u0434\u0435\u0446, \u0414\u0430\u0448\u0430! \u0422\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0430 \u0442\u0435\u0441\u0442. \u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0438 \u0441\u0432\u043e\u0438 \u043e\u0442\u0432\u0435\u0442\u044b \u043d\u0438\u0436\u0435, \u0440\u0430\u0434\u0443\u0439\u0441\u044f \u0438 \u043d\u0435 \u0433\u0440\u0443\u0441\u0442\u0438!'
 
$testPath = 'C:\sss\src\components\Test.tsx' 
$testOut = New-Object System.Collections.Generic.List[string] 
$replaceNext = $false 
foreach ($line in Get-Content -Path $testPath) {
  if ($replaceNext) { 
    $testOut.Add(\"                  {settings.direction === 'en_ru' ? '$ru' : '$en'}\") 
    $replaceNext = $false 
    continue 
  }
  $testOut.Add($line) 
  if ($line -match '\s*<p className=\"text-brand-grey text-sm leading-relaxed\">\s*$') { $replaceNext = $true } 
} 
Set-Content -Path $testPath -Value $testOut
 
$resultsPath = 'C:\sss\src\components\Results.tsx' 
$resultsOut = New-Object System.Collections.Generic.List[string] 
foreach ($line in Get-Content -Path $resultsPath) {
  if ($line -match '\{message\}') { 
    $resultsOut.Add(\"          {'$final'}\") 
    continue 
  } 
  $resultsOut.Add($line) 
} 
Set-Content -Path $resultsPath -Value $resultsOut
