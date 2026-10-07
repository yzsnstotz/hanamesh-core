import os, sys, subprocess, json, tempfile
from pathlib import Path
root = Path('/Users/yzliu/.cache/hanamesh-runs/P04-CORE-CONSENT-01')
repo = Path('/Users/yzliu/work/projects/hanamesh/hanamesh-core')
node_bin = '/Users/yzliu/.local/share/fnm/node-versions/v24.13.1/installation/bin'
for name in ['home', 'dsh-home', 'tmp', 'engineering']:
    (root / name).mkdir(parents=True, exist_ok=True, mode=0o700)
env = {'PATH': str(repo / 'node_modules/.bin') + ':' + node_bin + ':/Users/yzliu/.local/bin:/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-path:/usr/bin:/bin:/usr/sbin:/sbin',
       'HOME': str(root / 'home'), 'DSH_HOME': str(root / 'dsh-home'), 'TMPDIR': str(root / 'tmp'),
       'LANG': 'en_US.UTF-8', 'npm_config_userconfig': '/dev/null', 'npm_config_cache': tempfile.mkdtemp(prefix='npm-', dir=root / 'tmp'),
       'HM_CORE_RUN': str(root / 'engineering'), 'HANAMESH_UMBRELLA': str(repo.parent)}
name, *argv = sys.argv[1:]
with (root / 'engineering' / name).open('w') as log:
    result = subprocess.run(argv, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
check = {'log': name, 'argv': argv, 'exit_code': result.returncode, 'environment': {'HOME': env['HOME'], 'DSH_HOME': env['DSH_HOME'], 'npm_config_userconfig': '/dev/null', 'inherited_credentials': False}}
(root / 'engineering' / (name + '.command.json')).write_text(json.dumps(check, indent=2) + '\n')
print('\n'.join((root / 'engineering' / name).read_text().splitlines()[-24:]))
print('ACTUAL_COMMAND_EXIT=' + str(result.returncode))
sys.exit(result.returncode)
