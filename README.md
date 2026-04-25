# RFQ British Auction System — v2

A full-stack Request for Quotation (RFQ) platform with **British Auction** bidding logic,
real-time updates via Socket.io, and configurable time-extension triggers.

---

## High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (React SPA)                              │
│                                                                            │
│   ┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │
│   │  AuctionList    │  │   AuctionDetail       │  │   CreateRFQ      │   │
│   │  ─────────────  │  │   ────────────────    │  │   ──────────     │   │
│   │  All RFQs       │  │   Bid Rankings        │  │   RFQ form       │   │
│   │  Live L1 bid    │  │   Quote Details       │  │   Trigger type   │   │
│   │  Countdown      │  │   Activity Log        │  │   X & Y config   │   │
│   │  Status badges  │  │   Submit Quote form   │  │                  │   │
│   └────────┬────────┘  └──────────┬───────────┘  └────────┬─────────┘   │
│            │                      │                         │              │
│   ┌────────▼──────────────────────▼─────────────────────────▼──────────┐  │
│   │              src/services/                                          │  │
│   │   api.js (Axios REST)          socket.js (Socket.io client)        │  │
│   └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────┬────────────────────┘
                           │ HTTP/REST                  │ WebSocket
                    ┌──────▼───────────────────────────▼──────┐
                    │         Node.js + Express Server          │
                    │                                           │
                    │  ┌─────────────────────────────────────┐ │
                    │  │           REST Routes                │ │
                    │  │  POST  /rfq/create                   │ │
                    │  │  GET   /rfq/list                     │ │
                    │  │  GET   /rfq/:id                      │ │
                    │  │  POST  /bid/place                    │ │
                    │  └──────────────┬──────────────────────┘ │
                    │                 │                          │
                    │  ┌──────────────▼──────────────────────┐ │
                    │  │         Business Logic               │ │
                    │  │                                      │ │
                    │  │  British Auction Engine:             │ │
                    │  │  1. Is bid within trigger window?    │ │
                    │  │  2. Check trigger type:              │ │
                    │  │     • BID_RECEIVED → always extend   │ │
                    │  │     • ANY_RANK_CHANGE → if rank ↕    │ │
                    │  │     • L1_RANK_CHANGE → if L1 changes │ │
                    │  │  3. Propose new close time           │ │
                    │  │  4. Cap at forcedCloseTime           │ │
                    │  │  5. Log event + emit socket          │ │
                    │  └──────────────┬──────────────────────┘ │
                    │                 │                          │
                    │  ┌──────────────▼──────────────────────┐ │
                    │  │        Socket.io Server              │ │
                    │  │  Rooms: rfq:<id>                     │ │
                    │  │  Events emitted:                     │ │
                    │  │    bid:placed  → room rfq:<id>       │ │
                    │  │    rfq:updated → all clients         │ │
                    │  │    rfq:created → all clients         │ │
                    │  └─────────────────────────────────────┘ │
                    └──────────────────┬────────────────────────┘
                                       │ Mongoose ODM
                    ┌──────────────────▼────────────────────────┐
                    │                MongoDB                      │
                    │                                             │
                    │  ┌─────────────────────────────────────┐  │
                    │  │  rfqs collection                     │  │
                    │  │  ─────────────────────────────────   │  │
                    │  │  name, referenceId                   │  │
                    │  │  startTime, pickupDate               │  │
                    │  │  bidCloseTime (mutable)              │  │
                    │  │  forcedCloseTime (immutable cap)     │  │
                    │  │  triggerWindow (X mins)              │  │
                    │  │  extensionDuration (Y mins)          │  │
                    │  │  extensionTrigger (enum)             │  │
                    │  │  status: ACTIVE|CLOSED|FORCE_CLOSED  │  │
                    │  │  lowestBid { price, supplier }       │  │
                    │  │  activityLogs[]                      │  │
                    │  └─────────────────────────────────────┘  │
                    │                                             │
                    │  ┌─────────────────────────────────────┐  │
                    │  │  bids collection                     │  │
                    │  │  ─────────────────────────────────   │  │
                    │  │  rfqId (ref), supplierId             │  │
                    │  │  supplierName, carrierName           │  │
                    │  │  freightCharges                      │  │
                    │  │  originCharges                       │  │
                    │  │  destinationCharges                  │  │
                    │  │  price (computed total)              │  │
                    │  │  transitTime (days)                  │  │
                    │  │  quoteValidity (date)                │  │
                    │  │  placedAt, triggeredExtension        │  │
                    │  │  extensionTriggerType                │  │
                    │  └─────────────────────────────────────┘  │
                    └─────────────────────────────────────────────┘
```

---

## British Auction Extension Logic

```
New bid arrives
       │
       ▼
  Is auction ACTIVE? ──No──► 400 Reject
       │
      Yes
       ▼
  msUntilClose ≤ triggerWindow?
       │
      No ──────────────────────────────────────────────┐
       │                                                │
      Yes                                              Save bid
       │                                               Log BID_PLACED
       ▼                                               Emit socket
  Check extensionTrigger:                              Return 201
  ┌──────────────────────────────────────────┐
  │ BID_RECEIVED  → shouldExtend = true      │
  │ ANY_RANK_CHANGE → newPrice < any existing│
  │ L1_RANK_CHANGE  → newPrice < current L1  │
  └──────────────────────────────────────────┘
       │
  shouldExtend?
      No ──────────────────────────────────────────────┐
       │                                                │
      Yes                                         (same as above)
       │
       ▼
  proposed = bidCloseTime + extensionDuration
       │
  proposed > forcedCloseTime?
      Yes → use forcedCloseTime
      No  → use proposed
       │
       ▼
  newClose > current bidCloseTime?
      No  → no actual change (already at max)
      Yes → update bidCloseTime
             Log TIME_EXTENDED with reason
             Emit socket events
             Save bid + rfq
             Return 201
