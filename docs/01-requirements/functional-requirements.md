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

---

## 5. MODULE 4: SALES MANAGEMENT

### 5.1 Customer Master Data

**REQ-SALES-001: Customer Master Records**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Maintain customer information
- Details:
  - Customer code (auto or manual, unique)
  - Customer name (legal and trade name)
  - Tax ID (RNC for Dominican Republic)
  - Customer type: Distributor, Retailer, End User, Export
  - Customer group/classification
  - Contact information (phone, email, website)
  - Multiple addresses (billing, shipping, delivery)
  - Payment terms (net 30, net 60, COD, advance payment)
  - Credit limit
  - Credit status: Good, On Hold, Blocked
  - Price list assignment
  - Currency preference
  - Sales representative assignment
  - Tax exemption status
  - Tax exemption certificate (if applicable)
  - Preferred delivery method
  - Special instructions
  - Customer since date
  - Active/inactive status
  - Bank account details (for refunds)
  - Notes and attachments
- Business Rules:
  - Customer code must be unique per tenant
  - Credit limit enforcement (configurable)
  - Cannot delete customer with transactions
  - Soft delete only (maintain history)
  - Tax ID validation for local customers

**REQ-SALES-002: Customer Contact Management**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Track multiple contacts per customer
- Details:
  - Contact name, title, department
  - Email, phone, mobile
  - Primary contact flag
  - Purchasing authority level
  - Contact-specific notes
  - Birthday/anniversary (for relationship management)

**REQ-SALES-003: Customer Credit Management**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Manage customer credit limits
- Details:
  - Credit limit amount
  - Current outstanding balance
  - Available credit
  - Credit hold flag
  - Credit check on order entry
  - Override authorization for exceeded limits
  - Payment history tracking
  - Credit review date
- Business Rules:
  - Cannot confirm order if credit limit exceeded (unless override)
  - Credit limit check: Outstanding invoices + current order
  - Override requires manager approval

**REQ-SALES-004: Customer Pricing**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Customer-specific pricing
- Details:
  - Base price list
  - Customer-specific prices (override base)
  - Volume discounts (quantity breaks)
  - Promotional pricing (time-limited)
  - Contract pricing (agreement-based)
  - Price validity dates
- Business Rules:
  - Most specific price wins (customer > group > base)
  - Volume discounts calculated automatically
  - Expired prices revert to base

### 5.2 Sales Quotations

**REQ-SALES-010: Create Sales Quotation**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Prepare formal quotes for customers
- Details:
  - Quotation number (auto-generated)
  - Customer
  - Quote date
  - Valid until date
  - Delivery terms (Incoterms)
  - Payment terms
  - Currency
  - Sales representative
  - Multiple line items:
    - Item/service
    - Description
    - Quantity
    - Unit of measure
    - Unit price
    - Discount percentage
    - Tax code
    - Line total
  - Subtotal, discount, tax, total
  - Terms and conditions
  - Notes
  - Attachments (specs, drawings)
  - Quote status: Draft, Sent, Accepted, Rejected, Expired
- Business Rules:
  - Price from customer price list or base
  - Auto-expire after valid until date
  - Can have multiple active quotes per customer

**REQ-SALES-011: Quote Versioning**
- Priority: P2 (Could Have)
- Phase: V1.0
- Description: Track quote revisions
- Details:
  - Version number
  - Revision date
  - Changes from previous version
  - Version comparison view
- Business Rules:
  - New version supersedes previous
  - Maintain all versions for history

**REQ-SALES-012: Convert Quote to Order**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Create sales order from accepted quote
- Details:
  - One-click conversion
  - Carry forward all quote details
  - Allow modifications before confirming order
  - Link order to original quote
- Business Rules:
  - Quote status becomes "Converted"
  - Cannot convert expired quotes

### 5.3 Sales Orders

**REQ-SALES-020: Create Sales Order**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record customer orders
- Details:
  - Sales order number (auto-generated with prefix)
  - Customer
  - Order date
  - Customer PO number
  - Requested delivery date
  - Promised delivery date
  - Delivery address (from customer or override)
  - Shipping method
  - Payment terms
  - Currency
  - Sales representative
  - Order type: Standard, Rush, Blanket, Return
  - Multiple line items:
    - Item
    - Description
    - Ordered quantity
    - Reserved quantity
    - Delivered quantity
    - Unit of measure
    - Unit price
    - Discount
    - Tax code
    - Delivery date (line level)
    - Line status
  - Subtotal, discount, tax, freight, total
  - Special instructions
  - Notes
  - Attachments
  - Order status: Draft, Confirmed, In Production, Partially Shipped, Shipped, Invoiced, Closed
- Business Rules:
  - Customer must be active
  - Credit limit check on confirmation
  - Must have at least one line item
  - All items must be saleable
  - Quantities must be positive

**REQ-SALES-021: Available-to-Promise (ATP)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Check stock availability
- Details:
  - Real-time stock check during order entry
  - ATP calculation:
    - On-hand stock
    - Less: Reserved for other orders
    - Plus: Expected receipts (POs, production)
    - = Available quantity
  - ATP by requested delivery date
  - Alternative date suggestion if not available
  - Display per warehouse
- Business Rules:
  - Show ATP before confirming line
  - Warning if insufficient stock
  - Can backorder (accept order without stock)

**REQ-SALES-022: Stock Reservation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Allocate stock to order
- Details:
  - Automatic reservation on order confirmation
  - Reservation by warehouse
  - Lot/serial selection (if applicable)
  - Partial reservation allowed
  - Reservation priority (by delivery date, customer priority)
- Business Rules:
  - Reserved stock not available for other orders
  - Reservation released if order cancelled
  - Reservation adjusted if order quantity changed

**REQ-SALES-023: Order Confirmation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Confirm order with customer
- Details:
  - Credit check
  - Stock reservation
  - Email confirmation to customer
  - PDF order confirmation
  - Status: Draft → Confirmed
- Business Rules:
  - Cannot confirm if credit limit exceeded (unless override)
  - Cannot confirm without stock (or backorder approval)
  - Confirmation triggers production if make-to-order

**REQ-SALES-024: Order Amendments**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Modify order after confirmation
- Details:
  - Change quantity (adjust reservation)
  - Change price (requires approval)
  - Add/remove lines
  - Change delivery date
  - Amendment history
- Business Rules:
  - Cannot modify if partially/fully shipped
  - Price changes require approval
  - Reservation updated automatically

**REQ-SALES-025: Order Cancellation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Cancel sales order
- Details:
  - Cancel entire order or individual lines
  - Cancellation reason required
  - Release reservations
  - Cancel production orders (if make-to-order)
  - Cannot cancel if shipped
- Business Rules:
  - Partial cancellation allowed
  - Cancellation cannot be undone
  - Customer notification

**REQ-SALES-026: Backorder Management**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Handle stock shortages
- Details:
  - Backorder when stock insufficient
  - Backorder quantity tracked
  - Auto-allocation when stock arrives
  - Partial shipment option
  - Backorder aging report
- Business Rules:
  - Customer approval for backorders
  - Automatic fulfillment when stock available
  - Separate delivery for backordered items

### 5.4 Delivery Management

