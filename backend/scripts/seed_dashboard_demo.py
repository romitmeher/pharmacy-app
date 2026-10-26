"""Labelled, atomic demo activity for the eight-photo Aiven store. No external payments."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datetime import datetime, timedelta, timezone, time
from decimal import Decimal
import argparse
import json
import random

from app import create_app
from app.extensions import db
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location, LocationType
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod, PaymentStatus, Customer
from app.models.supplier import Supplier
from app.models.purchase import PurchaseInvoice, PurchaseItem, PurchaseInvoiceStatus
from app.models.expense import Expense, ExpenseCategory, ExpensePaymentMethod
from app.services.audit_service import log_audit_event

PREFIX = 'DEMO-DASH-20261026'
NOTE = 'DEMO DATA: fictional classroom activity; no real customer, payment or supplier order.'
IST = timezone(timedelta(hours=5, minutes=30))
NAMES = ('Telmikind-H','Amlokind-AT','Cyclomine','Cheston Cold','Dromef','Nu Cat Kof','Multiprex','Candiforce-200')


def money(value):
    return Decimal(str(value or 0)).quantize(Decimal('.01'))


def seed(store_id, owner_id, now):
    """Caller owns commit/rollback; all rows stay in one store-locked transaction."""
    db.session.query(Store).filter_by(id=store_id).with_for_update().one()
    if Sale.query.filter(Sale.store_id==store_id, Sale.invoice_number.like(PREFIX+'%')).first():
        return {'already_seeded':True,'sale_count':Sale.query.filter(Sale.store_id==store_id,Sale.invoice_number.like(PREFIX+'%')).count()}
    medicines = {m.brand_name:m for m in Medicine.query.filter_by(store_id=store_id,is_active=True).all()}
    if set(medicines)!=set(NAMES) or any(m.category!='Paired photo demo' for m in medicines.values()):
        raise ValueError('This seed requires exactly the eight paired-photo demo medicines.')
    today=now.astimezone(IST).date()
    batches=Batch.query.filter(Batch.store_id==store_id,Batch.batch_number.like('DEMO-PAIR-20261025-%'),Batch.expiry_date>=today).order_by(Batch.expiry_date,Batch.id).all()
    by_medicine={m.id:[] for m in medicines.values()}
    for batch in batches:
        if batch.medicine_id in by_medicine:
            rows=Inventory.query.filter_by(store_id=store_id,batch_id=batch.id).with_for_update().all()
            by_medicine[batch.medicine_id].extend((batch,row) for row in rows)
    snapshot=[{'id':row.id,'batch_id':batch.id,'quantity_available':row.quantity_available,'quantity_reserved':row.quantity_reserved}
              for rows in by_medicine.values() for batch,row in rows]
    if any(not rows for rows in by_medicine.values()):
        raise ValueError('Expected original demo stock for each medicine.')
    suppliers=[]
    for label in ['Westside Pharma Distributors','Greenline Medical Supply','Citycare Wholesale']:
        supplier=Supplier(store_id=store_id,name='Demo · '+label,contact_person='Demo support',email='orders@demo.example',address=NOTE,is_active=True)
        db.session.add(supplier);suppliers.append(supplier)
    customers=[Customer(store_id=store_id,name=f'Demo Customer {index+1:02d}',address=NOTE) for index in range(12)]
    db.session.add_all(customers);db.session.flush()
    # A fictional opening invoice documents the existing demo stock, without
    # booking it a second time. Sales below consume that stock, never unrelated batches.
    opening=PurchaseInvoice(store_id=store_id,supplier_id=suppliers[0].id,user_id=owner_id,
        invoice_number=PREFIX+'-OPEN',invoice_date=today-timedelta(days=7),status=PurchaseInvoiceStatus.ACCEPTED,notes=NOTE+' Opening stock reference; inventory already booked.')
    db.session.add(opening);db.session.flush()
    for batch in batches:
        med=next(m for m in medicines.values() if m.id==batch.medicine_id)
        cost=money(batch.purchase_price or money(med.mrp)*Decimal('.7'))
        total=cost*batch.quantity_received
        db.session.add(PurchaseItem(purchase_invoice_id=opening.id,medicine_id=med.id,raw_medicine_name=med.brand_name,
            batch_number=batch.batch_number,expiry_date=batch.expiry_date,quantity=batch.quantity_received,
            received_quantity=batch.quantity_received,purchase_rate=cost,mrp=batch.mrp,total_amount=total,batch_id=batch.id,is_verified=True))
        opening.subtotal=money(opening.subtotal)+total
    opening.total_amount=opening.subtotal
    # Draw only from known demo inventory. Low-stock scenarios result from these
    # documented sales, rather than an unexplained reset of existing balances.
    chunks=[]
    targets=[7,9,6]
    sold_by_name={}
    for index,name in enumerate(NAMES):
        med=medicines[name]
        available=sum(row.quantity_available for _,row in by_medicine[med.id])
        sold=max(0,available-targets[index]) if index<3 else min(available,[12,15,10,8,14][index-3])
        sold_by_name[name]=sold
        remaining=sold;number=0
        while remaining:
            qty=min(remaining,2+(index+number)%3);chunks.append((med,qty));remaining-=qty;number+=1
    random.Random(20261026).shuffle(chunks)
    if not chunks:
        raise ValueError('Demo stock is depleted; no history was imported.')
    bucket_count=min(50,len(chunks));buckets=[{} for _ in range(bucket_count)]
    for index,(med,qty) in enumerate(chunks):
        bucket=buckets[index%bucket_count];bucket[med.id]=bucket.get(med.id,0)+qty
    created_sales=[]
    for index,bucket in enumerate(buckets):
        day_index=min(6,index*7//bucket_count)
        local_day=today-timedelta(days=6-day_index)
        if local_day==today:
            start=datetime.combine(today,time.min,tzinfo=IST)
            elapsed=max(1,(now.astimezone(IST)-start).total_seconds()-30)
            local_stamp=start+timedelta(seconds=elapsed*((index%7)+1)/9)
        else:
            local_stamp=datetime.combine(local_day,time(10+index%9,(index*13)%60),tzinfo=IST)
        stamp=local_stamp.astimezone(timezone.utc).replace(tzinfo=None)
        sale=Sale(store_id=store_id,user_id=owner_id,customer_id=customers[index%len(customers)].id,
            invoice_number=f'{PREFIX}-SALE-{index+1:03d}',sale_date=stamp,notes=NOTE,
            payment_status=PaymentStatus.PAID,subtotal=0,tax_amount=0,total_amount=0)
        db.session.add(sale);db.session.flush()
        for med_id,quantity in bucket.items():
            med=next(m for m in medicines.values() if m.id==med_id)
            left=quantity
            for batch,stock in by_medicine[med_id]:
                take=min(left,stock.quantity_available)
                if not take:continue
                price=money(batch.mrp or med.selling_price or med.mrp);rate=money(med.gst_percentage)
                gross=price*take;tax=money(gross*rate/100)
                db.session.add(SaleItem(sale_id=sale.id,medicine_id=med_id,batch_id=batch.id,quantity=take,
                    unit_price=price,tax_percentage=rate,discount_percentage=0,total_price=gross+tax))
                stock.quantity_available-=take;left-=take
                sale.subtotal=money(sale.subtotal)+gross;sale.tax_amount=money(sale.tax_amount)+tax
                if not left:break
            if left:raise ValueError('Demo allocation exceeds stock; transaction will roll back.')
        sale.total_amount=money(sale.subtotal)+money(sale.tax_amount)
        method=[PaymentMethod.CASH,PaymentMethod.UPI,PaymentMethod.CARD][index%3]
        db.session.add(Payment(sale_id=sale.id,store_id=store_id,payment_method=method,amount=sale.total_amount,
            transaction_reference=f'{PREFIX}-FICTIONAL-{index+1}',payment_date=stamp))
        log_audit_event(store_id,'sale',sale.id,'CREATE',NOTE,new_values={'invoice_number':sale.invoice_number,'total_amount':str(sale.total_amount)},user_id=owner_id)
        created_sales.append(sale.id)
    # Near-expiry demonstration stock is new intake on clearly marked batches.
    shelf=Location(store_id=store_id,name='Demo · Near-expiry review',description=NOTE,location_type=LocationType.SHELF,is_active=True)
    db.session.add(shelf);db.session.flush()
    accepted=PurchaseInvoice(store_id=store_id,supplier_id=suppliers[1].id,user_id=owner_id,
        invoice_number=PREFIX+'-INWARD',invoice_date=today,status=PurchaseInvoiceStatus.ACCEPTED,notes=NOTE,subtotal=0,total_amount=0)
    db.session.add(accepted);db.session.flush()
    new_batches=[]
    for index,(name,qty,days) in enumerate([('Dromef',4,5),('Multiprex',7,14),('Nu Cat Kof',9,27)]):
        med=medicines[name];price=money(med.mrp);cost=money(price*Decimal('.7'))
        batch=Batch(store_id=store_id,medicine_id=med.id,batch_number=f'{PREFIX}-EXP-{index+1}',
            expiry_date=today+timedelta(days=days),manufacturing_date=today-timedelta(days=90),purchase_price=cost,mrp=price,quantity_received=qty)
        db.session.add(batch);db.session.flush();new_batches.append(batch.id)
        db.session.add(Inventory(store_id=store_id,batch_id=batch.id,location_id=shelf.id,quantity_available=qty))
        db.session.add(PurchaseItem(purchase_invoice_id=accepted.id,medicine_id=med.id,raw_medicine_name=med.brand_name,
            batch_number=batch.batch_number,expiry_date=batch.expiry_date,quantity=qty,received_quantity=qty,purchase_rate=cost,
            mrp=price,total_amount=cost*qty,batch_id=batch.id,is_verified=True))
        accepted.subtotal=money(accepted.subtotal)+cost*qty
    accepted.total_amount=accepted.subtotal
    for index,name in enumerate(['Cheston Cold','Dromef','Candiforce-200']):
        med=medicines[name];cost=money(med.mrp)*Decimal('.7')
        invoice=PurchaseInvoice(store_id=store_id,supplier_id=suppliers[index].id,user_id=owner_id,
            invoice_number=f'{PREFIX}-DRAFT-{index+1}',invoice_date=today,status=PurchaseInvoiceStatus.DRAFT,
            subtotal=cost*20,total_amount=cost*20,notes=NOTE+' Pending demo delivery; no stock booked.')
        db.session.add(invoice);db.session.flush()
        db.session.add(PurchaseItem(purchase_invoice_id=invoice.id,medicine_id=med.id,raw_medicine_name=med.brand_name,
            batch_number=f'{PREFIX}-PENDING-{index+1}',expiry_date=today+timedelta(days=400),quantity=20,received_quantity=0,
            purchase_rate=cost,mrp=med.mrp,total_amount=cost*20,is_verified=False))
    for index,(category,amount) in enumerate([(ExpenseCategory.RENT,1800),(ExpenseCategory.UTILITIES_POWER,360),
        (ExpenseCategory.LOGISTICS_PACKAGING,120),(ExpenseCategory.MISCELLANEOUS,80),
        (ExpenseCategory.STAFF_SALARY,1250),(ExpenseCategory.MARKETING_PROMOTION,150)]):
        db.session.add(Expense(store_id=store_id,user_id=owner_id,expense_number=f'{PREFIX}-EXPENSE-{index+1}',
            category=category,amount=amount,payment_method=ExpensePaymentMethod.BANK_TRANSFER,
            expense_date=today-timedelta(days=index),vendor_recipient='Demo operating vendor',notes=NOTE))
    db.session.flush()
    report={'already_seeded':False,'store_id':store_id,'sale_count':len(created_sales),'sale_ids':created_sales,
        'new_suppliers':3,'new_customers':12,'new_purchases':5,'draft_purchases':3,'new_expenses':6,
        'new_batch_ids':new_batches,'inventory_before':snapshot,'units_sold_by_medicine':sold_by_name,'active_medicines':8}
    log_audit_event(store_id,'demo_dataset',PREFIX,'CREATE',NOTE,old_values={'inventory':snapshot},
        new_values={k:v for k,v in report.items() if k!='inventory_before'},user_id=owner_id)
    return report


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    if not args.apply:raise SystemExit('Use --apply to import labelled demo activity into the configured Aiven store.')
    app=create_app()
    with app.app_context():
        if db.engine.dialect.name!='mysql':raise ValueError('Expected the shared Aiven MySQL database.')
        owner=User.query.filter_by(email='admin@smartpharm.com',is_active=True,role=UserRole.OWNER).one()
        try:
            report=seed(owner.store_id,owner.id,datetime.now(timezone.utc))
            folder=Path(__file__).resolve().parents[2]/'data/backups';folder.mkdir(parents=True,exist_ok=True)
            destination=folder/(PREFIX+'-import.json')
            if not report['already_seeded']:destination.write_text(json.dumps(report,indent=2),encoding='utf-8')
            db.session.commit()
            print(json.dumps({k:v for k,v in report.items() if k not in ('inventory_before','sale_ids')},indent=2))
        except Exception:
            db.session.rollback();raise


if __name__=='__main__':main()
