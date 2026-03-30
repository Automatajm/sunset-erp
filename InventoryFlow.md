# Sunset ERP — Inventory Flow

> **Version:** Sprint 13  
> **Status:** Design / Reference  
> **Last updated:** 2026-03-30

---

## Overview

Inventory in Sunset ERP is managed through a single source of truth: the `StockMovement` table. Every quantity change — regardless of origin — generates at least one movement record with a type, a reference document, and an optional lot number. Stock balances are always derived from movements, never stored independently without reconciliation.

---

## 1. Inbound (Receiving)

### 1.1 Receipt from Purchase Order (GRN)
- **Trigger:** A confirmed PO (`status: confirmed | partially_received`)
- **Document generated:** GoodsReceipt (GRN-YYYY-NNNN)
- **Movement type:** `receipt`
- **Flow:**
  ```
  PO confirmed
    → Open "Receive Goods" on PO
    → Select lines + quantities + warehouse
    → Set receipt condition (complete / partial / damaged / wrong item / late / presentation issue / overshipment)
    → Confirm
    → GRN created with lines
    → StockMovement(s) created (one per line)
    → PO line receivedQuantity updated
    → PO status → partially_received | received
    → Stock balance incremented
  ```
- **Partial receipts:** Multiple GRNs can exist for one PO. PO closes when all lines reach 100%.
- **AP Invoice link:** AP Invoice references the GRN, not the PO directly, for 3-way match (PO ↔ GRN ↔ AP Invoice).

### 1.2 Manual Receipt (without PO)
- **Use cases:** Opening inventory, minor purchases, customer returns, donations
- **Document generated:** StockMovement directly (no GRN header)
- **Movement type:** `receipt`
- **Flow:** Manual entry form → item + warehouse + qty + unit cost + notes → confirm

### 1.3 Inbound Transfer
- **Trigger:** A Transfer Order where the current warehouse is the destination
- **Document generated:** Transfer Order (TO-YYYY-NNNN)
- **Movement type:** `transfer_in`
- **Counterpart:** Always paired with a `transfer_out` movement at the source warehouse
- **Flow:**
  ```
  Transfer Order created (from_warehouse → to_warehouse)
    → Status: draft → in_transit → received
    → transfer_out movement at source (reduces stock)
    → transfer_in movement at destination (increases stock)
  ```

### 1.4 Supplier Return
- **Use cases:** Damaged goods, wrong item received, quality rejection, excess return
- **Document generated:** Supplier Return (SR-YYYY-NNNN)
- **Movement type:** `supplier_return`
- **Flow:**
  ```
  Supplier Return created
    → References GRN or PO (optional)
    → Item + qty + reason + warehouse
    → Confirm
    → StockMovement created (supplier_return, negative)
    → Stock balance decremented
    → Optional: Supplier credit note expected → links to AP adjustment
  ```
- **Cost reversal:** If GRN reference exists, cost reverts at original GRN unit cost
- **AP impact:** Can trigger a supplier credit note (debit memo) in AP module

### 1.5 Donation / Non-PO Receipt
- **Use cases:** Donated goods, samples received, opening inventory with zero cost
- **Document generated:** GRN manual (no PO)
- **Movement type:** `receipt`
- **Unit cost:** 0.00 or estimated fair value for accounting purposes
- **Accounting entry:** Db Inventory / Cr Other Income (account configurable in tenant settings)
- **Notes field:** Required — must document the source (e.g. "Donated by Supplier X")

### 1.6 Customer Return
- **Use cases:** Product returned by customer (defective, wrong shipment, excess)
- **Document generated:** GRN manual or linked to AR Invoice
- **Movement type:** `customer_return`
- **Flow:**
  ```
  Customer Return created
    → References AR Invoice (optional)
    → Item + qty + condition + warehouse
    → Confirm
    → StockMovement created (customer_return, positive)
    → Stock balance incremented
    → Optional: Credit note issued to customer → impacts AR
  ```
- **Condition check:** Returned item may go to a quarantine location pending inspection before returning to sellable stock

### 1.7 Return from Manufacturing Order
- **Trigger:** Material issued to a MO was not consumed and is returned to stock
- **Movement type:** `mo_return`
- **References:** MO number
- **Effect:** Stock balance incremented, MO material actual reduced

### 1.8 Positive Adjustment
- **Use cases:** Cycle count surplus, data correction
- **Movement type:** `adjustment_in`
- **Requires:** Reason code + supervisor notes
- **Effect:** Stock incremented, variance posted to P&L (Inventory Adjustment account)

---

## 2. Storage & Control

### 2.1 Warehouse Locations (Bins)
- **Status:** To be implemented — schema migration required
- **Proposed model:** `WarehouseLocation` (id, warehouseId, code, description, zone, isActive)
- **Impact:** StockMovement and Stock will need an optional `locationId`
- **Deferral rationale:** Implement after core inbound/outbound flows are stable

### 2.2 Lot & Expiry Tracking
- `lotNumber` already exists on StockMovement and Stock
- FEFO (First Expired First Out) support planned for food/chemical items
- `expiryDate` field to be added to StockMovement when lot tracking is enabled per item

### 2.3 Cycle Count
- **Scope:** User selects a subset of items or a warehouse zone
- **Flow:**
  ```
  Cycle Count created (CC-YYYY-NNNN)
    → Lines auto-populated from current Stock balance
    → Print count sheet or use mobile interface
    → User enters physical count per line
    → System calculates variance (physical - system)
    → User reviews variances
    → Post → generates adjustment_in or adjustment_out movements
    → Stock balance updated
  ```
- **Document:** Printable count sheet with item code, description, UOM, system qty (hidden during count), physical qty field