**REQ-SALES-030: Create Delivery Note**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Prepare goods for shipment
- Details:
  - Delivery note number (auto-generated)
  - Reference sales order(s)
  - Customer
  - Delivery date
  - Delivery address
  - Shipping method
  - Warehouse (source)
  - Items to deliver:
    - Item
    - Ordered quantity
    - Delivered quantity
    - Outstanding quantity
    - Lot/serial numbers
  - Packing details (boxes, weight, volume)
  - Carrier information
  - Tracking number
  - Special handling instructions
  - Status: Draft, Picked, Packed, Shipped, Delivered
- Business Rules:
  - Can create multiple deliveries per order (partial shipments)
  - Reduces reserved stock and issues from warehouse
  - Cannot deliver more than ordered (unless override)
  - Lot/serial selection required for tracked items

**REQ-SALES-031: Picking Process**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Pick items from warehouse
- Details:
  - Picking list generation
  - Pick by order or wave picking (multiple orders)
  - Bin location guidance
  - Picking confirmation (barcode scanning)
  - Pick exceptions (short pick, damaged goods)
  - Picking priority
- Business Rules:
  - FEFO/FIFO picking for lot-tracked items
  - Picking updates stock immediately (or on pack)

**REQ-SALES-032: Packing**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Pack picked items for shipment
- Details:
  - Packing slip generation
  - Packing by box/container
  - Weight and dimensions per box
  - Packing materials tracking
  - Serial number verification
  - Quality check before packing
- Business Rules:
  - Packing list matches picked items
  - Weight for freight calculation

**REQ-SALES-033: Shipping**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Ship to customer
- Details:
  - Carrier selection
  - Shipping service (ground, express, overnight)
  - Freight cost calculation
  - Generate shipping label
  - Track shipment status
  - Proof of delivery (POD)
  - Actual ship date
- Business Rules:
  - Shipping updates order status
  - Freight charges added to invoice
  - Cannot ship without packing

### 5.5 Sales Invoicing

**REQ-SALES-040: Create Sales Invoice**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Bill customer for delivered goods
- Details:
  - Invoice number (auto-generated, sequential)
  - NCF (Números de Comprobante Fiscal) for Dominican Republic
  - Customer
  - Invoice date
  - Due date (from payment terms)
  - Reference sales order(s) and delivery note(s)
  - Currency
  - Line items (from delivery):
    - Item
    - Description
    - Quantity invoiced
    - Unit price
    - Discount
    - Tax
    - Line total
  - Subtotal
  - Discount amount
  - Tax amount (ITBIS for DR)
  - Freight charges
  - Total amount
  - Payment terms
  - Bank account details
  - Invoice status: Draft, Posted, Partially Paid, Paid, Overdue, Cancelled
  - QR code (for e-Factura DR)
- Business Rules:
  - Cannot invoice without delivery (or allow override for services)
  - Invoice creates AR transaction
  - Posted invoices cannot be modified (credit note required)
  - NCF sequential control (Dominican Republic)

**REQ-SALES-041: NCF Management (Dominican Republic)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Manage fiscal receipt numbers (DGII compliance)
- Details:
  - NCF sequence by document type:
    - B01 (Tax Credit)
    - B02 (Consumer Final)
    - B14 (Special Regime)
    - B15 (Government)
    - B16 (Export)
  - NCF authorization from DGII
  - Sequential control (no gaps allowed)
  - Expiration date tracking
  - NCF usage report
  - Void NCF tracking
- Business Rules:
  - Must use correct NCF type per customer tax status
  - Cannot skip NCF numbers
  - Alert when 80% of sequence used
  - Cannot use expired NCF

**REQ-SALES-042: Electronic Invoicing (e-Factura)**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Generate and submit e-Factura to DGII
- Details:
  - XML generation per DGII format
  - Digital signature
  - Submit to DGII portal
  - Receive acceptance code
  - Email PDF + XML to customer
  - Track submission status
- Business Rules:
  - Mandatory for certain taxpayers (Dominican Republic)
  - Must receive DGII acceptance before valid

**REQ-SALES-043: Invoice from Order (No Delivery)**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Invoice services or advance payments
- Details:
  - Invoice directly from sales order
  - No delivery note required
  - Common for: Services, subscriptions, deposits
  - Manual quantity entry
- Business Rules:
  - Typically for non-stockable items
  - Still creates AR transaction

**REQ-SALES-044: Recurring Invoices**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Auto-generate periodic invoices
- Details:
  - Invoice template
  - Recurrence pattern (monthly, quarterly, annually)
  - Auto-generation date
  - Auto-email to customer
  - Used for: Subscriptions, rentals, maintenance contracts

### 5.6 Sales Returns

**REQ-SALES-050: Create Sales Return**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Process customer returns
- Details:
  - Return authorization number (RMA)
  - Customer
  - Reference invoice
  - Return date
  - Return reason (defect, wrong item, overage, customer error)
  - Items to return:
    - Item
    - Invoiced quantity
    - Return quantity
    - Condition (good, damaged, defective)
    - Lot/serial number
  - Restocking fee (if applicable)
  - Return method: Credit note, replacement, refund
  - Return shipping cost
  - Status: Requested, Approved, Received, Credited
- Business Rules:
  - Cannot return more than invoiced
  - Return increases stock (if good condition)
  - Damaged returns go to separate location/status
  - Creates credit note (reverses invoice)

**REQ-SALES-051: Credit Notes**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Credit customer account
- Details:
  - Credit note number (auto-generated)
  - Reference invoice (original invoice being credited)
  - Credit date
  - Credit reason
  - Line items (from return or manual)
  - Credit amount
  - Tax credit
  - Allocation to open invoices or customer account
- Business Rules:
  - Credit note reduces AR balance
  - Can be allocated to future invoices
  - NCF required (Dominican Republic) - type B04

### 5.7 Customer Payments

**REQ-SALES-060: Record Customer Payment**
- Priority: P0 (Must Have)
- Phase: MVP (part of Finance module)
- Description: Receive payment from customer
- Details:
  - Payment number
  - Customer
  - Payment date
  - Payment method (cash, check, transfer, credit card)
  - Payment reference (check number, transfer ID)
  - Payment amount
  - Currency
  - Allocate to invoices:
    - Invoice number
    - Invoice amount
    - Amount paid
    - Discount taken (if early payment)
  - Unapplied amount (customer advance)
  - Bank account (where deposited)
- Business Rules:
  - Cannot overpay invoice (excess goes to customer credit)
  - Payment updates invoice status
  - Multi-currency payment with exchange rate
  - Early payment discount calculation

**REQ-SALES-061: Payment Allocation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Apply payment to invoices
- Details:
  - Auto-allocation to oldest invoice first
  - Manual allocation to specific invoices
  - Partial payment allocation
  - Payment on account (unapplied balance)
- Business Rules:
  - Fully paid invoices closed
  - Partial payments tracked per invoice

**REQ-SALES-062: Customer Refunds**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Refund customer overpayments
- Details:
  - Refund from customer credit balance
  - Refund method (check, transfer)
  - Refund approval workflow
  - Reduces customer credit
- Business Rules:
  - Cannot refund more than credit balance
  - Approval required for refunds >$X

### 5.8 Pricing & Discounts

**REQ-SALES-070: Price Lists**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Manage multiple price lists
- Details:
  - Price list name (Wholesale, Retail, Distributor, Export)
  - Currency
  - Effective dates (from/to)
  - Item prices:
    - Item
    - Base price
    - Margin percentage (optional)
  - Price list assignment to customers/groups
