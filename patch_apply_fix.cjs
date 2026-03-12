const fs = require('fs');
let s = fs.readFileSync('C:/sss/apply_fix.ps1', 'utf8');
s = s.replace("  if ($test[$i] -match 'currentItem.answer' -and $test[$i] -match 'span className') { $test[$i] = '                      ?????????: ' + $lt + 'span className=' + $q + 'font-bold' + $q + $gt + '{currentItem.primaryAnswer ?? currentItem.answer}' + $lt + '/span' + $gt }", "  if ($test[$i] -match 'currentItem.answer' -and $test[$i] -match 'span className') { $test[$i] = $test[$i].Replace('currentItem.answer', 'currentItem.primaryAnswer ?? currentItem.answer') }");

