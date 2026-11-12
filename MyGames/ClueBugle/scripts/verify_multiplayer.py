#!/usr/bin/env python3
"""Integration smoke test of deployed ClueBugle multiplayer.
Creates a disposable room in the target Supabase Games project. No credentials
needed when the Edge Function is deployed with --no-verify-jwt.
Run only AFTER the SQL schema and multiplayer Edge Function have been deployed.
"""
import json, urllib.request, urllib.error, sys
URL = 'https://joqypdrkojtinlflbvur.supabase.co/functions/v1/cluebugle'

def request(**data):
    req=urllib.request.Request(URL,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            obj=json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode()[:450]}') from e
    if obj.get('error'):raise RuntimeError(obj['error'])
    return obj

def main():
    a=request(action='create',name='SmokeTestHost')
    code=a['code'];players=[a]
    print('Created room:',code)
    for name in ['RedGuesser','BlueSpymaster','BlueGuesser']:
        players.append(request(action='join',code=code,name=name))
    for player,team,role in [(players[0],'red','spymaster'),(players[1],'red','guesser'),(players[2],'blue','spymaster'),(players[3],'blue','guesser')]:
        request(action='seat',code=code,token=player['token'],team=team,role=role)
    started=request(action='start',code=code,token=players[0]['token'])
    game=started['state']; assert len(game['words'])==25
    for i in [1,3]:
        visible=request(action='state',code=code,token=players[i]['token'])['state']
        assert all(k is None for k in visible['keys']), 'Secrecy violation: guesser can see hidden colors'
    first=game['turn'];spy=players[0] if first=='red' else players[2]
    guesser=players[1] if first=='red' else players[3]
    request(action='clue',code=code,token=spy['token'],word='TESTING',n=1)
    state=request(action='state',code=code,token=guesser['token'])['state']
    assert state['phase']=='guess', 'Clue did not advance turn'
    request(action='guess',code=code,token=guesser['token'],index=0)
    final=request(action='state',code=code,token=guesser['token'])['state']
    assert final['revealed'][0] is True, 'Guess not saved'
    print('PASS: create, join, seating, start, private key, clue, guess, persisted state')
    print('A test room remains in the DB:',code)
if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('FAIL:',exc,file=sys.stderr);sys.exit(1)
