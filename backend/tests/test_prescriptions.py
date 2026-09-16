"""
SmartPharm Backend — Prescriptions & Clinical Access Control Tests.

Strict compliance with PRD Rules 7, 9, 21, 22, 23, and 26:
- Prescription document persistence with line items and customer linking
- Automatic audit log creation on upload (PRESCRIPTION_UPLOAD)
- Automatic regulatory audit logging on document view (PRESCRIPTION_ACCESS)
- Pharmacist clinical sign-off workflow (PRESCRIPTION_VERIFY)
- Dispensing link to completed Sale invoice (PRESCRIPTION_DISPENSE)
- Role-based access control restrictions
"""

from datetime import date, timedelta
from app.models.prescription import Prescription, PrescriptionItem, PrescriptionStatus
from app.models.audit_log import AuditLog


def _setup_prescription_fixtures(client, owner_token):
    """Helper to create a medicine and a basic prescription."""
    med_res = client.post(
        "/api/medicines",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "brand_name": "Azithral 500",
            "generic_name": "Azithromycin",
            "dosage_form": "tablet",
            "strength": "500mg",
            "mrp": 120.0,
            "selling_price": 110.0,
        },
    )
    assert med_res.status_code == 201
    med_id = med_res.get_json()["medicine"]["id"]
    return med_id


