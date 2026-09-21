"""T11 anti-snipe E2E - REST helper: create short auction, fetch state, cleanup."""
import json, time, urllib.request, urllib.error, sys

PK = "sb_publishable_4fzOKBOaiSKFNlsTyyOmAQ_ydigNRNk"
SB = "https://ialusnghydghsykekgeb.supabase.co"
A_ID = "aa000000-0000-0000-0000-0000000000a1"

def http(method, url, token=None, data=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {"apikey": PK, "Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    if method == "POST" and data is not None:
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, (json.loads(raw) if raw else raw)

def jwt(email, pw):
    s, d = http("POST", f"{SB}/auth/v1/token?grant_type=password",
                data={"email": email, "password": pw})
    assert s == 200, f"auth failed {s} {d}"
    return d

def insec(n):
    return time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() + n))

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "create":
        ses = jwt("sellera@bztest.dev", "BzTest-A-2026!")
        minutes = float(sys.argv[2]) if len(sys.argv) > 2 else 5
        s, d = http("POST", f"{SB}/rest/v1/auctions", token=ses["access_token"], data={
            "seller_id": A_ID, "title": "T11 Anti-Snipe Probe", "description": "Phase 7.2 T11 anti-snipe live UI observation",
            "category": "Electronics", "condition": "NEW", "auction_type": "DIGITAL",
            "starting_bid": "0.01", "minimum_increment": "0.01",
            "start_time": insec(0), "end_time": insec(minutes * 60),
            "anti_sniping_seconds": 10, "status": "LIVE", "allowed_regions": ["GLOBAL"]})
        print(json.dumps({"status": s, "id": d[0]["id"] if isinstance(d, list) and s in (200, 201) else d}))
    elif cmd == "get":
        aid = sys.argv[2]
        s, d = http("GET", f"{SB}/rest/v1/auctions?id=eq.{aid}&select=id,status,end_time,starting_bid,minimum_increment,anti_sniping_seconds,contract_auction_id,contract_address,chain_id,creation_tx_hash,current_bid")
        print(json.dumps({"status": s, "row": d}))
    elif cmd == "bids":
        aid = sys.argv[2]
        s, d = http("GET", f"{SB}/rest/v1/bids?auction_id=eq.{aid}&select=amount,status,bidder_id,wallet_address,created_at&order=created_at.asc")
        print(json.dumps({"status": s, "bids": d}))
    elif cmd == "patch":
        aid, tok_email, tok_pw, newstatus = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
        ses = jwt(tok_email, tok_pw)
        s, d = http("PATCH", f"{SB}/rest/v1/auctions?id=eq.{aid}", token=ses["access_token"], data={"status": newstatus})
        print(json.dumps({"status": s}))
    elif cmd == "delete":
        aid, tok_email, tok_pw = sys.argv[2], sys.argv[3], sys.argv[4]
        ses = jwt(tok_email, tok_pw)
        s, d = http("DELETE", f"{SB}/rest/v1/auctions?id=eq.{aid}", token=ses["access_token"])
        print(json.dumps({"status": s}))
    elif cmd == "notifs_del":
        aid = sys.argv[2]
        ses = jwt("sellera@bztest.dev", "BzTest-A-2026!")
        s, d = http("DELETE", f"{SB}/rest/v1/notifications?auction_id=eq.{aid}", token=ses["access_token"])
        print(json.dumps({"notif_del_status": s}))
    elif cmd == "sessions":
        out = {}
        for tag, mail, pw in [("A", "sellera@bztest.dev", "BzTest-A-2026!"),
                              ("B", "sellerb@bztest.dev", "BzTest-B-2026!"),
                              ("C", "sellerc@bztest.dev", "BzTest-C-2026!")]:
            ses = jwt(mail, pw)
            out[tag] = ses
            out[tag]["_email"] = mail
        with open("/app/tests/bz_sessions_full.json", "w") as f:
            json.dump(out, f)
        print("full sessions saved to /app/tests/bz_sessions_full.json: A/B/C")