### 2.4 Physical Inventory (Full Count)
- **Scope:** All items in one or more warehouses
- **Difference from cycle count:** Warehouse is frozen (no movements allowed) during count
- **Flow:** Same as cycle count but with warehouse lock flag
- **Frequency:** Typically annual or semi-annual

### 2.5 Reorder Point & Replenishment Suggestion
- Each item has `reorderPoint` and `reorderQty` (to be added to Item model)
- When `onHandQuantity` falls below `reorderPoint`, system flags the item
- Dashboard widget: "Items below reorder point" with one-click PO suggestion
- Full MRP (Material Requirements Planning) is a future phase

### 2.6 Valuation
- **Methods supported:** Average Cost (weighted), FIFO (schema ready)
- **Price variance:** When AP Invoice unit cost differs from GRN unit cost → journal entry posted to Price Variance account
- **Inventory adjustment:** When quantity is adjusted → journal entry posted to Inventory Adjustment account

---

## 3. Outbound (Dispatching)

### 3.1 Issue to Manufacturing Order (MO)
- **Trigger:** MO in status `released` or `in_progress`
- **Document generated:** Material Issue (MI-YYYY-NNNN) — linked to MO
- **Movement type:** `mo_issue`
- **Flow:**
  ```
  MO released
    → BOM explodes required materials
    → Warehouse picks materials
    → Material Issue confirmed
    → StockMovement(s) created per component
    → Stock balance decremented
    → MO material actual updated
  ```
- **Backflush option:** Auto-issue materials when MO is completed (no manual pick)

### 3.2 Issue for Maintenance
- **Use cases:** Spare parts, lubricants, consumables for equipment maintenance
- **Movement type:** `maintenance_issue`
- **No MO required** — references a maintenance work order or equipment ID (free text for now)
- **Treated as:** Overhead expense, not production cost

### 3.3 Warehouse Requisition
- **Use cases:** Any department requesting material not tied to a MO
- **Flow:**
  ```
  Requisition created (REQ-YYYY-NNNN) by requester
    → Status: draft → submitted → approved → dispatched
    → Warehouse approves and picks
    → Dispatch confirmed → StockMovement created
    → Stock balance decremented
  ```
- **Approval:** Single-level for now (warehouse supervisor)

### 3.4 Outbound Transfer
- **Counterpart to 1.3** — Transfer Order, movement type `transfer_out`
- Source warehouse initiates; destination confirms receipt

### 3.5 Negative Adjustment
- **Use cases:** Cycle count shortage, damage, expiry write-off, shrinkage
- **Movement type:** `adjustment_out`
- **Requires:** Reason code + supervisor notes
- **Effect:** Stock decremented, variance posted to P&L

### 3.6 Shipment to Customer
- **Trigger:** AR Invoice posted or Sales Order shipped
- **Movement type:** `shipment`
- **References:** AR Invoice number or SO number
- **Flow:** Already partially implemented via `shipFromArInvoice` in stock-transactions service

---

## Document Registry

| Document | Code Format | Inbound/Outbound | References |
|---|---|---|---|
| Goods Receipt Note | GRN-YYYY-NNNN | Inbound | PO (optional) |
| Supplier Return | SR-YYYY-NNNN | Outbound | GRN / PO (optional) |
| Customer Return | CR-YYYY-NNNN | Inbound | AR Invoice (optional) |
| Transfer Order | TO-YYYY-NNNN | Both | — |
| Material Issue | MI-YYYY-NNNN | Outbound | MO |
| Warehouse Requisition | REQ-YYYY-NNNN | Outbound | — |
| Cycle Count | CC-YYYY-NNNN | Adjustment | — |
| Physical Inventory | PI-YYYY-NNNN | Adjustment | — |
| Shipment Note | SN-YYYY-NNNN | Outbound | AR Invoice / SO |

---

## Movement Types (StockMovement.movementType)

| Type | Direction | Description |
|---|---|---|
| `receipt` | + | PO receipt or manual inbound |
| `transfer_in` | + | Received from another warehouse |
| `transfer_out` | − | Sent to another warehouse |
| `mo_issue` | − | Issued to Manufacturing Order |
| `mo_return` | + | Returned from Manufacturing Order |
| `maintenance_issue` | − | Issued for maintenance |
| `requisition_issue` | − | Issued via warehouse requisition |
| `shipment` | − | Shipped to customer |
| `supplier_return` | − | Returned goods to supplier |
| `customer_return` | + | Goods returned by customer |
| `adjustment_in` | + | Positive count adjustment |
| `adjustment_out` | − | Negative count adjustment / write-off |

---

## Implementation Roadmap

| Sprint | Scope |
|---|---|
| Sprint 13 (current) | GRN from PO, manual receipt, PO → GRN → StockMovement chain |
| Sprint 14 | Transfer Orders (warehouse to warehouse), Warehouse Locations (bins) |
| Sprint 15 | Material Issue to MO, MO Return, Warehouse Requisition |
| Sprint 16 | Cycle Count, Physical Inventory, Reorder Point dashboard |
| Sprint 17 | Printable documents (GRN, Transfer Order, Material Issue, Requisition) |
| Future | FEFO lot tracking, MRP suggestions, backflush, maintenance module |

---

## Open Decisions

- [ ] Warehouse Locations (bins): flat zone code or full rack/aisle/level hierarchy?
- [ ] Lot tracking: mandatory per item category or optional per item?
- [ ] Transfer Orders: does in-transit stock appear on balance reports?
- [ ] Requisition approval: single-level sufficient or multi-level needed?
- [ ] Backflush on MO completion: opt-in per BOM or system-wide setting?