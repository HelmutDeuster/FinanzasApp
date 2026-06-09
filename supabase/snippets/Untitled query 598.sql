-- ¿Cuántos movimientos tiene cada tarjeta en el ciclo actual (23 mayo - 22 junio)?
SELECT card_last_four, bank_source, COUNT(*)
FROM transactions
WHERE source = 'open-banking'
AND date >= '2026-05-23'
AND date <= '2026-06-22'
AND bank_source IN ('credit_card_unbilled', 'credit_card_billed')
GROUP BY card_last_four, bank_source
ORDER BY card_last_four;