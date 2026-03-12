$testPath = 'C:\sss\src\components\Test.tsx' 
$testLines = Get-Content -Path $testPath 
$out = New-Object System.Collections.Generic.List[string] 
$replacePromptNext = $false 
$skipStateBlock = $false 
$skipHandleSubmit = $false 
$skipBottom = $false 
$bottomDepth = 0 
