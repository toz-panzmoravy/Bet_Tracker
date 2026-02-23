import requests
import json

url = "http://127.0.0.1:8001/api/stats/timeseries"
try:
    resp = requests.get(url)
    print(f"Status: {resp.status_code}")
    print(f"Content: {resp.text}")
except Exception as e:
    print(f"Error: {e}")