- Business Rules:
  - Multiple price lists allowed
  - Customer defaults to assigned price list
  - Expired price lists inactive

**REQ-SALES-071: Discount Management**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Apply discounts
- Details:
  - Discount types:
    - Line discount (% or amount per line)
    - Header discount (% or amount on total)
    - Volume discount (quantity breaks)
    - Promotional discount (time-limited)
    - Customer-specific discount
  - Discount approval limits
  - Discount authorization
  - Stacking rules (can combine discounts?)
- Business Rules:
  - Maximum discount percentage configurable
  - Excessive discounts require approval
  - Discounts reduce taxable amount

**REQ-SALES-072: Volume Pricing**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Quantity-based pricing
- Details:
  - Quantity breaks (1-10, 11-50, 51-100, 101+)
  - Price per quantity tier
  - Cumulative vs non-cumulative
  - Per customer or global
- Business Rules:
  - Auto-applied based on order quantity
  - Lower price at higher volumes

**REQ-SALES-073: Promotional Pricing**
- Priority: P2 (Could Have)
- Phase: V1.0
- Description: Time-limited special pricing
- Details:
  - Promotion name
  - Valid dates (start/end)
  - Items included
  - Promotional price or discount
  - Customer restrictions (all or specific)
  - Coupon code support
- Business Rules:
  - Auto-expire after end date
  - Promotional price overrides base price

### 5.9 Sales Analytics

**REQ-SALES-080: Sales Reporting**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Standard sales reports
- Details:
  - Sales by period (day, week, month, quarter, year)
  - Sales by customer
  - Sales by item
  - Sales by sales representative
  - Sales by region/territory
  - Sales vs budget/forecast
  - Top customers (by revenue)
  - Top products (by quantity, revenue)
  - Sales trend analysis
  - Customer profitability

**REQ-SALES-081: Sales Dashboards**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Real-time sales KPIs
- Details:
  - Today's sales
  - Month-to-date sales
  - Sales vs target (progress bar)
  - Open orders value
  - Overdue invoices
  - Top customers this month
  - Sales pipeline
  - Charts and graphs
- Business Rules:
  - Real-time updates
  - Drill-down to details

---

## 6. MODULE 5: DISTRIBUTION & LOGISTICS

### 6.1 Route Planning

**REQ-DIST-001: Define Delivery Routes**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Plan delivery routes
- Details:
  - Route code and name
  - Route type: Standard, Express, Special
  - Coverage area (geographic)
  - Service days (which days of week)
  - Estimated duration
  - Maximum capacity (weight, volume)
  - Sequence of stops
  - Default vehicle assignment
  - Default driver assignment
- Business Rules:
  - Routes can overlap geographically
  - Capacity cannot be exceeded (or warning)

**REQ-DIST-002: Route Optimization**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Optimize delivery sequence
- Details:
  - Input: Delivery addresses, time windows, priorities
  - Algorithm: Minimize distance/time
  - Output: Optimized stop sequence
  - Integration with mapping services (Google Maps)
- Business Rules:
  - Respects time windows
  - Respects vehicle capacity
  - Balances routes if multiple vehicles

### 6.2 Vehicle & Driver Management

**REQ-DIST-010: Vehicle Master Data**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage delivery fleet
- Details:
  - Vehicle number/plate
  - Vehicle type (truck, van, motorcycle)
  - Make, model, year
  - Capacity (weight, volume)
  - Fuel type
  - Current mileage
  - Insurance details
  - Registration expiry
  - Maintenance schedule
  - GPS device ID
  - Active/inactive status
- Business Rules:
  - Cannot assign to route if inactive or in maintenance
  - Alert for expiring insurance/registration

**REQ-DIST-011: Driver Master Data**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage delivery drivers
- Details:
  - Driver ID
  - Name, contact info
  - License number
  - License expiry
  - License class
  - Assigned vehicle (default)
  - Employment status
  - Performance metrics (on-time %, incidents)
- Business Rules:
  - Cannot assign driver with expired license
  - Driver rating based on delivery performance

### 6.3 Delivery Scheduling

**REQ-DIST-020: Create Delivery Schedule**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Plan daily deliveries
- Details:
  - Delivery date
  - Route assignment
  - Vehicle assignment
  - Driver assignment
  - List of deliveries (from sales orders):
    - Delivery note
    - Customer
    - Address
    - Planned time window
    - Priority
    - Special instructions
  - Load plan (sequence of loading)
  - Estimated departure time
  - Estimated return time
- Business Rules:
  - All deliveries on schedule assigned to one route
  - Load in reverse delivery order (last delivery loaded first)
  - Cannot exceed vehicle capacity

**REQ-DIST-021: Load Planning**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Optimize truck loading
- Details:
  - Total weight and volume
  - Weight distribution
  - Fragile items protection
  - Loading sequence
  - Loading bay assignment
  - Loading checklist
- Business Rules:
  - Weight limit check
  - Volume utilization
  - Heavy items bottom, fragile on top

### 6.4 Delivery Execution

**REQ-DIST-030: Delivery Tracking**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track deliveries in real-time
- Details:
  - Delivery status: Scheduled, In Transit, Delivered, Failed
  - GPS tracking (vehicle location)
  - Estimated time of arrival (ETA)
  - Delivery exceptions (delays, issues)
  - Customer notifications (SMS/email)
  - Live map view
- Business Rules:
  - Status updated by driver (mobile app) or system
  - Customer receives ETA notification

**REQ-DIST-031: Proof of Delivery (POD)**
- Priority: P0 (Must Have)
- Phase: V1.0
- Description: Confirm delivery completion
- Details:
  - Delivery date and time (actual)
  - Received by (customer name)
  - Signature capture (digital)
  - Photo of delivered goods (optional)
  - Delivery notes (condition, issues)
  - Full delivery vs partial delivery
  - Failed delivery reason (if applicable)
- Business Rules:
  - POD required to close delivery
  - POD attached to invoice
  - Failed deliveries rescheduled

**REQ-DIST-032: Delivery Exceptions**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Handle delivery problems
- Details:
  - Exception types:
    - Customer not available
    - Wrong address
    - Customer refused delivery
    - Damaged goods in transit
    - Partial delivery (customer accepted partial)
  - Exception logging
  - Resolution tracking
  - Automatic rescheduling
- Business Rules:
  - Exception creates task for follow-up
  - Customer notified of exception

### 6.5 Freight Management

**REQ-DIST-040: Freight Cost Calculation**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Calculate shipping charges
- Details:
  - Freight calculation methods:
    - Flat rate per delivery
    - Per kg/lb
    - Per km/mile
    - Tiered by weight/distance
    - Actual carrier charges
  - Freight matrix (zone-based)
  - Fuel surcharge
  - Handling charges
  - Minimum charge
- Business Rules:
  - Freight added to sales invoice
  - Customer can pay freight separately or included

**REQ-DIST-041: Third-Party Logistics (3PL)**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Integration with external carriers
- Details:
  - Carrier master data (DHL, FedEx, UPS, local couriers)
  - Rate shopping (compare carriers)
  - Shipment creation via carrier API
  - Label printing
  - Tracking integration
  - Proof of delivery from carrier
- Business Rules:
  - Select lowest cost carrier (or customer preference)
  - Track shipment via carrier system

### 6.6 Returns Logistics (Reverse Logistics)

