// Windows integration entry point added for Micky. The original macOS files remain separate.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const wakePhrases=['Micky','Mickey','Hey Jev','Hey Jeff','Jev'];
function normalizeTranscript(text,repo=path.resolve(__dirname,'..')){
 const file=path.join(repo,'.data','heyjev','vocabulary.json');let vocabulary={};try{vocabulary=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 let corrected=String(text).replace(/^\s*(?:hey\s+(?:jev|jeff)|micky|mickey)[,.:!]?\s+/i,'').trim();
 for(const [word,aliases] of Object.entries(vocabulary)){if(typeof word!=='string'||!Array.isArray(aliases))continue;for(const alias of aliases){if(typeof alias!=='string'||!alias.trim())continue;const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');corrected=corrected.replace(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu'),()=>word);}}
 return corrected;
}
async function launch(repo=path.resolve(__dirname,'..')){return require(path.join(repo,'desktop/native-apps.cjs')).launch(repo,'heyjev');}
module.exports={wakePhrases,normalizeTranscript,launch};
if(require.main===module)launch().catch(error=>{console.error(error.message);process.exitCode=1;});
