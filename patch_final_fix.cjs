const fs = require('fs');
let s = fs.readFileSync('C:/sss/final_fix.cjs', 'utf8');
const q = String.fromCharCode(34);
s = s.split('\\' + q).join(q);
s = s.split(\"/ru: '[']+'/g\").join(\"/ru: '[^']+'/g\");