**REQ-DIST-050: Return Pickup Scheduling**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Schedule pickup of returns
- Details:
  - Return authorization (from sales return)
  - Pickup address (customer)
  - Pickup date/time window
  - Assigned to route/driver
  - Return reason
  - Expected return quantity
- Business Rules:
  - Pickup added to delivery route
  - Returned items inspected on receipt

---

## 7. MODULE 6: ASSET & MAINTENANCE MANAGEMENT

### 7.1 Fixed Asset Management

**REQ-ASSET-001: Asset Master Data**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Register fixed assets
- Details:
  - Asset number (auto-generated)
  - Asset description
  - Asset class: Building, Machinery, Vehicle, Furniture, IT Equipment
  - Asset category
  - Manufacturer, model, serial number
  - Acquisition date
  - Acquisition cost
  - Supplier/vendor
  - Location (site, department)
  - Responsible person/department
  - Warranty information
  - Useful life (years)
  - Depreciation method
  - Salvage value
  - Current book value
  - Asset status: In Use, Idle, Under Maintenance, Disposed
  - Photos and documents
  - Notes
- Business Rules:
  - Asset number unique
  - Cannot delete asset with depreciation history
  - Asset cost cannot be zero

**REQ-ASSET-002: Asset Depreciation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Calculate and post depreciation
- Details:
  - Depreciation methods:
    - Straight-line
    - Declining balance
    - Sum of years digits
    - Units of production
  - Depreciation schedule
  - Monthly/annual depreciation amount
  - Accumulated depreciation
  - Net book value
  - Depreciation posting to GL
  - Depreciation run (monthly batch process)
- Business Rules:
  - Depreciation starts from placed-in-service date
  - Fully depreciated assets remain in system
  - Depreciation posted to GL automatically

**REQ-ASSET-003: Asset Transfer**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Move asset between locations/departments
- Details:
  - Transfer date
  - From location/department
  - To location/department
  - Transfer reason
  - Transfer authorization
  - Update responsible person
  - Transfer history
- Business Rules:
  - Cannot transfer disposed assets
  - Cost center change if inter-department

**REQ-ASSET-004: Asset Disposal**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Retire or sell assets
- Details:
  - Disposal date
  - Disposal method: Sale, Scrap, Donation, Trade-in
  - Sale price (if sold)
  - Buyer information
  - Gain/loss calculation:
    - Sale price - Net book value = Gain/Loss
  - GL posting (remove asset, post gain/loss)
  - Disposal approval
  - Disposal documentation
- Business Rules:
  - Cannot dispose asset in use (must change status first)
  - Gain/loss posted to GL
  - Asset marked as disposed (not deleted)

**REQ-ASSET-005: Asset Valuation**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track asset values
- Details:
  - Original cost
  - Accumulated depreciation
  - Net book value
  - Revaluation (if applicable)
  - Impairment losses
  - Fair market value (estimate)
- Business Rules:
  - Revaluation creates GL entry
  - Impairment reduces carrying value

### 7.2 Equipment Management

**REQ-ASSET-010: Equipment Master Data**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Track production equipment
- Details:
  - Equipment ID
  - Equipment name
  - Equipment type (work center linkage)
  - Manufacturer, model, serial number
  - Installation date
  - Capacity (units per hour, max load)
  - Specifications (power, dimensions)
  - Operating parameters
  - Maintenance requirements
  - Spare parts list
  - Operating manual (attachment)
  - Equipment status: Operational, Down, Under Maintenance
  - Current location
- Business Rules:
  - Equipment linked to work center
  - Equipment downtime affects production capacity

**REQ-ASSET-011: Equipment History**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track equipment events
- Details:
  - Maintenance history
  - Breakdown history
  - Repair history
  - Part replacement history
  - Operating hours
  - Production output
  - Downtime tracking
- Business Rules:
  - Complete history maintained
  - Used for predictive maintenance

### 7.3 Preventive Maintenance

**REQ-MAINT-001: Maintenance Plans**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Define preventive maintenance schedules
- Details:
  - Plan ID
  - Equipment/asset
  - Maintenance type: Inspection, Service, Calibration, Lubrication
  - Frequency:
    - Time-based (daily, weekly, monthly, yearly)
    - Usage-based (every X hours, X units produced)
    - Combination
  - Task checklist
  - Estimated duration
  - Required skills/technicians
  - Spare parts needed
  - Tools required
  - Instructions/procedures
  - Next scheduled date
  - Plan status: Active, Suspended, Completed
- Business Rules:
  - Auto-generate work orders based on schedule
  - Alert before due date

**REQ-MAINT-002: Maintenance Task Templates**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Standardize maintenance tasks
- Details:
  - Task template name
  - Task type
  - Task checklist (steps)
  - Safety procedures
  - Quality checkpoints
  - Estimated time
  - Required parts
  - Required tools
  - Skill requirements
  - Photos/videos/manuals
- Business Rules:
  - Templates reusable across equipment
  - Version control for templates

**REQ-MAINT-003: Auto-Generate Work Orders**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Create scheduled maintenance work orders
- Details:
  - Auto-generation based on maintenance plan
  - Work order created X days before due date
  - Pre-populate from plan
  - Assign to maintenance team
  - Email notification
- Business Rules:
  - One work order per maintenance event
  - Can be rescheduled if needed

### 7.4 Corrective Maintenance

**REQ-MAINT-010: Breakdown Request**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Report equipment failures
- Details:
  - Request number
  - Equipment/asset
  - Reported by (user)
  - Report date/time
  - Problem description
  - Urgency: Emergency, High, Medium, Low
  - Impact on production
  - Photos/videos of problem
  - Request status: Open, Assigned, In Progress, Completed, Closed
- Business Rules:
  - Emergency requests auto-escalate
  - Equipment status changed to "Down"

**REQ-MAINT-011: Create Maintenance Work Order**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Authorize maintenance work
- Details:
  - Work order number (auto-generated)
  - Work order type: Preventive, Corrective, Inspection, Project
  - Equipment/asset
  - Problem description
  - Priority
  - Assigned to (technician/team)
  - Planned start date
  - Planned completion date
  - Estimated hours
  - Parts required (reserve from stock)
  - Work instructions
  - Safety requirements
  - Work order status: Planned, Released, In Progress, Completed, Closed
- Business Rules:
  - Parts reserved when work order released
  - Cannot close without completion confirmation

**REQ-MAINT-012: Work Order Execution**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Perform and record maintenance
- Details:
  - Start date/time (actual)
  - Technician(s)
  - Work performed (description)
  - Parts used (issue from stock)
  - Actual labor hours
  - Tools used
  - Completion checklist
  - Quality inspection
  - Photos of completed work
  - Follow-up actions required
  - End date/time (actual)
- Business Rules:
  - Parts issued reduce stock
  - Labor and parts cost to work order
  - Equipment status restored when completed

**REQ-MAINT-013: Root Cause Analysis**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Analyze breakdown causes
- Details:
  - Problem categorization
  - Root cause identification (5 Whys, Fishbone)
  - Corrective action
  - Preventive action
  - Link to similar past breakdowns
- Business Rules:
  - Required for recurring issues
  - Used to improve maintenance plans

### 7.5 Spare Parts Management

**REQ-MAINT-020: Spare Parts Catalog**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Link parts to equipment
- Details:
  - Equipment to parts relationship
  - Critical vs non-critical parts
  - Minimum stock levels
  - Reorder points
  - Preferred suppliers
  - Lead times
  - Alternative parts
