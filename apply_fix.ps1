$typesPath = 'C:\sss\src\types.ts'
$types = Get-Content $typesPath
if (-not ($types -match 'primaryAnswer\?: string;')) {
  $idx = [Array]::IndexOf($types, '  acceptedAnswers?: string[];')
  if ($idx -ge 0) { $types = @($types[0..$idx] + '  primaryAnswer?: string;' + $types[($idx + 1)..($types.Length - 1)]) }
}
Set-Content -Path $typesPath -Value $types
$setupPath = 'C:\sss\src\components\Setup.tsx'
$setup = Get-Content $setupPath
for ($i = 0; $i -lt $setup.Length; $i++) {
  if ($setup[$i].Trim() -eq 'answer: toDisplayValue(answerVariants),') { $setup[$i] = '          answer: getPromptValue(answerVariants),' }
  if ($setup[$i].Trim() -eq 'acceptedAnswers: answerVariants,') { if ($setup[$i + 1] -notmatch 'primaryAnswer') { $setup = @($setup[0..$i] + '          primaryAnswer: getPromptValue(answerVariants),' + $setup[($i + 1)..($setup.Length - 1)]) } }
}
Set-Content -Path $setupPath -Value $setup
$testPath = 'C:\sss\src\components\Test.tsx'
$test = Get-Content $testPath
$lt = [char]60
$gt = [char]62
$q = [char]34
for ($i = 0; $i -lt $test.Length; $i++) {
  if ($test[$i] -match 'currentItem.answer' -and $test[$i] -match 'span className') { $test[$i] = '                      ?????????: ' + $lt + 'span className=' + $q + 'font-bold' + $q + $gt + '{currentItem.primaryAnswer ?? currentItem.answer}' + $lt + '/span' + $gt }
}
Set-Content -Path $testPath -Value $test
$pkgPath = 'C:\sss\package.json'
$pkg = Get-Content -Raw $pkgPath
$pkg = $pkg.Replace('    \"build\": \"vite build && shx cp dist/index.html index.html\",', '    \"build\": \"vite build && shx cp dist/index.html index.html && shx cp dist/icons8-bmw.svg icons8-bmw.svg\",')
Set-Content -Path $pkgPath -Value $pkg
