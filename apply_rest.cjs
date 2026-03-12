const fs = require('fs');
function replaceOne(path, oldValue, newValue) {
  const text = fs.readFileSync(path, 'utf8');
  if (!text.includes(oldValue)) throw new Error('Missing snippet in ' + path);
  fs.writeFileSync(path, text.replace(oldValue, newValue));
}
const lt = String.fromCharCode(60);
const gt = String.fromCharCode(62);
const q = String.fromCharCode(34);
const oldHint = '                      ?????????: ' + lt + 'span className=' + q + 'font-bold' + q + gt + '{currentItem.answer}' + lt + '/span' + gt;
const newHint = '                      ?????????: ' + lt + 'span className=' + q + 'font-bold' + q + gt + '{currentItem.primaryAnswer ?? currentItem.answer}' + lt + '/span' + gt;
replaceOne('C:/sss/src/components/Test.tsx', oldHint, newHint);
replaceOne('C:/sss/package.json', '    \\\"build\\\": \\\"vite build && shx cp dist/index.html index.html\\\",', '    \\\"build\\\": \\\"vite build && shx cp dist/index.html index.html ^&^& shx cp dist/icons8-bmw.svg icons8-bmw.svg\\\",');