- Business Rules:
  - Critical parts always in stock
  - Auto-reorder when minimum reached

**REQ-MAINT-021: Parts Reservation for Work Orders**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Reserve parts for planned maintenance
- Details:
  - Parts list from maintenance plan
  - Check stock availability
  - Reserve parts
  - Issue parts when work order starts
  - Return unused parts
- Business Rules:
  - Reserved parts not available for production
  - Returns increase stock

### 7.6 Maintenance Analytics

**REQ-MAINT-030: Equipment Downtime Analysis**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track equipment availability
- Details:
  - Downtime by equipment
  - Downtime by reason (breakdown, maintenance, no demand)
  - Mean Time Between Failures (MTBF)
  - Mean Time To Repair (MTTR)
  - Overall Equipment Effectiveness (OEE)
  - Availability percentage
- Business Rules:
  - Calculated from work order history
  - Used to prioritize improvement projects

**REQ-MAINT-031: Maintenance Cost Tracking**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track maintenance expenses
- Details:
  - Cost by equipment/asset
  - Cost by maintenance type (preventive vs corrective)
  - Parts cost vs labor cost
  - Trend analysis
  - Budget vs actual
  - Cost per production unit
- Business Rules:
  - Costs from work orders (parts + labor)
  - Used for budgeting

**REQ-MAINT-032: Maintenance KPI Dashboard**
- Priority: P2 (Could Have)
- Phase: V1.0
- Description: Real-time maintenance metrics
- Details:
  - Open work orders
  - Overdue work orders
  - Equipment availability
  - Preventive vs corrective ratio
  - Top problem equipment
  - Maintenance backlog
- Business Rules:
  - Real-time updates
  - Drill-down to details

### 7.7 Project Management (CAPEX)

**REQ-PROJ-001: Create Capital Project**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage capital expenditure projects
- Details:
  - Project number
  - Project name
  - Project type: New Equipment, Facility Expansion, Upgrade
  - Project description
  - Budget (approved amount)
  - Project manager
  - Start date
  - End date
  - Project phases/milestones
  - Resources required
  - Deliverables
  - Project status: Planning, Approved, In Progress, Completed, Closed
- Business Rules:
  - Budget approval required
  - Cannot exceed budget without re-approval

**REQ-PROJ-002: Project Cost Tracking**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track project expenditures
- Details:
  - Committed costs (POs issued)
  - Actual costs (invoices received)
  - Budget vs actual variance
  - Cost by category (equipment, labor, materials, services)
  - Forecast to complete
- Business Rules:
  - All project costs tagged to project number
  - Alert when approaching budget limit

**REQ-PROJ-003: Project Phases & Milestones**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track project progress
- Details:
  - Phase name
  - Planned start/end dates
  - Actual start/end dates
  - Phase deliverables
  - Phase completion percentage
  - Dependencies
  - Milestones with dates
- Business Rules:
  - Phases can overlap or sequential
  - Milestone completion tracked

**REQ-PROJ-004: Project Completion & Asset Capitalization**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Close project and create asset
- Details:
  - Project closeout checklist
  - Final cost reconciliation
  - Create fixed asset from project
  - Transfer project cost to asset cost
  - Start depreciation
  - Lessons learned documentation
- Business Rules:
  - Project costs become asset acquisition cost
  - Depreciation starts when asset placed in service

---

## 8. MODULE 7: FINANCIAL MANAGEMENT

### 8.1 Chart of Accounts

**REQ-FIN-001: Define Chart of Accounts**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Create account structure
- Details:
  - Account number (hierarchical coding)
  - Account name
  - Account type: Asset, Liability, Equity, Revenue, Expense
  - Account category:
    - Assets: Current, Fixed, Other
    - Liabilities: Current, Long-term
    - Equity: Capital, Retained Earnings
    - Revenue: Operating, Non-operating
    - Expense: Cost of Sales, Operating, Non-operating
  - Account group (for reporting)
  - Currency (if multi-currency account)
  - Tax category
  - Allow manual posting (yes/no)
  - Reconciliation required (yes/no for bank accounts)
  - Active/inactive status
  - Account hierarchy (parent-child for roll-ups)
- Business Rules:
  - Account number must be unique
  - Cannot delete account with transactions
  - Parent accounts cannot have direct postings (summary only)

**REQ-FIN-002: Standard Chart of Accounts Templates**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Pre-defined account structures
- Details:
  - Templates by industry (manufacturing, retail, services)
  - Templates by country (DR chart of accounts)
  - Customizable after import
  - Include typical accounts and structure
- Business Rules:
  - One-time import during setup
  - Can modify after import

**REQ-FIN-003: Cost Centers / Profit Centers**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track by department/division
- Details:
  - Cost center code and name
  - Cost center type: Production, Sales, Administration, Service
  - Department/division assignment
  - Responsible manager
  - Budget assignment
  - Active/inactive status
- Business Rules:
  - All expenses tagged to cost center
  - P&L by cost center

### 8.2 General Ledger

**REQ-FIN-010: Create Journal Entry**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record accounting transactions
- Details:
  - Journal entry number (auto-generated)
  - Entry date
  - Posting date
  - Fiscal period
  - Journal type: General, Sales, Purchase, Payment, Adjustment
  - Reference document
  - Description
  - Multiple lines (debit and credit):
    - Account
    - Cost center
    - Description
    - Debit amount
    - Credit amount
    - Currency
    - Exchange rate (if foreign currency)
  - Total debits = total credits (balanced)
  - Created by (user)
  - Entry status: Draft, Posted, Reversed
  - Attachments (supporting documents)
- Business Rules:
  - Must balance (debits = credits)
  - Cannot post to closed period
  - Cannot modify posted entries (reverse only)
  - Automatic numbering on posting

**REQ-FIN-011: Automatic Journal Entries**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: System-generated GL postings
- Details:
  - Auto-post from sub-ledgers:
    - Sales invoice → AR + Revenue + Tax
    - Purchase invoice → AP + Expense/Inventory + Tax
    - Payment → Bank + AR/AP
    - Goods receipt → Inventory + GR/IR clearing
    - Goods issue → COGS + Inventory
    - Production → WIP + Raw materials
    - Depreciation → Depreciation expense + Accumulated depreciation
    - Payroll → Salary expense + Payroll liabilities
  - Posting templates configurable
  - Review before posting (optional)
- Business Rules:
  - Sub-ledger posting creates GL entry automatically
  - Maintains document link (drill-back capability)

**REQ-FIN-012: Recurring Journal Entries**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Automate repetitive entries
- Details:
  - Entry template
  - Recurrence pattern (monthly, quarterly, yearly)
  - Auto-generation date
  - Variable amounts (fixed or formula)
  - Auto-post or review before posting
- Business Rules:
  - Used for: Rent, utilities, depreciation
  - Can override amount before posting

**REQ-FIN-013: Journal Entry Reversal**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Correct posted entries
- Details:
  - Reverse entry (create opposite entry)
  - Reversal date
  - Reversal reason
  - Link to original entry
  - Both entries visible in GL
- Business Rules:
  - Cannot delete posted entries
  - Reversal maintains audit trail

### 8.3 Accounts Payable (AP)

