const fs = require('fs');
let s = fs.readFileSync('C:/sss/update_answers_and_build.cjs', 'utf8');
s = s.replace(\"replaceOne('C:/sss/src/components/Test.tsx', 'currentItem.answer', 'currentItem.primaryAnswer ?? currentItem.answer');\", \"replaceOne('C:/sss/src/components/Test.tsx', '                      ?????????: <span className=\\\"font-bold\\\">{currentItem.answer}</span>', '                      ?????????: <span className=\\\"font-bold\\\">{currentItem.primaryAnswer ?? currentItem.answer}</span>');\");
s += \"\r\nreplaceOne('C:/sss/src/index.html', './icons8-bmw.svg', './icons8-bmw.svg');\";
s += \"\r\nreplaceOne('C:/sss/package.json', '    \\\"build\\\": \\\"vite build 