```

---

## Folder Structure

```
rfq-system/
├── backend/
│   ├── controllers/
│   │   ├── rfq.controller.js       # RFQ CRUD
│   │   └── bid.controller.js       # Bid + British Auction logic
│   ├── models/
│   │   ├── rfq.model.js            # RFQ schema + activity logs
│   │   └── bid.model.js            # Bid/Quote schema
│   ├── routes/
│   │   ├── rfq.routes.js
│   │   └── bid.routes.js
│   ├── socket/
│   │   └── socket.handler.js       # Socket.io room management
│   ├── .env.example
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── hooks/useCountdown.js   # Live 1s countdown timer
│       ├── pages/
│       │   ├── AuctionList.js      # All RFQs with live updates
│       │   ├── AuctionDetail.js    # Rankings, quote form, activity log
│       │   └── CreateRFQ.js        # New RFQ with trigger config
│       ├── services/
│       │   ├── api.js              # Axios REST client
│       │   └── socket.js           # Socket.io singleton
│       ├── utils/helpers.js        # Formatters + status helpers
│       ├── App.js                  # Router + Toast context
│       ├── index.css               # Design system / global styles
│       └── index.js
│
└── README.md
```

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend
```bash
cd backend
cp .env.example .env      # set MONGODB_URI if needed
npm install
npm run dev               # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm start                 # http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Backend port |
| `MONGODB_URI` | `mongodb://localhost:27017/rfq_system` | MongoDB URI |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin |
| `REACT_APP_API_URL` | `http://localhost:5000` | API base URL |
| `REACT_APP_SOCKET_URL` | `http://localhost:5000` | Socket.io server |

---

## API Reference

### RFQ

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/rfq/create` | Create RFQ |
| `GET` | `/rfq/list` | List all RFQs |
| `GET` | `/rfq/:id` | Get RFQ + ranked bids + logs |

**POST /rfq/create**
```json
{
  "name": "Steel Pipes Q1 2025",
  "referenceId": "RFQ-2025-001",
  "startTime": "2025-01-01T09:00:00Z",
  "bidCloseTime": "2025-01-01T10:00:00Z",
  "forcedCloseTime": "2025-01-01T11:00:00Z",
  "pickupDate": "2025-01-10T09:00:00Z",
  "triggerWindow": 5,
  "extensionDuration": 10,
  "extensionTrigger": "L1_RANK_CHANGE"
}
```

### Bid/Quote

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/bid/place` | Submit a quote |

**POST /bid/place**
```json
{
  "rfqId": "<mongo_id>",
  "supplierId": "SUP-001",
  "supplierName": "Acme Logistics",
  "carrierName": "DHL Express",
  "freightCharges": 25000,
  "originCharges": 5000,
  "destinationCharges": 3000,
  "transitTime": 5,
  "quoteValidity": "2025-01-15"
}
```
*Total price is auto-computed: 25000 + 5000 + 3000 = ₹33,000*

---

## Socket.io Events

| Event | Direction | Payload |
|---|---|---|
| `rfq:join` | Client→Server | `rfqId` |
| `rfq:leave` | Client→Server | `rfqId` |
| `bid:placed` | Server→Room | `{ bid, rankedBids, rfq, timeExtended, extension? }` |
| `rfq:updated` | Server→All | `{ rfqId, bidCloseTime, lowestBid, status }` |
| `rfq:created` | Server→All | `{ rfq }` |

---

## Extension Trigger Types

| Value | Behaviour |
|---|---|
| `BID_RECEIVED` | Any bid placed within trigger window extends the auction |
| `ANY_RANK_CHANGE` | New bid displaces any existing bid's rank → extend |
| `L1_RANK_CHANGE` | New bid becomes the new lowest (L1) price → extend |

---

## MongoDB Schema

### rfqs
```js
{
  _id, name, referenceId,
  startTime, bidCloseTime, forcedCloseTime, pickupDate,
  triggerWindow, extensionDuration,
  extensionTrigger: "BID_RECEIVED" | "ANY_RANK_CHANGE" | "L1_RANK_CHANGE",
  status: "ACTIVE" | "CLOSED" | "FORCE_CLOSED",
  lowestBid: { price, supplierId, supplierName },
  activityLogs: [{ type, message, metadata, timestamp }],
  createdAt, updatedAt
}
```

### bids
```js
{
  _id, rfqId,
  supplierId, supplierName, carrierName,
  freightCharges, originCharges, destinationCharges,
  price,           // computed total
  transitTime,     // days
  quoteValidity,   // date
  placedAt,
  triggeredExtension,
  extensionTriggerType,
  rankAtSubmission,
  createdAt, updatedAt
}
```