**REQ-FIN-020: AP Management**
- Priority: P0 (Must Have)
- Phase: MVP (integrated with Procurement)
- Description: Track amounts owed to suppliers
- Details:
  - Supplier invoices create AP balance
  - Payment reduces AP balance
  - AP aging (30, 60, 90, 90+ days)
  - Open items (unpaid invoices)
  - Payment due dates
  - Cash flow forecast (upcoming payments)
- Business Rules:
  - AP balance must match sum of open invoices
  - Payment terms determine due date

**REQ-FIN-021: Payment Proposals**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Suggest invoices to pay
- Details:
  - Filter by: Due date, discount date, supplier, amount
  - Respect available cash
  - Early payment discount calculation
  - Batch payment creation
  - Payment run approval
- Business Rules:
  - Prioritize by due date
  - Take discounts when beneficial

**REQ-FIN-022: Payment Processing**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Pay supplier invoices
- Details:
  - Payment method: Check, bank transfer, credit card, cash
  - Payment date
  - Bank account (source of funds)
  - Select invoices to pay
  - Partial payment support
  - Payment reference
  - Check printing
  - Electronic payment file generation (for bank)
  - Payment confirmation/reconciliation
- Business Rules:
  - Payment updates invoice status
  - GL posting: DR AP, CR Bank
  - Multi-currency payment with exchange gain/loss

### 8.4 Accounts Receivable (AR)

**REQ-FIN-030: AR Management**
- Priority: P0 (Must Have)
- Phase: MVP (integrated with Sales)
- Description: Track amounts owed by customers
- Details:
  - Sales invoices create AR balance
  - Customer payments reduce AR balance
  - AR aging (30, 60, 90, 90+ days)
  - Open items (unpaid invoices)
  - Overdue invoices
  - Payment due dates
  - Credit limit tracking
  - Bad debt provisions
- Business Rules:
  - AR balance must match sum of open invoices
  - Payment terms determine due date

**REQ-FIN-031: Payment Receipt**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record customer payments
- Details:
  - Payment method: Cash, check, transfer, credit card
  - Payment date
  - Bank account (where deposited)
  - Customer
  - Payment amount
  - Currency
  - Allocate to invoices
  - Unapplied amount (on account)
  - Payment reference
- Business Rules:
  - Payment updates invoice status
  - GL posting: DR Bank, CR AR
  - Multi-currency with exchange gain/loss

**REQ-FIN-032: Collections Management**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage overdue accounts
- Details:
  - Overdue invoice list
  - Collection status (reminder sent, in collection, legal)
  - Collection actions log
  - Dunning letters (auto-generated)
  - Collection priority
  - Customer contact history
  - Payment promises tracking
- Business Rules:
  - Auto-escalate based on days overdue
  - Dunning level (reminder 1, 2, 3, legal notice)

**REQ-FIN-033: Bad Debt Write-Off**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Write off uncollectible amounts
- Details:
  - Write-off date
  - Invoice to write off
  - Write-off amount (partial or full)
  - Write-off reason
  - Approval required
  - GL posting: DR Bad debt expense, CR AR
- Business Rules:
  - Approval required for write-offs >$X
  - Can attempt to collect after write-off
  - If collected later, reverse write-off

### 8.5 Bank Management

**REQ-FIN-040: Bank Account Master Data**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Register company bank accounts
- Details:
  - Bank account number
  - Bank name and branch
  - Account type: Checking, Savings, Credit card
  - Currency
  - GL account linkage
  - Current balance
  - Minimum balance alert
  - Checkbook management (starting/ending check numbers)
  - Account signatory
  - Active/inactive status
- Business Rules:
  - Bank account linked to GL account
  - Balance must match GL balance (after reconciliation)

**REQ-FIN-041: Bank Transactions**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record bank activity
- Details:
  - Transaction date
  - Transaction type: Deposit, Withdrawal, Fee, Interest, Transfer
  - Amount
  - Reference (check number, transfer ID)
  - Cleared date
  - Description
  - Reconciliation status: Unreconciled, Reconciled
- Business Rules:
  - All payments/receipts create bank transaction
  - Manual transactions for fees, interest

**REQ-FIN-042: Bank Reconciliation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Match bank statement to GL
- Details:
  - Bank statement import (CSV, OFX)
  - Statement date and ending balance
  - Automatic matching (by amount, reference, date)
  - Manual matching
  - Reconciliation differences:
    - Outstanding checks (issued but not cleared)
    - Deposits in transit (recorded but not on statement)
    - Bank fees not recorded
    - Errors
  - Reconciliation report
  - Adjust GL if needed
  - Mark as reconciled
- Business Rules:
  - GL balance + Outstanding - Deposits in transit = Bank balance
  - All bank items must eventually reconcile
  - Reconciliation monthly

### 8.6 Multi-Currency Accounting

**REQ-FIN-050: Currency Management**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Support multiple currencies
- Details:
  - Currency master (from multi-currency module)
  - Base currency (functional currency, e.g., DOP)
  - Exchange rates (daily rates)
  - Exchange rate types: Buying, Selling, Average
  - Automatic rate update (from central bank or manual)
  - Historical rates maintained
- Business Rules:
  - All amounts stored in transaction currency + base currency
  - Exchange rate locked on transaction date

**REQ-FIN-051: Foreign Currency Transactions**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Record transactions in foreign currency
- Details:
  - Transaction in foreign currency
  - Exchange rate at transaction date
  - Amount in transaction currency
  - Amount in base currency
  - Exchange difference on payment (realized gain/loss)
- Business Rules:
  - Invoice in USD, payment in USD → exchange rate at payment
  - Realized gain/loss posted to GL

**REQ-FIN-052: Currency Revaluation**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Revalue foreign currency balances
- Details:
  - Revaluation date (period-end)
  - Foreign currency balances (AR, AP, bank accounts)
  - Exchange rate at period-end
  - Unrealized gain/loss calculation
  - GL posting (unrealized gain/loss)
  - Reversal at start of next period
- Business Rules:
  - Unrealized gain/loss does not affect cash
  - Reverses next period (continuous revaluation)

### 8.7 Financial Reporting

**REQ-FIN-060: Balance Sheet**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Statement of financial position
- Details:
  - Assets (current + fixed)
  - Liabilities (current + long-term)
  - Equity
  - As of date
  - Comparative periods (prior year)
  - Drill-down to account detail
  - Export to Excel/PDF
- Business Rules:
  - Assets = Liabilities + Equity (must balance)
  - Multi-currency consolidation to base currency

**REQ-FIN-061: Income Statement (P&L)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Profit and loss statement
- Details:
  - Revenue
  - Cost of sales
  - Gross profit
  - Operating expenses (by category)
  - Operating profit (EBIT)
  - Other income/expense
  - Net profit before tax
  - Tax expense
  - Net profit after tax
  - Period selection (month, quarter, year, custom)
  - Comparative periods (prior year)
  - Variance analysis (actual vs budget, vs prior year)
  - By cost center/department
  - Drill-down to transactions
- Business Rules:
  - Revenue recognition per accounting standards
  - Expense matching principle

**REQ-FIN-062: Cash Flow Statement**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Statement of cash flows
- Details:
  - Operating activities (from operations)
  - Investing activities (capex, asset sales)
  - Financing activities (loans, dividends)
  - Net change in cash
  - Beginning cash + change = ending cash
  - Direct or indirect method
  - Period selection
- Business Rules:
  - Cash flow must reconcile to bank balance changes
  - Non-cash transactions excluded

