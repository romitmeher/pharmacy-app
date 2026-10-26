import json
import sys
from pathlib import Path
import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import create_app
from app.models.user import User
from app.services.auth_service import create_access_token

app = create_app()
with app.app_context():
    user = User.query.filter_by(email='admin@smartpharm.com', is_active=True).one()
    headers = {'Authorization': 'Bearer ' + create_access_token(user)}
    response = requests.get(sys.argv[1] + '/api/ml/reorder-recommendations', headers=headers, timeout=120)
    assert response.status_code == 200, response.status_code
    rows = response.json()['data']['recommendations']
    assert rows and all(0 < row['recommended_order_quantity'] < 500 for row in rows)
    print(json.dumps([{'medicine': row['brand_name'], 'quantity': row['recommended_order_quantity']} for row in rows]), flush=True)
