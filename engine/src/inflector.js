// English Doctrine Inflector 2.1 rules, used by Laravel's default resource registrar.
// Rule data is MIT licensed; see licenses/doctrine-inflector.txt. No target PHP executes.
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('./data/doctrine-english.json',import.meta.url),'utf8'));
const uninflected=new RegExp('^(?:'+data.uninflected.join('|')+')$','i');
const rules=data.rules.map(([pattern,replacement])=>[new RegExp(pattern,'gi'),replacement]);
export function singular(word){
  if(!word||uninflected.test(word))return word;
  const lower=word.toLowerCase(),irregular=data.irregular[lower];
  if(irregular&&irregular!==word)return word[0]!==lower[0]?irregular[0].toUpperCase()+irregular.slice(1):irregular;
  for(const [regex,replacement]of rules){regex.lastIndex=0;if(regex.test(word)){regex.lastIndex=0;return word.replace(regex,(...args)=>replacement.replace(/\\(\d+)/g,(_,i)=>typeof args[Number(i)]==='string'?args[Number(i)]:''));}}
  return word;
}