**REQ-FIN-063: Trial Balance**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: List of all account balances
- Details:
  - Account number and name
  - Opening balance
  - Debits
  - Credits
  - Closing balance
  - As of date
  - Total debits = total credits
- Business Rules:
  - Starting point for financial statement preparation
  - Must balance

**REQ-FIN-064: General Ledger Report**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Detailed transaction listing
- Details:
  - Account selection
  - Date range
  - Transaction details:
    - Date, period
    - Document number
    - Description
    - Debit, credit
    - Balance
  - Running balance
  - Drill-down to source document
- Business Rules:
  - Complete audit trail
  - All transactions visible

**REQ-FIN-065: Aged Payables/Receivables**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Payment/collection status
- Details:
  - By supplier/customer
  - Aging buckets: Current, 1-30, 31-60, 61-90, 90+ days
  - Amount per bucket
  - Total outstanding
  - % of total
  - Overdue amounts highlighted
- Business Rules:
  - Aging based on due date, not invoice date
  - Real-time updates

**REQ-FIN-066: Financial Ratios & KPIs**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Key financial metrics
- Details:
  - Liquidity ratios (current ratio, quick ratio)
  - Profitability ratios (gross margin, net margin, ROA, ROE)
  - Efficiency ratios (inventory turnover, receivables turnover, payables turnover)
  - Leverage ratios (debt to equity, debt to assets)
  - Trend analysis
  - Industry benchmarks comparison
- Business Rules:
  - Auto-calculated from financial statements
  - Updated real-time

### 8.8 Budgeting

**REQ-FIN-070: Budget Preparation**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Create annual budgets
- Details:
  - Budget version (multiple scenarios)
  - Fiscal year
  - Budget by: Account, cost center, month
  - Top-down or bottom-up approach
  - Budget templates
  - Copy from prior year (with growth %)
  - Budget approval workflow
  - Budget status: Draft, Submitted, Approved, Active
- Business Rules:
  - One active budget per fiscal year
  - Can have multiple versions (scenarios)

**REQ-FIN-071: Budget vs Actual Reporting**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track performance vs plan
- Details:
  - Budget amount
  - Actual amount
  - Variance (amount and %)
  - Year-to-date budget vs actual
  - Forecast to year-end
  - By account, cost center, month
  - Variance analysis commentary
- Business Rules:
  - Favorable variance: Actual revenue > budget, actual expense < budget
  - Unfavorable variance: opposite
  - Alert for significant variances

### 8.9 Period Closing

**REQ-FIN-080: Period-End Close Process**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Monthly/yearly close procedures
- Details:
  - Close checklist:
    - Reconcile bank accounts
    - Reconcile sub-ledgers (AR, AP, Inventory)
    - Post depreciation
    - Post accruals and deferrals
    - Revalue foreign currency balances
    - Run trial balance
    - Generate financial statements
    - Review and approve
  - Period status: Open, Closing, Closed
  - Close date
  - Closed by (user)
  - Reopen capability (with approval)
- Business Rules:
  - Cannot post to closed period (except corrections with approval)
  - All sub-ledgers must match GL
  - Period must close in sequence (cannot close March if February open)

**REQ-FIN-081: Year-End Close**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Annual closing process
- Details:
  - All period-end procedures plus:
  - Close all P&L accounts (transfer to retained earnings)
  - Carry forward balance sheet balances
  - Reset P&L accounts to zero for new year
  - Physical inventory (if required)
  - Fixed asset verification
  - Generate annual reports
  - Tax preparation support
- Business Rules:
  - Cannot reopen after year-end close (except exceptional approval)
  - Retained earnings = prior retained earnings + net income

### 8.10 Tax Management (Dominican Republic)

**REQ-FIN-090: Tax Code Configuration**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define tax types and rates
- Details:
  - Tax code (ITBIS, ISR, etc.)
  - Tax type: Sales tax, withholding tax, excise tax
  - Tax rate (percentage)
  - Effective dates
  - GL accounts (tax payable/receivable)
  - Tax authority
  - Reporting frequency
- Business Rules:
  - Multiple tax codes supported
  - Tax rate changes preserve history

**REQ-FIN-091: ITBIS (Sales Tax) Management**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Dominican Republic sales tax
- Details:
  - Tax calculation on sales invoices
  - Tax calculation on purchase invoices
  - Tax collected (from customers)
  - Tax paid (to suppliers)
  - Net tax payable (collected - paid)
  - Tax return preparation (monthly form)
  - Tax payment tracking
- Business Rules:
  - Standard rate: 18% (as of 2026)
  - Some items exempt or zero-rated
  - Tax payable monthly to DGII

**REQ-FIN-092: Withholding Tax**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Tax withheld at source
- Details:
  - Withholding tax types (ISR, ITBIS retention)
  - Withholding rates (vary by service type)
  - Withheld from supplier payments
  - Withholding certificate generation
  - Payment to tax authority
  - Annual withholding report (Forma 606/607)
- Business Rules:
  - Withholding mandatory for certain services
  - Supplier receives net amount (invoice - withholding)
  - Company remits withholding to DGII

**REQ-FIN-093: Tax Reports (DGII Compliance)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Required tax filings
- Details:
  - Form 606 (purchases with NCF)
  - Form 607 (sales with NCF)
  - Monthly ITBIS return
  - Annual income tax return
  - Withholding reports
  - Electronic filing support
- Business Rules:
  - Reports must match GL
  - All NCF numbers must be reported
  - Monthly filing deadlines

---

## 9. MODULE 8: REPORTING & ANALYTICS

### 9.1 Standard Reports

**REQ-REP-001: Pre-Built Reports Library**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Comprehensive standard reports
- Details:
  - Reports by module:
    - Procurement: PO list, supplier performance, purchase analysis
    - Inventory: Stock status, movements, valuation, aging
    - Manufacturing: Production orders, BOM, cost variance
    - Sales: Sales analysis, customer aging, sales rep performance
    - Finance: Trial balance, P&L, balance sheet, cash flow
    - Maintenance: Work order status, equipment downtime
  - Parameters for filtering (date range, customer, item, etc.)
  - Output formats: Screen, PDF, Excel, CSV
  - Email delivery
  - Print options
- Business Rules:
  - Reports reflect real-time data
  - User access based on permissions

**REQ-REP-002: Report Scheduling**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Automate report generation
- Details:
  - Schedule frequency (daily, weekly, monthly)
  - Parameters saved with schedule
  - Distribution list (email)
  - Output format
  - Archive reports
- Business Rules:
  - Reports run at scheduled time
  - Failures logged and alerted

### 9.2 Custom Report Builder

**REQ-REP-010: Drag-and-Drop Report Designer**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: User-created reports
- Details:
  - Data source selection
  - Column selection
  - Filter builder
  - Grouping and subtotals
  - Sorting
  - Calculations and formulas
  - Chart insertion
  - Formatting options
  - Save as template
- Business Rules:
  - Users create reports for their own use
  - Share with team (optional)

**REQ-REP-011: Report Templates**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Reusable report layouts
- Details:
  - Save custom report as template
  - Template library
  - Public vs private templates
  - Template versioning
- Business Rules:
  - Templates speed up report creation
  - Admin can create public templates

### 9.3 Dashboards

