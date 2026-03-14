# FUNCTIONAL REQUIREMENTS - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 2026  
**Author:** Juan Mendoza  
**Status:** Draft

---

## TABLE OF CONTENTS

1. [Overview](#overview)
2. [Module 1: Procurement Management](#module-1-procurement-management)
3. [Module 2: Inventory Management](#module-2-inventory-management)
4. [Module 3: Manufacturing & Production](#module-3-manufacturing--production)
5. [Module 4: Sales Management](#module-4-sales-management)
6. [Module 5: Distribution & Logistics](#module-5-distribution--logistics)
7. [Module 6: Asset & Maintenance Management](#module-6-asset--maintenance-management)
8. [Module 7: Financial Management](#module-7-financial-management)
9. [Module 8: Reporting & Analytics](#module-8-reporting--analytics)
10. [Cross-Cutting Requirements](#cross-cutting-requirements)

---

## 1. OVERVIEW

This document defines detailed functional requirements for all modules in Sunset ERP Version 1.0. Each requirement is tagged with priority (Must Have, Should Have, Could Have) and module phase.

**Requirement Format:**
- **REQ-[MODULE]-[NUMBER]**: Unique identifier
- **Priority**: Must Have (P0), Should Have (P1), Could Have (P2)
- **Phase**: MVP (9 months), V1.0 (12 months), V2.0 (15 months)

---

## 2. MODULE 1: PROCUREMENT MANAGEMENT

### 2.1 Supplier Management

**REQ-PROC-001: Supplier Master Data**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: System shall maintain supplier master records
- Details:
  - Supplier code (auto-generated or manual)
  - Supplier name (legal and trade name)
  - Tax ID (RNC for Dominican Republic)
  - Contact information (phone, email, website)
  - Multiple addresses (billing, shipping)
  - Payment terms (net 30, net 60, etc.)
  - Currency preference
  - Credit limit
  - Supplier category/classification
  - Bank account details
  - Active/inactive status
  - Notes and attachments
- Business Rules:
  - Supplier code must be unique
  - Tax ID validation for local suppliers
  - Cannot delete supplier with transactions
  - Soft delete only (maintain history)

**REQ-PROC-002: Supplier Contact Management**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Track multiple contacts per supplier
- Details:
  - Contact name, title, department
  - Email, phone, mobile
  - Primary contact flag
  - Contact-specific notes

**REQ-PROC-003: Supplier Performance Tracking**
- Priority: P2 (Could Have)
- Phase: V1.0
- Description: Track supplier KPIs
- Details:
  - On-time delivery rate
  - Quality defect rate
  - Price competitiveness
  - Supplier scorecard

### 2.2 Purchase Requisitions

**REQ-PROC-010: Create Purchase Requisition**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Users can create internal purchase requests
- Details:
  - Requisition number (auto-generated)
  - Requested by (user)
  - Department/cost center
  - Required date
  - Multiple line items
  - Item/service description
  - Quantity required
  - Estimated unit price
  - Suggested supplier
  - Justification/notes
  - Attachments (quotes, specs)
- Business Rules:
  - Must have at least one line item
  - Required date must be future
  - Cannot modify after submission

**REQ-PROC-011: Approval Workflow**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Multi-level approval based on amount
- Details:
  - Approval levels configurable by amount threshold
  - Email notifications to approvers
  - Approve/reject with comments
  - Approval history audit trail
- Business Rules:
  - Thresholds: <$1K (supervisor), $1K-$10K (manager), >$10K (director)
  - Sequential approval (cannot skip levels)
  - Rejected requisitions return to requester

**REQ-PROC-012: Convert to Purchase Order**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Create PO from approved requisition
- Details:
  - Select approved requisition(s)
  - Combine multiple requisitions for same supplier
  - Split requisition across multiple suppliers
  - Modify quantities/prices before creating PO

### 2.3 Request for Quotation (RFQ)

**REQ-PROC-020: Create RFQ**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Send RFQ to multiple suppliers
- Details:
  - RFQ number
  - Items/services required
  - Specifications
  - Quantity
  - Delivery requirements
  - Quote deadline
  - Send to multiple suppliers
  - Email template

**REQ-PROC-021: Record Supplier Quotes**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Enter quotes from suppliers
- Details:
  - Quote reference number
  - Supplier
  - Item-by-item pricing
  - Delivery terms
  - Payment terms
  - Validity period
  - Attachments

**REQ-PROC-022: Quote Comparison**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Compare quotes side-by-side
- Details:
  - Tabular comparison view
  - Highlight lowest price per item
  - Total cost comparison
  - Select winner per item
  - Create PO from selected quotes

### 2.4 Purchase Orders

**REQ-PROC-030: Create Purchase Order**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Create purchase orders
- Details:
  - PO number (auto-generated with prefix)
  - Supplier selection
  - PO date
  - Expected delivery date
  - Delivery address (from warehouses)
  - Payment terms
  - Currency
  - Multiple line items:
    - Item/service
    - Description
    - Quantity
    - Unit of measure
    - Unit price
    - Discount
    - Tax code
    - Line total
  - Subtotal, tax, total
  - Terms and conditions
  - Notes
  - Attachments
- Business Rules:
  - Supplier must be active
  - Must have at least one line item
  - All items must be purchasable
  - Quantities must be positive
  - Expected date must be future

**REQ-PROC-031: PO Approval Workflow**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Approval required for POs above threshold
- Details:
  - Same approval levels as requisitions
  - Draft → Pending Approval → Approved → Sent
  - Email to approvers
  - Approval history
- Business Rules:
  - POs <$1K: Auto-approved
  - POs $1K-$10K: Manager approval
  - POs >$10K: Director approval

**REQ-PROC-032: Send PO to Supplier**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Email PO to supplier
- Details:
  - PDF generation
  - Email template with PO attached
  - Track sent date/time
  - Resend capability
  - Mark as sent manually (if sent outside system)

**REQ-PROC-033: PO Amendments**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Modify PO after approval
- Details:
  - Create amendment (PO revision)
  - Track original vs amended
  - Re-approval if amount increases significantly
  - Email supplier with changes
- Business Rules:
  - Cannot amend if fully received
  - Amendment requires re-approval if total increases >10%

**REQ-PROC-034: PO Cancellation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Cancel PO
- Details:
  - Cancel entire PO or individual lines
  - Cancellation reason required
  - Cannot cancel if partially/fully received
  - Release reserved stock if applicable
  - Email supplier notification

### 2.5 Goods Receipt

**REQ-PROC-040: Create Goods Receipt Note (GRN)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record receipt of goods
- Details:
  - GRN number (auto-generated)
  - Reference PO
  - Supplier delivery note number
  - Receipt date
  - Receiving warehouse
  - Line items from PO:
    - Item
    - Ordered quantity
    - Received quantity
    - Rejected quantity
    - Acceptance status
  - Quality inspection result
  - Received by (user)
  - Notes
- Business Rules:
  - Must reference a PO
  - Received quantity cannot exceed outstanding PO quantity
  - Automatically updates stock on posting
  - Creates quality inspection if required

**REQ-PROC-041: Partial Receipts**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Receive PO in multiple shipments
- Details:
  - Multiple GRNs per PO
  - Track outstanding quantity
  - PO status: Open, Partially Received, Fully Received

**REQ-PROC-042: Over/Under Receipt**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Handle receipt variances
- Details:
  - Allow over-receipt up to configurable % (e.g., 5%)
  - Warning for under-receipt
  - Reason code for variances
- Business Rules:
  - Over-receipt >5% requires approval
  - Under-receipt closes PO line or leaves open

**REQ-PROC-043: Quality Inspection on Receipt**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Quality check during receipt
- Details:
  - Inspection required flag per item
  - Inspection checklist
  - Pass/fail/conditional acceptance
  - Rejected quantity
  - Non-conformance report (NCR)
- Business Rules:
  - Stock goes to "inspection" status until passed
  - Failed items create return process

### 2.6 Purchase Invoices

**REQ-PROC-050: Record Supplier Invoice**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Enter supplier invoices
- Details:
  - Invoice number (supplier's)
  - Invoice date
  - Supplier
  - Reference PO and GRN
  - Currency
  - Line items (from GRN or manual)
  - Subtotal, tax, total
  - Due date (from payment terms)
  - Attachments (scanned invoice)
- Business Rules:
  - Can be created from GRN (auto-populate)
  - Can be manual (for services, no GRN)
  - Duplicate invoice check (supplier + invoice number)

**REQ-PROC-051: Three-Way Matching**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Match PO, GRN, and invoice
- Details:
  - Automatic matching when invoice created from GRN
  - Manual matching for discrepancies
  - Tolerance levels:
    - Quantity: ±2%
    - Price: ±5%
    - Amount: ±1%
  - Matching status: Matched, Variance, Not Matched
  - Approval required for variances
- Business Rules:
  - Cannot pay invoice until matched (or variance approved)
  - Variance report for review

**REQ-PROC-052: Landed Cost Calculation**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Allocate freight, duties, insurance to items
- Details:
  - Add non-item charges to invoice (freight, customs, insurance)
  - Allocation method: by quantity, weight, value
  - Update item cost with landed cost
  - Adjust inventory valuation

### 2.7 Purchase Returns

**REQ-PROC-060: Create Purchase Return**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Return goods to supplier
- Details:
  - Return number
  - Reference GRN
  - Supplier
  - Return reason code
  - Items to return with quantities
  - Return method: credit note, replacement, refund
  - Return shipping details
- Business Rules:
  - Reduces stock on posting
  - Creates debit note (reverse of invoice)
  - Cannot return more than received

### 2.8 Supplier Payments

**REQ-PROC-070: Payment Processing**
- Priority: P0 (Must Have)
- Phase: MVP (part of Finance module)
- Description: Pay supplier invoices
- Details:
  - Select invoices to pay
  - Payment method (check, transfer, cash)
  - Payment date
  - Payment reference
  - Partial payment support
  - Multi-currency payment
- Business Rules:
  - Cannot overpay invoice
  - Payment clears invoice (or partial)
  - Updates supplier aging

**REQ-PROC-071: Payment Proposals**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Auto-suggest invoices to pay
- Details:
  - Filter by due date, discount date, supplier
  - Respect cash position
  - Early payment discount calculation
  - Batch payment creation

---

## 3. MODULE 2: INVENTORY MANAGEMENT

### 3.1 Item Master Data

**REQ-INV-001: Create/Maintain Items**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Comprehensive item master records
- Details:
  - Item code (auto or manual, unique)
  - Item name
  - Item type: Raw Material, WIP, Finished Good, Supply, Service
  - Category and subcategory
  - Base unit of measure
  - Alternative UOMs with conversion factors
  - Item description (short and long)
  - Specifications
  - Flags:
    - Stockable (inventory tracked)
    - Purchasable
    - Saleable
    - Manufacturable
    - Lot tracked
    - Serial tracked
    - Expiry tracked
  - Valuation method: FIFO, LIFO, Average, Standard
  - Default supplier
  - Default customer
  - Lead time (purchase, manufacturing)
  - Safety stock level
  - Reorder point
  - Reorder quantity
  - ABC classification
  - Item images
  - Attachments (specs, drawings, certifications)
  - Custom fields (configurable)
  - Active/inactive status
- Business Rules:
  - Item code must be unique per tenant
  - Cannot delete item with transactions
  - Cannot change valuation method if transactions exist
  - Soft delete only

**REQ-INV-002: Multiple Units of Measure**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Support multiple UOMs per item
- Details:
  - Base UOM (inventory UOM)
  - Purchase UOM (may differ from base)
  - Sales UOM (may differ from base)
  - Conversion factors
  - Examples:
    - Base: EA (each), Purchase: BOX (1 box = 12 EA), Sales: EA
    - Base: KG, Purchase: LB (1 LB = 0.453592 KG), Sales: KG
- Business Rules:
  - All inventory tracked in base UOM
  - Auto-convert on transactions
  - Must define conversion factor

**REQ-INV-003: Item Categories**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Hierarchical categorization
- Details:
  - Multi-level categories (category → subcategory → sub-subcategory)
  - Category code and name
  - Default GL accounts per category
  - Category-level defaults (lead time, reorder policy)
- Business Rules:
  - Cannot delete category with items
  - Items inherit category defaults (overridable)

**REQ-INV-004: Bill of Materials (BOM)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define item composition
- Details:
  - Multi-level BOM support
  - Parent item (manufactured item)
  - Component items (materials, sub-assemblies)
  - Quantity per parent
  - Component UOM
  - Scrap percentage
  - Operation linkage (where component used)
  - Effective dates (from/to)
  - BOM version control
  - Where-used report (reverse BOM)
- Business Rules:
  - Cannot create circular BOMs (A contains B, B contains A)
  - BOM must have at least one component
  - Phantom BOMs supported (sub-assembly not stocked)
- Note: Detailed BOM features in Manufacturing module

### 3.2 Warehouse Management

**REQ-INV-010: Warehouse Master Data**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define warehouses and locations
- Details:
  - Warehouse code and name
  - Warehouse type: Regular, Transit, Quarantine, Scrap
  - Address
  - Responsible person
  - Active/inactive status
  - Default GL accounts
- Business Rules:
  - Must have at least one warehouse
  - Cannot delete warehouse with stock
  - Multi-warehouse support (stock tracked per warehouse)

**REQ-INV-011: Location/Bin Management**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track stock by location within warehouse
- Details:
  - Location code (e.g., A01-01-01: Aisle-Rack-Shelf)
  - Location type: Storage, Receiving, Shipping, Production, Inspection
  - Capacity (volume, weight)
  - Current utilization
- Business Rules:
  - Locations optional (can track at warehouse level only)
  - Directed putaway and picking (future)

**REQ-INV-012: Warehouse Zones**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Group locations into zones
- Details:
  - Zone for receiving, storage, picking, shipping
  - Zone-specific rules and workflows

### 3.3 Stock Control

**REQ-INV-020: Stock Balance Tracking**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Real-time stock visibility
- Details:
  - On-hand quantity (physical stock)
  - Available quantity (on-hand - reserved)
  - Reserved quantity (for sales orders, production)
  - On-order quantity (from purchase orders)
  - In-transit quantity (between warehouses)
  - Track by: item, warehouse, location (if used), lot, serial
- Business Rules:
  - Real-time updates on all transactions
  - Negative stock prevention (configurable)
  - Reservation system (allocate to orders)

**REQ-INV-021: Stock Movements**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record all inventory transactions
- Details:
  - Movement types:
    - Goods Receipt (from purchases)
    - Goods Issue (to production, sales)
    - Stock Transfer (warehouse to warehouse)
    - Stock Adjustment (corrections)
    - Stock Reservation (allocate)
    - Stock Unreservation (release)
  - Movement number (auto-generated)
  - Date and time
  - Item, quantity, UOM
  - From warehouse/location
  - To warehouse/location
  - Reference document (PO, sales order, production order)
  - Reason code (for adjustments)
  - Performed by (user)
  - Notes
- Business Rules:
  - All movements create audit trail
  - Cannot delete movements (can reverse)
  - Updates stock balance immediately

**REQ-INV-022: Lot/Batch Tracking**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Track items by lot number
- Details:
  - Lot number (auto-generated or manual)
  - Lot size (quantity in lot)
  - Manufacturing date
  - Expiry date
  - Supplier lot number
  - Certificate of analysis (COA)
  - Lot status: Available, Quarantine, Blocked, Expired
  - Full traceability (where lot received, used, shipped)
- Business Rules:
  - Lot-tracked items must have lot on all transactions
  - FEFO (First Expired First Out) picking logic
  - Cannot mix lots in same bin (optional rule)
  - Expiry date alerts

**REQ-INV-023: Serial Number Tracking**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track items by individual serial number
- Details:
  - Serial number (unique per item)
  - Serial number per unit
  - Warranty start/end date
  - Current location
  - Current status: In Stock, Sold, In Service, Scrapped
  - Service history
  - Full lifecycle tracking
- Business Rules:
  - Serial-tracked items: one serial per transaction line
  - Serial must be unique globally (or per item)
  - Cannot sell same serial twice

**REQ-INV-024: Stock Reservations**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Allocate stock to orders
- Details:
  - Reserve from on-hand stock
  - Reserve from expected receipts (POs)
  - Reservation priority (sales order date, customer priority)
  - Soft vs hard reservation
  - Auto-reservation on order confirmation
  - Manual reservation/unreservation
- Business Rules:
  - Reserved stock not available for other orders
  - Reservation expires if order cancelled
  - Partial reservation allowed

### 3.4 Stock Transactions

**REQ-INV-030: Goods Receipt (from Purchase)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Receive purchased goods into stock
- Details:
  - Covered in Procurement module (REQ-PROC-040)
  - Updates stock balance
  - Creates stock movement record
  - Updates valuation

**REQ-INV-031: Goods Issue (to Production/Sales)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Issue stock for consumption
- Details:
  - Issue to production order (manufacturing)
  - Issue to sales order (delivery)
  - Issue to cost center (internal consumption)
  - Backflush vs pick list
  - Lot/serial selection
- Business Rules:
  - Reduces stock balance
  - Cost of goods issued
  - Cannot issue more than available (unless override)

**REQ-INV-032: Stock Transfer**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Move stock between warehouses/locations
- Details:
  - Transfer number
  - From warehouse/location
  - To warehouse/location
  - Items and quantities
  - Transfer date
  - In-transit tracking (optional)
  - Two-step transfer: Issue from source, Receive at destination
- Business Rules:
  - Stock reduced at source immediately (or on receive at destination)
  - In-transit stock tracked separately

**REQ-INV-033: Stock Adjustment**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Correct stock balances
- Details:
  - Adjustment number
  - Item, warehouse, location
  - Quantity adjustment (+ or -)
  - Reason code: Physical count, Damage, Obsolescence, Error correction
  - Approval required for adjustments above threshold
  - Valuation adjustment
  - Notes
- Business Rules:
  - Creates GL entry (inventory adjustment account)
  - Audit trail of all adjustments
  - Large adjustments require approval

### 3.5 Stock Valuation

**REQ-INV-040: Valuation Methods**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Support multiple costing methods
- Details:
  - FIFO (First In First Out)
  - LIFO (Last In First Out)
  - Weighted Average
  - Standard Cost
  - Moving Average
- Business Rules:
  - Valuation method set per item
  - Cannot change method with open transactions
  - Valuation recalculated on each transaction (for average methods)

**REQ-INV-041: Cost Layers (FIFO/LIFO)**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Track cost by receipt layer
- Details:
  - Each receipt creates a cost layer
  - Issues consume from oldest (FIFO) or newest (LIFO) layer
  - Track quantity and cost per layer
  - Layer exhaustion and carry-forward

**REQ-INV-042: Standard Cost Maintenance**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage standard costs
- Details:
  - Set standard cost per item
  - Cost roll-up from BOM components
  - Variance tracking (standard vs actual)
  - Periodic standard cost update
  - Cost change approval workflow

### 3.6 Stock Analysis

**REQ-INV-050: ABC Classification**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Classify items by value/usage
- Details:
  - Calculate based on annual usage value
  - A items: 70-80% of value (tight control)
  - B items: 15-25% of value (moderate control)
  - C items: 5-10% of value (minimal control)
  - Auto-classification or manual override
  - Different reorder policies by class

**REQ-INV-051: Stock Aging Report**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Identify slow-moving and obsolete stock
- Details:
  - Age buckets: 0-90 days, 91-180, 181-365, >365
  - Quantity and value per bucket
  - Last movement date
  - Flag obsolete items (no movement >365 days)

**REQ-INV-052: Inventory Turnover Analysis**
- Priority: P2 (Could Have)
- Phase: V1.0
- Description: Calculate turnover ratios
- Details:
  - Turnover = Cost of goods sold / Average inventory
  - By item, category, warehouse
  - Days of inventory on hand
  - Trend analysis

### 3.7 Physical Inventory

**REQ-INV-060: Cycle Counting**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Regular partial stock counts
- Details:
  - Create count schedule (daily, weekly)
  - Select items to count (by ABC, random, problem items)
  - Count sheets (print or mobile)
  - Enter count results
  - Variance report
  - Approve and post adjustments
- Business Rules:
  - High-value items (A) counted more frequently
  - Blind count (don't show system quantity)
  - Second count for large variances

**REQ-INV-061: Full Physical Inventory**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Complete stock take
- Details:
  - Freeze stock movements during count
  - Count all items in warehouse
  - Multiple count teams
  - Variance threshold for recount
  - Approval workflow
  - Post adjustments to GL
- Business Rules:
  - Typically done annually or when required
  - Production may need to stop during count

---

## 4. MODULE 3: MANUFACTURING & PRODUCTION

### 4.1 Bill of Materials (BOM)

**REQ-MFG-001: Multi-Level BOM**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define product structure
- Details:
  - Parent item (manufactured item)
  - Component items (raw materials, sub-assemblies)
  - Quantity per parent unit
  - Component UOM
  - Scrap percentage (expected waste)
  - Operation where component used (routing linkage)
  - Component type: Normal, Phantom, Co-product, By-product
  - Effective dates (from/to for component changes)
  - BOM status: Active, Inactive, Under Development
- Business Rules:
  - Unlimited BOM levels
  - Circular reference prevention
  - Version control (maintain history)
  - Copy BOM function for similar products

**REQ-MFG-002: Component Substitutions**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Define alternate components
- Details:
  - Primary component
  - Substitute component(s)
  - Substitution ratio
  - Priority order
  - Effective dates
- Business Rules:
  - Use primary if available, else substitute
  - Can force substitute selection

**REQ-MFG-003: Co-Products and By-Products**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Multiple outputs from one process
- Details:
  - Co-products: Equal importance outputs (e.g., different cuts of meat)
  - By-products: Secondary outputs (e.g., sawdust from lumber)
  - Cost allocation method for co-products
  - By-product credit to production cost
- Business Rules:
  - Co-products receive proportion of total cost
  - By-products credited at estimated value

**REQ-MFG-004: BOM Cost Roll-Up**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Calculate product cost from components
- Details:
  - Material cost (sum of components)
  - Labor cost (from routing)
  - Overhead cost (from routing)
  - Total standard cost
  - Multi-level cost explosion
  - Cost simulation (what-if analysis)
- Business Rules:
  - Recalculate when component costs change
  - Standard cost vs actual cost comparison

**REQ-MFG-005: Where-Used Report**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Find all BOMs using a component
- Details:
  - Input: component item
  - Output: all parent items (finished goods, sub-assemblies)
  - Quantity per parent
  - Multi-level explosion
  - Impact analysis for component changes

### 4.2 Routing (Production Process)

**REQ-MFG-010: Define Routing**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define production operations
- Details:
  - Routing number
  - Related BOM
  - Sequence of operations
  - Operation number and description
  - Work center (where performed)
  - Setup time (fixed time per batch)
  - Run time (time per unit)
  - Wait time, move time
  - Crew size (number of workers)
  - Machine/tool requirements
  - Scrap rate per operation
  - Quality inspection points
  - Operation instructions (text, images, videos)
- Business Rules:
  - Operations executed in sequence
  - Parallel operations supported
  - Routing must reference valid work centers

**REQ-MFG-011: Work Centers**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define production resources
- Details:
  - Work center code and name
  - Work center type: Machine, Manual, Mixed
  - Capacity (units per hour, shifts per day)
  - Efficiency percentage
  - Cost per hour (labor + machine)
  - Calendar (working days, shifts)
  - Maintenance schedule
- Business Rules:
  - Capacity planning uses work center capacity
  - Cost calculated based on actual time used

**REQ-MFG-012: Alternate Routings**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Multiple ways to manufacture same item
- Details:
  - Primary routing
  - Alternate routings (different machines, methods)
  - Routing selection criteria (capacity, cost, lead time)
- Business Rules:
  - Use primary unless capacity constraint
  - Cost may vary by routing

### 4.3 Production Planning

**REQ-MFG-020: Master Production Schedule (MPS)**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Plan finished goods production
- Details:
  - Planning horizon (weeks/months)
  - Demand sources: Sales forecast, sales orders, safety stock
  - Available capacity
  - Planned production orders by period
  - MPS vs actual tracking
- Business Rules:
  - MPS drives MRP
  - Balance demand and capacity

**REQ-MFG-021: Material Requirements Planning (MRP)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Calculate material needs
- Details:
  - Input: MPS, sales orders, current stock, BOMs, lead times
  - Output: Planned orders (purchase, production)
  - Time-phased requirements
  - Net requirements calculation:
    - Gross requirements (from MPS)
    - Less: On-hand stock
    - Less: On-order (POs, production)
    - Plus: Safety stock
    - = Net requirements
  - Lead time offsetting
  - Lot sizing rules (lot-for-lot, fixed quantity, EOQ)
- Business Rules:
  - MRP run frequency: Daily, weekly, or on-demand
  - Infinite capacity assumption (CRP validates)
  - Exception messages (late orders, excess stock)

**REQ-MFG-022: Capacity Requirements Planning (CRP)**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Validate capacity vs plan
- Details:
  - Calculate load per work center
  - Compare to available capacity
  - Identify bottlenecks
  - Load leveling suggestions
  - Finite vs infinite capacity modes
- Business Rules:
  - Highlights capacity issues before execution
  - May require MPS adjustment

**REQ-MFG-023: Production Forecasting**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Predict future demand
- Details:
  - Historical sales data
  - Seasonality adjustment
  - Trend analysis
  - Forecast methods: Moving average, exponential smoothing
  - Forecast accuracy tracking

### 4.4 Production Orders

**REQ-MFG-030: Create Production Order**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Authorize production
- Details:
  - Production order number (auto-generated)
  - Order type: Standard, Rework, Disassembly
  - Item to produce
  - Quantity to produce
  - BOM reference (and version)
  - Routing reference (and version)
  - Planned start date
  - Planned finish date
  - Priority
  - Source: MRP, sales order, forecast, manual
  - Material allocation (reserve components)
  - Status: Draft, Released, In Progress, Completed, Closed
- Business Rules:
  - Quantity must be positive
  - BOM and routing must be active
  - Material availability check before release

**REQ-MFG-031: Production Order Release**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Start production
- Details:
  - Material availability check
  - Reserve components from stock
  - Create pick list for materials
  - Print work orders
  - Status: Draft → Released
- Business Rules:
  - Cannot release without materials (or override)
  - Release triggers material issue (backflush or pick)

**REQ-MFG-032: Material Issue to Production**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Consume materials
- Details:
  - Issue methods:
    - Pick list (issue all materials upfront)
    - Backflush (issue automatically on production reporting)
    - Manual issue (as needed)
  - Lot/serial selection for components
  - Over/under issue handling
- Business Rules:
  - Reduces component stock
  - Charges to WIP or production order cost

**REQ-MFG-033: Production Order Confirmation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Report production progress
- Details:
  - Operation completion reporting
  - Quantity produced (good + scrap)
  - Actual time (vs standard)
  - Actual materials consumed (vs BOM)
  - Partial confirmations allowed
  - Cumulative vs individual confirmations
- Business Rules:
  - Can confirm multiple times per operation
  - Final confirmation closes operation

**REQ-MFG-034: Finished Goods Receipt**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Receive completed production into stock
- Details:
  - Quantity produced
  - Lot number assignment
  - Quality inspection (if required)
  - Move from WIP to finished goods
  - Update stock
  - Cost settlement (actual cost to finished goods)
- Business Rules:
  - Increases finished goods stock
  - Closes production order (if fully complete)

**REQ-MFG-035: Production Order Closing**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Finalize production order
- Details:
  - Close remaining material reservations
  - Settle WIP to finished goods
  - Calculate variances (material, labor, overhead)
  - Post variances to GL
  - Archive order data
  - Status: Completed → Closed
- Business Rules:
  - Cannot close with pending operations
  - Variance approval may be required
  - Cannot reopen after closing

### 4.5 Shop Floor Control

**REQ-MFG-040: Work Order Dispatching**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Schedule and assign work orders
- Details:
  - Queue of released production orders
  - Work center load view
  - Priority-based sequencing
  - Assign to work center/operator
  - Print work order documents:
    - Operation instructions
    - Material pick list
    - Quality checklist
    - Drawings/specifications

**REQ-MFG-041: Operation Time Recording**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track actual time per operation
- Details:
  - Clock in/out per operation
  - Setup time tracking
  - Run time tracking
  - Downtime tracking (reason codes)
  - Operator ID
  - Integration with time & attendance (future)
- Business Rules:
  - Actual time vs standard time variance
  - Overtime calculation
  - Crew time (multiple operators)

**REQ-MFG-042: Quality Inspection on Production**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: In-process quality checks
- Details:
  - Inspection points in routing
  - Inspection checklist
  - Sample size (statistical sampling)
  - Measurements and test results
  - Pass/fail/rework decision
  - Non-conformance reporting
  - Rework routing
- Business Rules:
  - Failed items go to rework or scrap
  - Inspection results tracked for SPC

**REQ-MFG-043: Scrap and Rework Tracking**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Record waste and rework
- Details:
  - Scrap quantity and reason
  - Scrap cost (material + labor to point of scrap)
  - Rework quantity
  - Rework cost (additional material + labor)
  - Scrap GL posting
- Business Rules:
  - Scrap within tolerance: normal (in standard)
  - Scrap above tolerance: variance
  - Rework: additional cost to production order

### 4.6 Production Costing

**REQ-MFG-050: Standard Costing**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Predetermined costs
- Details:
  - Standard material cost (from BOM)
  - Standard labor cost (from routing)
  - Standard overhead cost (rate per hour or unit)
  - Total standard cost per unit
  - Cost roll-up from components
- Business Rules:
  - Standards set annually or as needed
  - Used for valuation and variance analysis

**REQ-MFG-051: Actual Costing**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record actual costs
- Details:
  - Actual material cost (materials issued)
  - Actual labor cost (time recorded × rate)
  - Actual overhead (allocated based on driver)
  - Total actual cost per production order
- Business Rules:
  - Actual costs may vary by batch
  - Used for profitability analysis

**REQ-MFG-052: Variance Analysis**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Compare standard vs actual
- Details:
  - Material price variance (actual price vs standard)
  - Material usage variance (actual qty vs BOM qty)
  - Labor rate variance (actual rate vs standard)
  - Labor efficiency variance (actual time vs standard)
  - Overhead spending variance
  - Overhead volume variance
  - Total variance per production order
- Business Rules:
  - Favorable variance: actual < standard
  - Unfavorable variance: actual > standard
  - Large variances trigger investigation

**REQ-MFG-053: Work-in-Progress (WIP) Valuation**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Value unfinished production
- Details:
  - WIP = Materials issued + labor + overhead (partially complete)
  - Track by production order
  - Period-end WIP balance
  - WIP aging report
- Business Rules:
  - WIP appears on balance sheet
  - Moves to finished goods when complete

---

**Note:** This is approximately 40% of the complete functional requirements document. The remaining modules (Sales, Distribution, Maintenance, Finance, Reporting) follow the same detailed format.

**Should I continue with the remaining modules (Sales through Reporting)?** Each module will be similarly comprehensive with 10-20 requirements each.

Or would you prefer to:
1. Continue with all remaining modules now
2. Move to database schema design
3. Move to API specification
4. Something else

What would you like to do next?
