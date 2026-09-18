"""BIDZONE Phase 6.4 — application-level bidding server rules matrix.

Uses 3 authenticated test users (A, B, C) and validates DB triggers, RLS,
lifecycle cron, notifications and escrow exactly as coded (no fabrication).
"""
import json, time, urllib.request, urllib.error, subprocess, sys

PK = "sb_publishable_4fzOKBOaiSKFNlsTyyOmAQ_ydigNRNk"
SB = "https://ialusnghydghsykekgeb.supabase.co"
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)[:200]))

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

def psql(q):
    out = subprocess.run(["bash", "-c", f'source /tmp/sb_conn.sh && psql "$SUPABASE_DB_CONN" -tA -c "{q}"'],
                         capture_output=True, text=True)
    return out.stdout.strip()

def jwt(email, pw):
    s, d = http("POST", f"{SB}/auth/v1/token?grant_type=password", data={"email": email, "password": pw})
    assert s == 200, f"auth failed {s} {d}"
    return d["access_token"]

JA = jwt("sellera@bztest.dev", "BzTest-A-2026!")
JB = jwt("sellerb@bztest.dev", "BzTest-B-2026!")
JC = jwt("sellerc@bztest.dev", "BzTest-C-2026!")
A_ID = "aa000000-0000-0000-0000-0000000000a1"
B_ID = "aa000000-0000-0000-0000-0000000000b2"
C_ID = "aa000000-0000-0000-0000-0000000000c3"

now = lambda: time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
insec = lambda n: time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() + n))

AUCTIONS = []

def make_auction(title, seller_id, token, minutes=10, status="LIVE", start_offset=0):
    s, d = http("POST", f"{SB}/rest/v1/auctions", token=token, data={
        "seller_id": seller_id, "title": title, "category": "Electronics", "condition": "NEW",
        "auction_type": "PHYSICAL", "starting_bid": "0.10", "minimum_increment": "0.05",
        "start_time": insec(start_offset) if start_offset else now(),
        "end_time": insec(minutes * 60), "anti_sniping_seconds": 10,
        "status": status, "allowed_regions": ["GLOBAL"]})
    assert s in (200, 201), f"auction create failed: {s} {d}"
    AUCTIONS.append(d[0]["id"])
    return d[0]["id"]

def bid(auction_id, bidder_id, token, amount):
    return http("POST", f"{SB}/rest/v1/bids", token=token, data={
        "auction_id": auction_id, "bidder_id": bidder_id, "amount": amount,
        "status": "ACTIVE", "wallet_address": None})