**REQ-REP-020: Executive Dashboard**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: High-level KPIs
- Details:
  - Revenue (today, MTD, YTD)
  - Expenses (MTD, YTD)
  - Net profit (MTD, YTD)
  - Cash position
  - AR aging summary
  - AP aging summary
  - Top customers
  - Top products
  - Charts and graphs
  - Real-time data
- Business Rules:
  - Role-based (executive view)
  - Customizable widgets

**REQ-REP-021: Operational Dashboards**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Department-specific KPIs
- Details:
  - Sales dashboard: Pipeline, orders, quotes, targets
  - Production dashboard: WIP, completion rate, efficiency
  - Inventory dashboard: Stock levels, movements, shortages
  - Purchasing dashboard: PO status, spend analysis
  - Maintenance dashboard: Work orders, equipment status
  - Finance dashboard: Cash flow, AP/AR, budget variance
- Business Rules:
  - Users see relevant dashboard for their role
  - Drill-down to details

**REQ-REP-022: Dashboard Customization**
- Priority: P2 (Could Have)
- Phase: V2.0
- Description: Personalize dashboards
- Details:
  - Add/remove widgets
  - Resize and arrange
  - Choose metrics to display
  - Save custom layouts
  - Share with team
- Business Rules:
  - Each user can customize their view
  - Default layouts available

### 9.4 Analytics & Insights

**REQ-REP-030: Drill-Down Capability**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Navigate from summary to detail
- Details:
  - Click any summary figure
  - Show underlying transactions
  - Multi-level drill-down
  - Trace to source document
- Business Rules:
  - All reports support drill-down
  - User must have permission to see details

**REQ-REP-031: Comparative Analysis**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Period-over-period comparison
- Details:
  - Compare vs prior period (month, quarter, year)
  - Compare vs budget
  - Compare vs forecast
  - Variance amount and percentage
  - Trend charts
- Business Rules:
  - Consistent periods for valid comparison
  - Variance explained

**REQ-REP-032: Data Export**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Export data for external analysis
- Details:
  - Export formats: Excel, CSV, PDF
  - Export current view or full dataset
  - Maintain formatting in Excel
  - Include filters applied
- Business Rules:
  - Respect user permissions (cannot export restricted data)
  - Large exports queued (async)

**REQ-REP-033: Saved Searches**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Save frequent queries (NetSuite-style)
- Details:
  - Create filter criteria
  - Save with name
  - Run saved search anytime
  - Share with team
  - Schedule saved search
- Business Rules:
  - Saved searches simplify repetitive reports
  - Users manage their own searches

---

## 10. CROSS-CUTTING REQUIREMENTS

### 10.1 Multi-Tenancy

**REQ-SYS-001: Tenant Isolation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Complete data segregation
- Details:
  - Every table has tenant_id
  - Row-level security enforced
  - Application-level filtering
  - No cross-tenant data access
  - Tenant-specific configurations
- Business Rules:
  - Zero tolerance for data leakage
  - Tenant admin cannot see other tenants

**REQ-SYS-002: Multi-Tenant User Management**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Users belong to multiple tenants
- Details:
  - M:N relationship (UserTenant table)
  - User selects tenant at login
  - Switch tenant without re-login
  - Default tenant per user
  - User can have different roles per tenant
- Business Rules:
  - JWT contains selected tenant_id
  - All operations scoped to selected tenant

### 10.2 Multi-Currency

**REQ-SYS-010: Multi-Currency Support**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Native multi-currency throughout
- Details:
  - All transactions in transaction currency
  - Convert to base currency on posting
  - Exchange rates daily
  - Realized and unrealized gains/losses
  - Multi-currency reporting
- Business Rules:
  - Exchange rate locked at transaction date
  - Revaluation at period-end

### 10.3 Multi-Language (i18n)

**REQ-SYS-020: Internationalization**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Support multiple languages
- Details:
  - Languages: Spanish (es-DO), English (en-US)
  - User selects preferred language
  - All UI translated
  - All reports translated
  - Date/time formatting per locale
  - Number formatting per locale
  - Currency formatting per locale
- Business Rules:
  - Master data (customer names, etc.) not translated
  - UI labels and messages translated

**REQ-SYS-021: Translation Management**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage translations
- Details:
  - Translation database table
  - Translation keys
  - Add new languages
  - Update translations
  - Missing translation fallback (English)
- Business Rules:
  - Translations managed by admin
  - New languages added without code changes

### 10.4 Audit & Compliance

**REQ-SYS-030: Audit Trail**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Complete transaction history
- Details:
  - Every record tracks:
    - Created by, date
    - Updated by, date
    - Deleted by, date (soft delete)
  - Field-level change history (for critical data)
  - Document status changes logged
  - Approval history
  - User login/logout
- Business Rules:
  - Audit records cannot be deleted
  - Tamper-proof (append-only)

**REQ-SYS-031: GDPR Compliance**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Data protection regulation
- Details:
  - Right to access (user data export)
  - Right to deletion (anonymize data)
  - Consent management
  - Data retention policies
  - Data encryption (at rest and transit)
- Business Rules:
  - Delete user data on request (keep transactions anonymized)
  - Audit log of data access

### 10.5 Security

**REQ-SYS-040: Authentication**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Secure user authentication
- Details:
  - JWT tokens (15min access, 7d refresh)
  - Password hashing (bcrypt, cost 12)
  - Password policy (min 12 chars, complexity)
  - Failed login lockout (5 attempts, 15min)
  - Session timeout (30min inactivity)
  - 2FA optional (TOTP)
- Business Rules:
  - Strong passwords enforced
  - Account locked after failed attempts
  - 2FA recommended for admin users

**REQ-SYS-041: Authorization (RBAC)**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Role-based permissions
- Details:
  - Roles (Admin, Finance Manager, Warehouse Manager, etc.)
  - Permissions (Create, Read, Update, Delete per module)
  - Permission wildcards (INVENTORY:* for all inventory permissions)
  - User assigned to roles
  - Effective permissions calculated
- Business Rules:
  - Least privilege principle
  - No user without role (except super admin)

**REQ-SYS-042: Data Encryption**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Protect sensitive data
- Details:
  - Encryption at rest (AES-256)
  - Encryption in transit (TLS 1.3)
  - Sensitive fields encrypted (PII, financial)
  - Database encryption
- Business Rules:
  - All communication over HTTPS
  - Passwords never stored plaintext

### 10.6 Performance

**REQ-SYS-050: Response Time**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Fast user experience
- Details:
  - API response < 200ms (95th percentile)
  - Page load < 2 seconds
  - Database queries optimized
  - Caching strategy (Redis)
  - Pagination for large datasets
- Business Rules:
  - Performance testing before release
  - Slow query alerts

**REQ-SYS-051: Scalability**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Support growth
- Details:
  - Horizontal scaling (add servers)
  - Database read replicas
  - Load balancing
  - Queue for async jobs
  - Support 1000+ concurrent users
- Business Rules:
  - Stateless API servers
  - Auto-scaling based on load

---

**DOCUMENT END**

**Total Requirements Count:**
- Procurement: 71
- Inventory: 62
- Manufacturing: 53
- Sales: 81
- Distribution: 13
- Maintenance: 32
- Finance: 93
- Reporting: 13
- Cross-Cutting: 12

**TOTAL: 430 detailed functional requirements**

---

**Next Documents:**
- User Stories (by module)
- Non-Functional Requirements (detailed)
- SaaS Requirements (billing, metering, onboarding)
