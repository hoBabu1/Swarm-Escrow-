# Manual Test Run — Kya Hua Abhi Tak

Ye simple notes hai ki humne kya test kiya, bina oracle service chalaye, seedha
deployed contract pe manual transactions bhej ke.

**Contract:** `0xc45d948467Dd39278a456D4341C00C14F31300b2` (BOT Chain testnet, chain id 968)

**Escrow ID jo humne test kiya:** `0`

## Wallets Used

| Role | Address | Kaam |
|---|---|---|
| Client | `0xD9D2dB6688Eaf09304155978B4b34998bFf6c37C` | Escrow banaya, deposit kiya (0.001 BOT) |
| Worker | `0x1d9e0A0E56e4F5BE0a85324D7120F51b70ABfdB6` | Deliverable submit kiya, aur akhir mein payout milega |
| Oracle | `0x51724B78D61c08A054697DF250924Df84D3Da539` | Verdicts (votes) diye — ye asli oracle wallet hai, encrypted keystore se signed |

Client aur worker sirf test ke liye naye banaye gaye disposable wallets hain
(testnet faucet se funded, real paise nahi hai).

## Flow — Step by Step

### Step 1: Client ne escrow create kiya
- Client ne `createEscrow()` call kiya, worker address diya, 0.001 BOT deposit kiya.
- **escrowId = 0** mila.
- Tx: `0x2dbc7c4d50e0721dd50ac37568aa19bd0ffd8c52eda2c2c7f2694b25d6c5b610`

### Step 2: Worker ne deliverable submit kiya
- Worker ne `submitDeliverable()` call kiya (dummy repo URL + commit hash).
- Status ab `1` = **DeliverableSubmitted**.

### Step 3: Oracle ne verdicts diye
- Oracle wallet (encrypted keystore se, password aapne khud daala) ne 2 votes diye:
  - Reviewer = **approved**
  - FraudSanity = **approved**
- Arbiter vote skip kiya kyunki pehle hi 2-of-3 consensus ban gaya (dono agree kar gaye).

### Step 4: Resolve call hua
- Kisi ne bhi (yahan client ne) `resolve()` call kiya.
- Ye sirf **tentative** result set karta hai, paisa turant nahi jaata.
- Result:
  - Status = `2` = **PendingChallenge**
  - tentativeApproved = **true** (matlab worker ko payout milega, agar koi challenge nahi karta)
  - challengeDeadline = `1783188460` (unix timestamp) — ye time tak koi bhi client/worker challenge kar sakta hai
- Tx: `0xdc7546b1e91b79b89747dc47dabf4916e8afe03cf1cdaea909e77e6521b8b051`

### Step 5: Finalize ho gaya — DONE ✅
- Challenge window khatam ho gaya tha, koi challenge nahi hua, isliye
  `finalizeAfterChallengeWindow()` call kiya.
- Result:
  - Worker balance +0.001 BOT (`1000000000000000` wei) — exact escrow amount jitna hi
  - Status = `4` = **Resolved**
- Tx: `0xcddb12b01625ed57fc25603aaa3793c191ff008352ca0fd398ae05ac17be5392`

**Poora happy path pass ho gaya, bina oracle service chalaye.**

## Iska Matlab Kya Hai

Ye poora "happy path" test hai — bina AI oracle service chalaye, sirf manual
transactions se — ye prove karne ke liye ki:
1. Escrow create ho sakta hai aur BOT deposit ho jaata hai.
2. Worker deliverable submit kar sakta hai.
3. Oracle verdicts record ho jaate hain on-chain.
4. 2-of-3 consensus milte hi tentative resolve hota hai, funds turant nahi
   jaate (challenge window ke liye ruk jaata hai).
5. Agar koi challenge nahi karta, to challenge window ke baad worker ko
   paisa mil jaata hai automatically.

Isse confirm ho jayega ki contract ka core flow sahi kaam kar raha hai,
real oracle automation (Day 2 wala kaam) banane se pehle.
