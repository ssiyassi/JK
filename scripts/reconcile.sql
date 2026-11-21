-- Data fingerprint. Run against the laptop database and against D1; every value must match.
SELECT
  (SELECT COUNT(*) FROM orders) AS orders,
  (SELECT COUNT(*) FROM resellers) AS resellers,
  (SELECT COUNT(*) FROM stock_movement_history) AS stock_movements,
  (SELECT COUNT(*) FROM current_inventory) AS inventory_rows,
  (SELECT babiManis || '/' || babiAsin || '/' || sapiManis || '/' || sapiAsin FROM current_inventory WHERE id = 'current') AS inventory_now,
  (SELECT SUM(babiManis) || '/' || SUM(babiAsin) || '/' || SUM(sapiManis) || '/' || SUM(sapiAsin) || '/' || SUM(boxCounter) FROM orders WHERE orderStatus = 'ACTIVE') AS active_order_totals,
  (SELECT SUM(babiManisChanges) || '/' || SUM(babiAsinChanges) || '/' || SUM(sapiManisChanges) || '/' || SUM(sapiAsinChanges) FROM stock_movement_history) AS movement_change_totals,
  (SELECT MAX(date) FROM orders) AS latest_order_ms,
  (SELECT MAX(orderId) FROM orders WHERE length(orderId) = 12) AS max_order_id,
  (SELECT COUNT(*) FROM orders WHERE typeof(date) <> 'integer' OR typeof(createdAt) <> 'integer' OR typeof(updatedAt) <> 'integer') AS non_integer_dates;
