import os,sys,subprocess,json,tempfile
from pathlib import Path
r=Path(__file__).parent
repo=Path('/Users/yzliu/work/projects/hanamesh/hanamesh-core')
env={'PATH':str(repo/'node_modules/.bin')+':/Users/yzliu/.local/share/fnm/node-versions/v24.13.1/installation/bin:/Users/yzliu/.local/bin:/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-path:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(r/'home'),'DSH_HOME':str(r/'dsh-home'),'TMPDIR':str(r/'tmp'),'LANG':'en_US.UTF-8','npm_config_userconfig':'/dev/null','npm_config_cache':tempfile.mkdtemp(prefix='npm-',dir=r/'tmp')}
name,*args=sys.argv[1:]
with (r/'evidence'/name).open('w') as f:p=subprocess.run(args,cwd=repo,env=env,stdout=f,stderr=subprocess.STDOUT)
(r/'evidence'/(name+'.command.json')).write_text(json.dumps({'argv':args,'exit_code':p.returncode,'HOME':env['HOME'],'DSH_HOME':env['DSH_HOME'],'inherited_credentials':False},indent=2)+'\n')
print((r/'evidence'/name).read_text()[-3500:]); print('ACTUAL_EXIT='+str(p.returncode));sys.exit(p.returncode)
