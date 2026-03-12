const fs = require('fs');
let s = fs.readFileSync('C:/sss/update_answers_and_build.cjs', 'utf8');
const bad = \"\r\nreplaceOne('C:/sss/src/components/Test.tsx', 'currentItem.answer', 'currentItem.primaryAnswer ?? currentItem.answer');\";
s = s.replace(bad, '');
fs.writeFileSync('C:/sss/update_answers_and_build.cjs', s);