try:
    # ============ Auction 1: seller=A. Bidders: B, C ============
    aid = make_auction("P64 main", A_ID, JA, minutes=15)

    # T-S1: anon bid rejected
    s, d = bid(aid, B_ID, None, "0.15")
    check("S1 anonymous bid rejected", s in (401, 403), f"{s} {d}")

    # T-S2: SCHEDULED rejects bids
    sid = make_auction("P64 scheduled", A_ID, JA, minutes=60, status="SCHEDULED", start_offset=600)
    s, d = bid(sid, B_ID, JB, "0.15")
    check("S2 scheduled auction rejects bids", s == 400 and "AUCTION_NOT_LIVE" in str(d), f"{s} {d}")

    # T-S3a: first bid BELOW starting_bid rejected
    s, d = bid(aid, B_ID, JB, "0.09")
    check("S3a first bid below starting_bid rejected", s == 400 and "BID_BELOW_MINIMUM" in str(d), f"{s} {d}")

    # T-S4: seller self-bid rejected
    s, d = bid(aid, A_ID, JA, "0.15")
    check("S4 seller self-bid rejected", s == 400 and "SELLER_CANNOT_BID" in str(d), f"{s} {d}")

    # T-S7: protected field update rejected
    s, d = http("PATCH", f"{SB}/rest/v1/auctions?id=eq.{aid}", token=JA, data={"end_time": insec(9999)})
    check("S7 protected field update rejected", s == 400 and "AUCTION_FIELD_LOCKED" in str(d), f"{s} {d}")

    # T-S8a: first valid bid at starting_bid accepted (B bids 0.10)
    s, d = bid(aid, B_ID, JB, "0.10")
    check("S8a first valid bid (=starting_bid) accepted", s in (200, 201), f"{s} {d}")
    row = d[0] if isinstance(d, list) and d else (d if isinstance(d, dict) else {})
    bid_id_b = row.get("id")

    # T-S3b: second bid below current_bid + minimum_increment rejected (current 0.10, min next 0.15)
    s, d = bid(aid, C_ID, JC, "0.12")
    check("S3b next bid below current+increment rejected", s == 400 and "BID_BELOW_MINIMUM" in str(d), f"{s} {d}")

    # T-S6: cross-user bid modification blocked (C tries to modify B's bid)
    s, d = http("PATCH", f"{SB}/rest/v1/bids?id=eq.{bid_id_b}", token=JC, data={"amount": "99"})
    readback = psql(f"select amount from public.bids where id='{bid_id_b}'")
    check("S6 cross-user bid modification blocked", readback == "0.100000000000000000", f"readback={readback}")

    # T-S8: current_bid updated server-side + auction still LIVE
    cur = psql(f"select current_bid::text || '|' || status from public.auctions where id='{aid}'")
    check("S8 current_bid updated + LIVE", cur.startswith("0.100000000000000000") and cur.endswith("|LIVE"), cur)

    # T-S9: outbid + notification (C outbids B at 0.15)
    s, d = bid(aid, C_ID, JC, "0.15")
    check("S9a outbid accepted", s in (200, 201), f"{s} {d}")
    b_status = psql(f"select status from public.bids where id='{bid_id_b}'")
    notif = psql(f"select count(*) from public.notifications where user_id='{B_ID}' and auction_id='{aid}' and type='OUTBID'")
    check("S9b previous bid marked OUTBID + OUTBID notification for B", b_status == "OUTBID" and notif == "1",
          f"bid={b_status} notif={notif}")

    # T-S15: rapid sequential bids consistent (B then C)
    bid(aid, B_ID, JB, "0.20")
    bid(aid, C_ID, JC, "0.25")
    cur2 = psql(f"select current_bid::text || '|bids=' || (select count(*) from public.bids where auction_id='{aid}') from public.auctions where id='{aid}'")
    check("S15 rapid sequential bids consistent (current=0.25, bids=4)",
          cur2.startswith("0.250000000000000000") and "bids=4" in cur2, cur2)

    # T-S10: decimal math (string-safe, no floats)
    out = subprocess.run(["node", "-e", """
        const norm = (v, scale=18) => { const [i, f=''] = String(v ?? '0').split('.'); const frac=(f+'0'.repeat(scale)).slice(0,scale); return BigInt((i.startsWith('-')?i:i.replace(/^0+(?=\\d)/,''))+frac); };
        const add = (a,b) => { const s=(norm(a)+norm(b)).toString().padStart(19,'0'); const i=s.slice(0,s.length-18); const f=s.slice(s.length-18).replace(/0+$/,''); return f?`${i}.${f}`:i; };
        const cmp = (a,b) => { const x=norm(a),y=norm(b); return x<y?-1:x>y?1:0; };
        console.log(JSON.stringify([add('1.25','0.05'), cmp('1.3','1.3'), cmp('1.25','1.3'), cmp('0.1'.padEnd(3,'0'),'0.10')]));
    """], capture_output=True, text=True)
    check("S10 decimal math: 1.25+0.05=1.3, comparisons correct",
          out.stdout.strip() == '["1.3",0,-1,0]', out.stdout.strip() + out.stderr[:80])

    # ============ Auction 2: ANTI-SNIPING (T11-T13) ============
    # end_time = now + 8s; late bid at ~T-4s → each bid resets to exactly 10s remaining
    s, d = http("POST", f"{SB}/rest/v1/auctions", token=JB, data={
        "seller_id": B_ID, "title": "P64 anti-snipe", "category": "Gaming", "condition": "NEW",
        "auction_type": "PHYSICAL", "starting_bid": "0.10", "minimum_increment": "0.05",
        "start_time": now(), "end_time": insec(8), "anti_sniping_seconds": 10,
        "status": "LIVE", "allowed_regions": ["GLOBAL"]})
    assert s in (200, 201), d
    SN = d[0]["id"]; AUCTIONS.append(SN)

    time.sleep(4.5)  # ~3.5s remaining
    s, d = bid(SN, A_ID, JA, "0.10")
    check("S11a late bid accepted", s in (200, 201), f"{s} {d}")
    t_bid = time.time()
    et = psql(f"select extract(epoch from end_time) from public.auctions where id='{SN}'")
    remaining = float(et) - t_bid
    check("S11b anti-sniping: reset to ~10s remaining", 8.0 <= remaining <= 10.6, f"remaining={remaining:.2f}s")

    time.sleep(1.6)
    s, d = bid(SN, A_ID, JA, "0.15")
    check("S12a second late bid accepted", s in (200, 201), f"{s} {d}")
    t_bid2 = time.time()
    et2 = float(psql(f"select extract(epoch from end_time) from public.auctions where id='{SN}'"))
    rem2 = et2 - t_bid2
    check("S12b each late bid resets to ~10s (no stacking)", 8.0 <= rem2 <= 10.6, f"remaining={rem2:.2f}s")

    # Wait for expiry + cron (pg_cron runs every minute; poll up to 75s)
    end_deadline = time.time() + 80
    st, win = "", ""
    while time.time() < end_deadline:
        st = psql(f"select status from public.auctions where id='{SN}'")
        if st == "ENDED":
            break
        time.sleep(3)
    win = psql(f"select coalesce(string_agg(bidder_id::text, ',') filter (where status='WINNING'),'none') from public.bids where auction_id='{SN}'")
    check("S13 cron closed sniper auction + winner = A", st == "ENDED" and win.startswith(A_ID),
          f"status={st} winner={win[:12]}")

    # T-S5: ENDED auction rejects bids (returns AUCTION_NOT_LIVE (status=ENDED))
    s, d = bid(SN, C_ID, JC, "1.00")
    check("S5 ENDED auction rejects bids",
          s == 400 and ("AUCTION_ENDED" in str(d) or "AUCTION_NOT_LIVE" in str(d) and "ENDED" in str(d)), f"{s} {d}")

    # T-S19: escrow record honest (PENDING, no transaction_hash)
    esc = psql(f"select status || '|txh=' || coalesce(transaction_hash,'NULL') || '|amt=' || amount::text from public.escrow_transactions where auction_id='{SN}'")
    check("S19 escrow PENDING + transaction_hash NULL", esc.startswith("PENDING|txh=NULL|amt=0.150000"), esc)
    won_notif = psql(f"select count(*) from public.notifications where user_id='{A_ID}' and type='AUCTION_WON' and auction_id='{SN}'")
    check("S13b AUCTION_WON notification for winner", won_notif == "1", f"won_notif={won_notif}")

    # ============ Auction 3: NO SALE ============
    s, d = http("POST", f"{SB}/rest/v1/auctions", token=JA, data={
        "seller_id": A_ID, "title": "P64 nosale", "category": "Others", "condition": "NEW",
        "auction_type": "PHYSICAL", "starting_bid": "0.10", "minimum_increment": "0.05",
        "start_time": now(), "end_time": insec(4), "anti_sniping_seconds": 10,
        "status": "LIVE", "allowed_regions": ["GLOBAL"]})
    nosale = d[0]["id"]; AUCTIONS.append(nosale)

    end_deadline = time.time() + 80
    st2 = ""
    while time.time() < end_deadline:
        st2 = psql(f"select status from public.auctions where id='{nosale}'")
        if st2 == "ENDED":
            break
        time.sleep(3)
    esc2 = psql(f"select count(*) from public.escrow_transactions where auction_id='{nosale}'")
    win2 = psql(f"select count(*) from public.bids where auction_id='{nosale}' and status='WINNING'")
    check("S14 no-sale auction: ENDED, no winner, no escrow",
          st2 == "ENDED" and esc2 == "0" and win2 == "0", f"st={st2} esc={esc2} win={win2}")

    # T-S21: cross-user profile modification blocked (C tries to update A)
    s, d = http("PATCH", f"{SB}/rest/v1/profiles?id=eq.{A_ID}", token=JC, data={"display_name": "hacked"})
    pn = psql(f"select coalesce(display_name,'NULL') from public.profiles where id='{A_ID}'")
    check("S21 cross-user profile modification blocked", pn != "hacked", f"pn={pn}")

finally:
    # cleanup
    if AUCTIONS:
        q_ids = ",".join(f"'{a}'" for a in AUCTIONS)
        psql(f"delete from public.notifications where auction_id in ({q_ids});")
        psql(f"delete from public.escrow_transactions where auction_id in ({q_ids});")
        psql(f"delete from public.bids where auction_id in ({q_ids});")
        psql(f"update public.auctions set status='DRAFT' where id in ({q_ids});")
        psql(f"delete from public.auctions where id in ({q_ids});")
    resid = psql("select 'auctions=' || (select count(*) from public.auctions) || ' bids=' || (select count(*) from public.bids) || ' escrow=' || (select count(*) from public.escrow_transactions) || ' notifs=' || (select count(*) from public.notifications) || ' items=' || (select count(*) from public.auction_items)")

passed = sum(1 for _, ok, _ in results if ok)
for n, ok, det in results:
    print(("PASS" if ok else "FAIL"), n, ("| " + det if det and not ok else ""))
print(f"SUMMARY: {passed}/{len(results)} PASS")
print("RESIDUE:", resid)
sys.exit(0 if passed == len(results) else 1)
