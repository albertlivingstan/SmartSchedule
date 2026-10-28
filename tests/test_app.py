import importlib
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

def setup_module(module):
    import os,tempfile
    module.tmp=tempfile.TemporaryDirectory()
    os.environ['SMARTSCHEDULE_DB']=module.tmp.name+'/test.db'
    os.environ['SMARTSCHEDULE_API_KEY']='test-key'
    from app import main
    module.m=importlib.reload(main)
    module.m.init_db()
    module.c=TestClient(module.m.app)
    module.h={'X-API-Key':'test-key'}

def future(hours=72): return (datetime.now(timezone.utc)+timedelta(hours=hours)).isoformat()

def test_security_and_health():
    assert c.get('/health').status_code==200
    assert c.get('/api/stats').status_code==401

def test_booking_conflict_duplicate_and_reminders():
    p={'client':'Asha Kumar','email':'asha@example.org','service':'Consultation','staff':'Staff A','starts_at':future(),'duration_minutes':30,'external_id':'booking-1'}
    r=c.post('/api/appointments',headers=h,json=p);assert r.status_code==201,r.text
    aid=r.json()['appointment']['id']
    assert r.json()['duplicate'] is False
    duplicate=c.post('/api/appointments',headers=h,json=p)
    assert duplicate.status_code==201 and duplicate.json()['duplicate'] is True
    conflict=c.post('/api/appointments',headers=h,json={**p,'external_id':'booking-2'})
    assert conflict.status_code==409
    reminders=c.get('/api/reminders',headers=h).json()
    assert len(reminders)==2
    assert c.patch(f'/api/appointments/{aid}',headers=h,json={'status':'completed'}).status_code==200
    assert c.get('/api/appointments/'+str(aid)+'/audit',headers=h).json()[0]['action']=='status'
    assert all(x['status']=='cancelled' for x in c.get('/api/reminders',headers=h).json())

def test_reports_and_validation():
    assert c.get('/api/stats',headers=h).json()['total']==1
    assert 'Asha Kumar' in c.get('/api/export.csv',headers=h).text
    invalid={'client':'Asha Kumar','email':'asha@example.org','service':'Consultation','staff':'Staff B','starts_at':'2026-12-01T10:00:00','duration_minutes':30}
    assert c.post('/api/appointments',headers=h,json=invalid).status_code==422