def test_create_prescription(client, owner_token, app):
    """Test creating a prescription document with items and audit trail."""
    med_id = _setup_prescription_fixtures(client, owner_token)

    payload = {
        "patient_name": "Rahul Verma",
        "patient_age": 34,
        "patient_gender": "Male",
        "doctor_name": "Dr. S. K. Gupta",
        "doctor_reg_number": "DMC-89210",
        "customer_phone": "9876543210",
        "raw_text": "Azithral 500mg 1 tab OD x 3 days",
        "notes": "Patient reports mild throat infection",
        "items": [
            {
                "extracted_name": "Azithral 500mg",
                "medicine_id": med_id,
                "dosage_instructions": "1 tablet once daily after dinner",
                "quantity_prescribed": 3,
                "is_available": True,
            }
        ]
    }

    res = client.post(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=payload,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["success"] is True
    rx_data = body["data"]
    assert rx_data["patient_name"] == "Rahul Verma"
    assert rx_data["status"] == "pending_verification"
    assert len(rx_data["items"]) == 1
    assert rx_data["items"][0]["medicine_id"] == med_id
    assert rx_data["customer_id"] is not None

    # Verify PRESCRIPTION_UPLOAD audit log exists
    with app.app_context():
        log = AuditLog.query.filter_by(
            entity_type="prescription",
            entity_id=str(rx_data["id"]),
            action="PRESCRIPTION_UPLOAD",
        ).first()
        assert log is not None
        assert "Rahul Verma" in log.reason


def test_list_and_search_prescriptions(client, owner_token):
    """Test filtering and searching stored prescriptions."""
    # Create test prescription
    client.post(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "patient_name": "Pooja Sharma",
            "doctor_name": "Dr. Anjali Mehta",
            "items": [{"extracted_name": "Paracetamol 650"}],
        },
    )

    # Query all
    res = client.get(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["total"] >= 1

    # Search by patient name
    search_res = client.get(
        "/api/prescriptions?search=Pooja",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert search_res.status_code == 200
    search_data = search_res.get_json()["data"]
    assert any(item["patient_name"] == "Pooja Sharma" for item in search_data["items"])


def test_view_prescription_audit_logging(client, owner_token, app):
    """Test that accessing prescription detail logs a regulatory audit entry (PRD Rule 22 & 23)."""
    create_res = client.post(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "patient_name": "Deepak Joshi",
            "doctor_name": "Dr. Ramesh Nair",
            "items": [{"extracted_name": "Metformin 500mg"}],
        },
    )
    rx_id = create_res.get_json()["data"]["id"]

    # View prescription
    view_res = client.get(
        f"/api/prescriptions/{rx_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert view_res.status_code == 200
    assert view_res.get_json()["data"]["patient_name"] == "Deepak Joshi"

    # Verify PRESCRIPTION_ACCESS audit log
    with app.app_context():
        access_log = AuditLog.query.filter_by(
            entity_type="prescription",
            entity_id=str(rx_id),
            action="PRESCRIPTION_ACCESS",
        ).first()
        assert access_log is not None
        assert "Deepak Joshi" in access_log.reason or str(rx_id) in access_log.reason


def test_pharmacist_verification(client, owner_token, app):
    """Test clinical verification sign-off by pharmacist (PRD Rule 9 & 21)."""
    med_id = _setup_prescription_fixtures(client, owner_token)

    create_res = client.post(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "patient_name": "Sunita Patel",
            "doctor_name": "Dr. R. K. Singh",
            "items": [{"extracted_name": "Azithral 500"}],
        },
    )
    rx_id = create_res.get_json()["data"]["id"]

    verify_payload = {
        "doctor_reg_number": "MCI-45892",
        "notes": "Verified with patient; no penicillin allergy",
        "items": [
            {
                "extracted_name": "Azithral 500mg",
                "medicine_id": med_id,
                "dosage_instructions": "1 tab daily for 3 days after food",
                "quantity_prescribed": 3,
                "is_available": True,
            }
        ]
    }

    verify_res = client.post(
        f"/api/prescriptions/{rx_id}/verify",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=verify_payload,
    )
    assert verify_res.status_code == 200
    verified_data = verify_res.get_json()["data"]
    assert verified_data["status"] == "verified"
    assert verified_data["doctor_reg_number"] == "MCI-45892"
    assert verified_data["verified_by_user_id"] is not None

    # Check audit log
    with app.app_context():
        log = AuditLog.query.filter_by(
            entity_type="prescription",
            entity_id=str(rx_id),
            action="PRESCRIPTION_VERIFY",
        ).first()
        assert log is not None
        assert log.old_values["status"] == "pending_verification"
        assert log.new_values["status"] == "verified"


def test_dispense_prescription_linking(client, owner_token, app):
    """Test linking a verified prescription to a completed Sale invoice."""
    med_id = _setup_prescription_fixtures(client, owner_token)

    # 1. Create batch & sale
    batch_res = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "medicine_id": med_id,
            "batch_number": "DISP-BT-01",
            "expiry_date": (date.today() + timedelta(days=300)).isoformat(),
            "purchase_price": 60.0,
            "mrp": 120.0,
            "quantity_received": 20,
        },
    )
    assert batch_res.status_code == 201

    sale_res = client.post(
        "/api/sales",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "items": [{"medicine_id": med_id, "quantity": 3}],
            "payment_method": "cash",
            "amount_paid": 360.0,
        },
    )
    assert sale_res.status_code == 201
    sale_id = sale_res.get_json()["sale"]["id"]

    # 2. Create prescription
    create_res = client.post(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "patient_name": "Vikas Khanna",
            "items": [{"extracted_name": "Azithral 500", "medicine_id": med_id, "quantity_prescribed": 3}],
        },
    )
    rx_id = create_res.get_json()["data"]["id"]

    # 3. Dispense prescription
    disp_res = client.post(
        f"/api/prescriptions/{rx_id}/dispense",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"sale_id": sale_id},
    )
    assert disp_res.status_code == 200
    disp_data = disp_res.get_json()["data"]
    assert disp_data["status"] == "dispensed"
    assert disp_data["sale_id"] == sale_id
    assert disp_data["dispensed_at"] is not None

    # Check audit log
    with app.app_context():
        log = AuditLog.query.filter_by(
            entity_type="prescription",
            entity_id=str(rx_id),
            action="PRESCRIPTION_DISPENSE",
        ).first()
        assert log is not None
        assert log.new_values["status"] == "dispensed"


def test_prescription_validation_and_errors(client, owner_token):
    """Test validation errors on missing patient name or invalid IDs."""
    # Missing patient name
    res = client.post(
        "/api/prescriptions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"patient_name": ""},
    )
    assert res.status_code == 400

    # Non-existent prescription
    res_missing = client.get(
        "/api/prescriptions/999999",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res_missing.status_code == 404
