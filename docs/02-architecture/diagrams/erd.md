```mermaid
erDiagram

  "saas_tenants" {
    String id "🗝️"
    String code 
    String name 
    String legal_name "❓"
    String tax_id "❓"
    String subdomain "❓"
    String country 
    String industry "❓"
    String company_size "❓"
    String logo_url "❓"
    String primary_color "❓"
    String secondary_color "❓"
    String subscription_plan 
    String subscription_status 
    DateTime trial_starts_at "❓"
    DateTime trial_ends_at "❓"
    DateTime subscription_starts_at "❓"
    DateTime subscription_ends_at "❓"
    String default_currency 
    String default_language 
    Int fiscal_year_start 
    String timezone 
    String status 
    Json settings "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    }
  

  "saas_subscription_plans" {
    String id "🗝️"
    String code 
    String name 
    String description "❓"
    Decimal price_monthly 
    Decimal price_yearly 
    Json limits 
    Json features "❓"
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    }
  

  "saas_subscriptions" {
    String id "🗝️"
    String tenant_id 
    String plan_id 
    String status 
    String billing_cycle 
    DateTime current_period_start 
    DateTime current_period_end 
    DateTime trial_start "❓"
    DateTime trial_end "❓"
    DateTime cancelled_at "❓"
    String cancellation_reason "❓"
    DateTime created_at 
    DateTime updated_at 
    }
  

  "saas_invoices" {
    String id "🗝️"
    String tenant_id 
    String subscription_id "❓"
    String invoice_number 
    String status 
    Decimal subtotal 
    Decimal tax 
    Decimal total 
    String currency 
    DateTime invoice_date 
    DateTime due_date 
    DateTime paid_at "❓"
    String payment_method "❓"
    String stripe_invoice_id "❓"
    DateTime created_at 
    DateTime updated_at 
    }
  

  "saas_usage_records" {
    String id "🗝️"
    String tenant_id 
    String metric_name 
    Decimal quantity 
    DateTime recorded_at 
    }
  

  "auth_users" {
    String id "🗝️"
    String email 
    String password_hash 
    String first_name 
    String last_name 
    String phone "❓"
    String avatar_url "❓"
    String locale 
    String timezone 
    String status 
    DateTime email_verified_at "❓"
    DateTime last_login_at "❓"
    DateTime password_changed_at "❓"
    Boolean two_factor_enabled 
    String two_factor_secret "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    }
  

  "auth_user_tenants" {
    String id "🗝️"
    String user_id 
    String tenant_id 
    Boolean is_default 
    Boolean is_active 
    DateTime joined_at 
    DateTime created_at 
    DateTime updated_at 
    }
  

  "auth_roles" {
    String id "🗝️"
    String tenant_id 
    String code 
    String name 
    String description "❓"
    Boolean is_system 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "auth_permissions" {
    String id "🗝️"
    String code 
    String name 
    String description "❓"
    String module 
    DateTime created_at 
    DateTime updated_at 
    }
  

  "auth_role_permissions" {
    String id "🗝️"
    String role_id 
    String permission_id 
    DateTime created_at 
    }
  

  "auth_user_roles" {
    String id "🗝️"
    String user_id 
    String role_id 
    String tenant_id 
    DateTime created_at 
    }
  

  "mc_currencies" {
    String id "🗝️"
    String code 
    String name 
    String symbol 
    Int decimal_places 
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    }
  

  "mc_exchange_rates" {
    String id "🗝️"
    String from_currency 
    String to_currency 
    Decimal rate 
    DateTime effective_date 
    DateTime created_at 
    DateTime updated_at 
    }
  

  "i18n_languages" {
    String id "🗝️"
    String code 
    String name 
    String native_name 
    Boolean is_rtl 
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    }
  

  "i18n_translations" {
    String id "🗝️"
    String language_code 
    String translation_key 
    String translation_value 
    String context "❓"
    DateTime created_at 
    DateTime updated_at 
    }
  

  "po_suppliers" {
    String id "🗝️"
    String tenant_id 
    String code 
    String name 
    String legal_name "❓"
    String tax_id "❓"
    String phone "❓"
    String email "❓"
    String website "❓"
    String payment_terms "❓"
    String currency "❓"
    Decimal credit_limit "❓"
    String category "❓"
    Boolean is_active 
    String notes "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "po_purchase_orders" {
    String id "🗝️"
    String tenant_id 
    String po_number 
    String supplier_id 
    DateTime po_date 
    DateTime expected_date "❓"
    String delivery_address "❓"
    String payment_terms "❓"
    String currency "❓"
    Decimal exchange_rate 
    Decimal subtotal 
    Decimal discount_amount 
    Decimal tax_amount 
    Decimal subtotal 
    String status 
    String notes "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "po_purchase_order_lines" {
    String id "🗝️"
    String tenant_id 
    String purchase_order_id 
    Int line_number 
    String item_id 
    String description "❓"
    Decimal ordered_quantity 
    Decimal received_quantity 
    String uom 
    Decimal unit_price 
    Decimal discount_percent 
    String tax_code "❓"
    Decimal line_total 
    DateTime expected_date "❓"
    String status 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "in_items" {
    String id "🗝️"
    String tenant_id 
    String code 
    String name 
    String description "❓"
    String item_type 
    String category_id "❓"
    String base_uom 
    Boolean is_stockable 
    Boolean is_purchasable 
    Boolean is_saleable 
    Boolean is_manufacturable 
    Boolean is_lot_tracked 
    Boolean is_serial_tracked 
    Boolean is_expiry_tracked 
    String valuation_method 
    Decimal standard_cost "❓"
    Int lead_time_days 
    Decimal safety_stock 
    Decimal reorder_point 
    Decimal reorder_quantity 
    String default_supplier_id "❓"
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "in_warehouses" {
    String id "🗝️"
    String tenant_id 
    String code 
    String name 
    String warehouse_type 
    String address "❓"
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "in_stock" {
    String id "🗝️"
    String tenant_id 
    String item_id 
    String warehouse_id 
    Decimal on_hand_quantity 
    Decimal reserved_quantity 
    String lot_number "❓"
    String serial_number "❓"
    Decimal unit_cost "❓"
    DateTime updated_at 
    }
  

  "in_stock_movements" {
    String id "🗝️"
    String tenant_id 
    String movement_number 
    String movement_type 
    DateTime movement_date 
    String item_id 
    String from_warehouse_id "❓"
    String to_warehouse_id "❓"
    Decimal quantity 
    String uom 
    String lot_number "❓"
    String serial_number "❓"
    Decimal unit_cost "❓"
    String reference_type "❓"
    String reference_id "❓"
    String notes "❓"
    DateTime created_at 
    String created_by 
    }
  

  "mfg_boms" {
    String id "🗝️"
    String tenant_id 
    String parent_item_id 
    String bom_number 
    Int version 
    Boolean is_active 
    DateTime effective_from "❓"
    DateTime effective_to "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "mfg_bom_components" {
    String id "🗝️"
    String tenant_id 
    String bom_id 
    Int line_number 
    String component_item_id 
    Decimal quantity_per 
    String uom 
    Decimal scrap_percent 
    Boolean is_phantom 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "mfg_work_centers" {
    String id "🗝️"
    String tenant_id 
    String code 
    String name 
    String work_center_type 
    Decimal capacity_per_hour "❓"
    Decimal efficiency_percent 
    Decimal cost_per_hour "❓"
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "mfg_production_orders" {
    String id "🗝️"
    String tenant_id 
    String po_number 
    String item_id 
    String bom_id "❓"
    Decimal quantity_to_produce 
    Decimal quantity_produced 
    DateTime planned_start_date "❓"
    DateTime planned_end_date "❓"
    DateTime actual_start_date "❓"
    DateTime actual_end_date "❓"
    String status 
    String notes "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "so_customers" {
    String id "🗝️"
    String tenant_id 
    String code 
    String name 
    String legal_name "❓"
    String tax_id "❓"
    String phone "❓"
    String email "❓"
    String website "❓"
    Decimal credit_limit 
    String credit_status 
    String payment_terms "❓"
    String currency "❓"
    Boolean is_active 
    String notes "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "so_sales_orders" {
    String id "🗝️"
    String tenant_id 
    String so_number 
    String customer_id 
    DateTime order_date 
    String customer_po "❓"
    DateTime requested_date "❓"
    DateTime promised_date "❓"
    String payment_terms "❓"
    String currency "❓"
    Decimal exchange_rate 
    Decimal subtotal 
    Decimal discount_amount 
    Decimal tax_amount 
    Decimal total 
    String status 
    String notes "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "so_sales_order_lines" {
    String id "🗝️"
    String tenant_id 
    String sales_order_id 
    Int line_number 
    String item_id 
    String description "❓"
    Decimal ordered_quantity 
    Decimal reserved_quantity 
    Decimal shipped_quantity 
    String uom 
    Decimal unit_price 
    Decimal discount_percent 
    String tax_code "❓"
    Decimal line_total 
    DateTime delivery_date "❓"
    String status 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_accounts" {
    String id "🗝️"
    String tenant_id 
    String account_number 
    String name 
    String account_type 
    String account_category "❓"
    String parent_account_id "❓"
    String currency "❓"
    Boolean is_system 
    Boolean allow_manual_posting 
    Boolean require_reconciliation 
    Boolean is_active 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_journal_entries" {
    String id "🗝️"
    String tenant_id 
    String entry_number 
    DateTime entry_date 
    DateTime posting_date 
    String fiscal_period 
    String journal_type 
    String reference "❓"
    String description "❓"
    String status 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_journal_entry_lines" {
    String id "🗝️"
    String tenant_id 
    String journal_entry_id 
    Int line_number 
    String account_id 
    String description "❓"
    Decimal debit_amount 
    Decimal credit_amount 
    String currency "❓"
    Decimal exchange_rate 
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_fiscal_periods" {
    String id "🗝️"
    String tenant_id 
    String period_code 
    String period_name 
    DateTime start_date 
    DateTime end_date 
    String fiscal_year 
    String fiscal_quarter "❓"
    String status 
    Boolean is_current 
    DateTime closed_at "❓"
    String closed_by "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_budgets" {
    String id "🗝️"
    String tenant_id 
    String budget_code 
    String budget_name 
    String fiscal_year 
    String description "❓"
    String status 
    DateTime approved_at "❓"
    String approved_by "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_budget_lines" {
    String id "🗝️"
    String tenant_id 
    String budget_id 
    String account_id 
    String fiscal_period 
    Decimal budget_amount 
    String notes "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_cash_flow_projections" {
    String id "🗝️"
    String tenant_id 
    String projection_code 
    String projection_name 
    DateTime start_date 
    DateTime end_date 
    String scenario 
    String description "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  

  "ac_cash_flow_lines" {
    String id "🗝️"
    String tenant_id 
    String cash_flow_projection_id 
    DateTime line_date 
    String line_type 
    String category 
    Decimal amount 
    String description "❓"
    String account_id "❓"
    DateTime created_at 
    DateTime updated_at 
    DateTime deleted_at "❓"
    String created_by 
    String updated_by 
    String deleted_by "❓"
    }
  
    "saas_subscriptions" }o--|| saas_tenants : "tenant"
    "saas_subscriptions" }o--|| saas_subscription_plans : "plan"
    "saas_invoices" }o--|| saas_tenants : "tenant"
    "saas_invoices" }o--|o saas_subscriptions : "subscription"
    "saas_usage_records" }o--|| saas_tenants : "tenant"
    "auth_user_tenants" }o--|| auth_users : "user"
    "auth_user_tenants" }o--|| saas_tenants : "tenant"
    "auth_roles" }o--|| saas_tenants : "tenant"
    "auth_role_permissions" }o--|| auth_roles : "role"
    "auth_role_permissions" }o--|| auth_permissions : "permission"
    "auth_user_roles" }o--|| auth_users : "user"
    "auth_user_roles" }o--|| auth_roles : "role"
    "mc_exchange_rates" }o--|| mc_currencies : "fromCurrencyRelation"
    "mc_exchange_rates" }o--|| mc_currencies : "toCurrencyRelation"
    "i18n_translations" }o--|| i18n_languages : "language"
    "po_suppliers" }o--|| saas_tenants : "tenant"
    "po_suppliers" }o--|| auth_users : "createdByUser"
    "po_suppliers" }o--|| auth_users : "updatedByUser"
    "po_purchase_orders" }o--|| saas_tenants : "tenant"
    "po_purchase_orders" }o--|| po_suppliers : "supplier"
    "po_purchase_orders" }o--|| auth_users : "createdByUser"
    "po_purchase_orders" }o--|| auth_users : "updatedByUser"
    "po_purchase_order_lines" }o--|| saas_tenants : "tenant"
    "po_purchase_order_lines" }o--|| po_purchase_orders : "purchaseOrder"
    "po_purchase_order_lines" }o--|| in_items : "item"
    "in_items" }o--|| saas_tenants : "tenant"
    "in_items" }o--|| auth_users : "createdByUser"
    "in_items" }o--|| auth_users : "updatedByUser"
    "in_warehouses" }o--|| saas_tenants : "tenant"
    "in_stock" }o--|| saas_tenants : "tenant"
    "in_stock" }o--|| in_items : "item"
    "in_stock" }o--|| in_warehouses : "warehouse"
    "in_stock_movements" }o--|| saas_tenants : "tenant"
    "in_stock_movements" }o--|| in_items : "item"
    "in_stock_movements" }o--|o in_warehouses : "fromWarehouse"
    "mfg_boms" }o--|| saas_tenants : "tenant"
    "mfg_boms" }o--|| in_items : "parentItem"
    "mfg_bom_components" }o--|| saas_tenants : "tenant"
    "mfg_bom_components" }o--|| mfg_boms : "bom"
    "mfg_bom_components" }o--|| in_items : "componentItem"
    "mfg_work_centers" }o--|| saas_tenants : "tenant"
    "mfg_production_orders" }o--|| saas_tenants : "tenant"
    "so_customers" }o--|| saas_tenants : "tenant"
    "so_sales_orders" }o--|| saas_tenants : "tenant"
    "so_sales_orders" }o--|| so_customers : "customer"
    "so_sales_orders" }o--|| auth_users : "createdByUser"
    "so_sales_orders" }o--|| auth_users : "updatedByUser"
    "so_sales_order_lines" }o--|| saas_tenants : "tenant"
    "so_sales_order_lines" }o--|| so_sales_orders : "salesOrder"
    "so_sales_order_lines" }o--|| in_items : "item"
    "ac_accounts" }o--|| saas_tenants : "tenant"
    "ac_journal_entries" }o--|| saas_tenants : "tenant"
    "ac_journal_entry_lines" }o--|| saas_tenants : "tenant"
    "ac_journal_entry_lines" }o--|| ac_journal_entries : "journalEntry"
    "ac_journal_entry_lines" }o--|| ac_accounts : "account"
    "ac_fiscal_periods" }o--|| saas_tenants : "tenant"
    "ac_budgets" }o--|| saas_tenants : "tenant"
    "ac_budget_lines" }o--|| saas_tenants : "tenant"
    "ac_budget_lines" }o--|| ac_budgets : "budget"
    "ac_budget_lines" }o--|| ac_accounts : "account"
    "ac_cash_flow_projections" }o--|| saas_tenants : "tenant"
    "ac_cash_flow_lines" }o--|| saas_tenants : "tenant"
    "ac_cash_flow_lines" }o--|| ac_cash_flow_projections : "cashFlowProjection"
    "ac_cash_flow_lines" }o--|o ac_accounts : "account"
```
