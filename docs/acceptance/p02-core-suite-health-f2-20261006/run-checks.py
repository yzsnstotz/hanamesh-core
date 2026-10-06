from pathlib import Path
import subprocess,sys,json
run=Path(__file__).resolve().parent
ev=run.parent/'_evidence/suite-health-f2'
node='/Users/yzliu/.local/share/fnm/node-versions/v24.13.1/installation/bin/node'
env={'PATH':str(Path(node).parent)+':'+str(Path.cwd()/'node_modules/.bin')+':'+str(run/'bin')+':/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(run/'home'),'DSH_HOME':str(run/'dsh-home'),'TMPDIR':str(run/'tmp'),'LANG':'en_US.UTF-8','NPM_CONFIG_USERCONFIG':'/dev/null','npm_config_cache':str(run/'npm-cache')}
checks=[('build.log',[node,'scripts/build.mjs','--target']),('test-f2.tap',[node,'--test','--test-reporter=tap','test/suite-health-f2.test.mjs']),('test-full.tap',[node,'--test','--test-reporter=tap',*[str(p) for p in sorted(Path('test').glob('*.test.mjs'))]]),('inputs.log',[node,'scripts/verify-inputs.mjs']),('contracts.log',['tsc','--noEmit','--strict','--skipLibCheck','false','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','test/public-contracts.ts']),('pack.log',['npm','pack','--ignore-scripts','--pack-destination',str(run/'latest')])]
results=[]
for name,args in checks:
 with (ev/name).open('w') as out:
  r=subprocess.run(args,env=env,stdout=out,stderr=subprocess.STDOUT)
 print(name,'exit',r.returncode,flush=True)
 results.append({'log':name,'argv':args,'exit':r.returncode})
 if r.returncode:
  print((ev/name).read_text()[-5000:]);break
(ev/'checks.json').write_text(json.dumps(results,indent=2)+'\n')
sys.exit(r.returncode)
