import {DatabaseSync} from 'node:sqlite';
export function checkedProvider(path,p){
  const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;CREATE TABLE IF NOT EXISTS field(id INTEGER PRIMARY KEY,version TEXT,value TEXT);CREATE TABLE IF NOT EXISTS writes(id INTEGER PRIMARY KEY)');
  db.prepare('INSERT OR IGNORE INTO field VALUES (1,?,?)').run(p.payload.expectedFingerprint,JSON.stringify('old'));
  const view=()=>{const row=db.prepare('SELECT * FROM field').get();return{schemaVersion:'1.0',providerId:p.providerId,subjectId:p.subjectId,fieldId:p.fieldId,generation:p.generation,version:row.version,value:JSON.parse(row.value),appliedToken:null};};
  const adapter={capabilities:{schemaVersion:'1.0',mode:'checked',durableWriteIdentity:false},dropReply:false,
    async read(){return view();},async write(projection){
      db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE field SET value=?,version=? WHERE id=1').run(JSON.stringify(projection.payload.value),'written-v2');db.exec('INSERT INTO writes DEFAULT VALUES;COMMIT');
      if(this.dropReply)throw Error('reply lost after actual write');return view();
    }};
  return{adapter,view,close:()=>db.close(),count:()=>Number(db.prepare('SELECT count(*) AS n FROM writes').get().n),
    human(value='human'){db.prepare('UPDATE field SET value=?,version=? WHERE id=1').run(JSON.stringify(value),'human-v3');}};
}
