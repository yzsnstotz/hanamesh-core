from pathlib import Path
import json,hashlib,time,os
r=Path(__file__).parent;p=r/'dsh-home/storages/hanamesh_core.json';b=r/'core-medium-restore-private.json';out={'medium':str(p),'mechanism':'real official JSON atomic rename hits a directory','restored':False}
original=p.read_bytes();data=json.loads(original);out['beforeSha256']=hashlib.sha256(original).hexdigest();out['beforeConsent']=data.get('global',{}).get('consent');out['beforeRevision']=data.get('global',{}).get('revision')
try:
 p.rename(b);os.chmod(b,0o600);p.mkdir(mode=0o700);inode=p.stat().st_ino;out['faultDirectoryInode']=inode;(r/'evidence/fault-active.json').write_text(json.dumps(out,indent=2))
 deadline=time.monotonic()+120
 while not (r/'restore-now').exists() and time.monotonic()<deadline:time.sleep(0.2)
finally:
 if p.is_dir() and p.stat().st_ino==inode:p.rmdir()
 if not p.exists() and b.exists():b.rename(p)
 out['restored']=p.is_file() and p.read_bytes()==original;out['afterSha256']=hashlib.sha256(p.read_bytes()).hexdigest();(r/'evidence/fault-finally.json').write_text(json.dumps(out,indent=2)+'\n')
