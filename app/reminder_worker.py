"""Run `python -m app.reminder_worker --once` or --loop.
Set SMTP_* environment variables and SMTP_ENABLED=true to really send messages.
Without SMTP, due reminders are logged as preview, not incorrectly marked sent.
"""
import argparse, os, smtplib, time
from datetime import datetime, timezone
from email.message import EmailMessage
from app.main import conn, init_db, now

def deliver(email,client,starts_at,kind):
    if os.getenv('SMTP_ENABLED','false').lower()!='true':
        print(f'[DRY RUN] {kind} reminder for {client} at {email}, appointment {starts_at}')
        return False
    required=['SMTP_HOST','SMTP_PORT','SMTP_FROM','SMTP_USERNAME','SMTP_PASSWORD']
    missing=[k for k in required if not os.getenv(k)]
    if missing: raise RuntimeError('Missing SMTP configuration: '+', '.join(missing))
    msg=EmailMessage();msg['From']=os.environ['SMTP_FROM'];msg['To']=email
    msg['Subject']='Appointment reminder — SmartSchedule'
    msg.set_content(f'Hello {client},\n\nYour appointment is scheduled for {starts_at}. This is your {kind} reminder.\n\nSmartSchedule')
    with smtplib.SMTP(os.environ['SMTP_HOST'],int(os.environ['SMTP_PORT']),timeout=15) as server:
        server.starttls();server.login(os.environ['SMTP_USERNAME'],os.environ['SMTP_PASSWORD']);server.send_message(msg)
    return True

def tick():
    init_db()
    with conn() as db:
        rows=[dict(x) for x in db.execute('''SELECT r.*,a.client,a.email,a.starts_at FROM reminders r
          JOIN appointments a ON a.id=r.appointment_id WHERE r.status='pending'
          AND a.status='scheduled' AND r.due_at<=? ORDER BY r.due_at LIMIT 50''',(now(),))]
    for r in rows:
        try:
            sent=deliver(r['email'],r['client'],r['starts_at'],r['kind'])
            if sent:
                with conn() as db:
                    db.execute("UPDATE reminders SET status='sent',sent_at=?,error=NULL WHERE id=? AND status='pending'",(now(),r['id']))
                    db.execute('INSERT INTO audit(appointment_id,action,detail,at) VALUES (?,?,?,?)', (r['appointment_id'],'reminder',r['kind']+' email sent',now()))
        except Exception as exc:
            with conn() as db:
                db.execute('UPDATE reminders SET error=? WHERE id=?',(str(exc)[:300],r['id']))
            print('Reminder failed:',r['id'],exc)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--once',action='store_true');p.add_argument('--loop',action='store_true');args=p.parse_args()
    if not (args.once or args.loop): p.error('specify --once or --loop')
    while True:
        tick()
        if not args.loop:break
        time.sleep(60)
