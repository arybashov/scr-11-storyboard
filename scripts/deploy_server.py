"""Deploy this API to an existing host. Secrets never enter Git or command output."""
import argparse
import json
from pathlib import Path
import secrets
import shlex
import subprocess
import sys
import uuid

sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser()
parser.add_argument('--host',required=True)
parser.add_argument('--key',required=True)
parser.add_argument('--ssh',default='ssh')
parser.add_argument('--scp',default='scp')
parser.add_argument('--access-file',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
common=['-F','/dev/null','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-i',args.key]
def remote(command, data=None, capture=False):
    result=subprocess.run([args.ssh,*common,args.host,command],input=data.encode('utf-8') if data else None,capture_output=capture)
    if result.returncode:
        if capture: print(result.stderr.decode('utf-8',errors='replace'), file=sys.stderr)
        raise RuntimeError('Remote command failed')
    return result.stdout.decode('utf-8',errors='replace') if capture else ''

stage='/tmp/kino-deploy-'+uuid.uuid4().hex
remote('mkdir -m 700 '+shlex.quote(stage))
for file in ['server/server.mjs','server/server.test.mjs','server/package.json','server/package-lock.json','deploy/kino-board.service','deploy/kino-api.nginx']:
    subprocess.run([args.scp,*common,str(root/file),args.host+':'+stage+'/'],check=True)

remote("""set -eu
id kino-board >/dev/null 2>&1 || useradd --system --home /var/lib/kino-board --shell /usr/sbin/nologin kino-board
install -d -m 755 /opt/kino-board
install -d -m 750 -o kino-board -g kino-board /var/lib/kino-board
install -d -m 700 /etc/kino-board
""")

exists=remote('test -f /etc/kino-board/environment && echo yes || echo no',capture=True).strip()
if exists=='no':
    code=secrets.token_urlsafe(15)
    config='\n'.join(['DATA_DIR=/var/lib/kino-board','PORT=8792','MAX_STORAGE_BYTES=1073741824','ALLOWED_ORIGINS=https://arybashov.github.io,http://127.0.0.1:8871','TEAM_ACCESS_CODE='+code,'SESSION_SECRET='+secrets.token_urlsafe(48)])+'\n'
    remote('umask 077; cat > /etc/kino-board/environment',data=config)
else:
    remote("python3 -c \"from pathlib import Path; p=Path('/etc/kino-board/environment'); p.write_bytes(p.read_bytes().replace(bytes([13,10]),bytes([10])))\"")
    # Read only the project access code, in memory, never printing it.
    code=remote("sed -n 's/^TEAM_ACCESS_CODE=//p' /etc/kino-board/environment",capture=True).strip()
access=Path(args.access_file)
access.write_text('Подземный переход — доступ команды\n\nСтраница: https://arybashov.github.io/scr-11-storyboard/\nКод проекта: '+code+'\n\nОткройте «Раскадровка» → «Войти для загрузки».\nВведите своё имя и код. Изображения и сценарий доступны по ссылке; код защищает загрузку и выбор основных версий.\nКод не публикуется в GitHub.\n',encoding='utf-8')

remote('bash -se', data=f"""set -eu
stage={shlex.quote(stage)}
cd "$stage"
npm ci --omit=dev --no-fund
node --test server.test.mjs
cp server.mjs package.json package-lock.json /opt/kino-board/
cp -a node_modules /opt/kino-board/
install -m 644 kino-board.service /etc/systemd/system/kino-board.service
install -m 644 kino-api.nginx /etc/nginx/snippets/kino-api.conf
python3 - <<'PY'
from pathlib import Path
import time
p=Path('/etc/nginx/sites-available/yui.conf')
text=p.read_text()
include='    include /etc/nginx/snippets/kino-api.conf;'
if include not in text:
    anchor='    server_name yui.com.ru;'
    if text.count(anchor)!=2 or 'listen 443 ssl' not in text:
        raise SystemExit('Unexpected nginx config, refusing automatic edit')
    backup=p.with_name('yui.conf.before-kino-'+str(int(time.time())))
    backup.write_text(text)
    p.write_text(text.replace(anchor,anchor+'\\n'+include,1))
PY
nginx -t
systemctl daemon-reload
systemctl enable --now kino-board
systemctl restart kino-board
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:8792/health; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8792/health
systemctl reload nginx
for attempt in 1 2 3 4 5; do
  if curl -fsS https://yui.com.ru/kino-api/health | grep -q 'kino-storyboard'; then break; fi
  sleep 1
done
curl -fsS https://yui.com.ru/kino-api/health | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["service"]=="kino-storyboard" and d["ok"]; print("Public API healthy")'
printf '\\n'
systemctl is-active kino-board
curl -fsS http://127.0.0.1:8790/health
printf '\\n'
curl -fsS http://127.0.0.1:8787/health
printf '\\n'
""")
print(json.dumps({'deployed':True,'api':'https://yui.com.ru/kino-api','accessFile':str(access)},ensure_ascii=False))
